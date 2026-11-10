// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { readPlanDir, knownFormat as getKnownFormat, PLAN_STATUS, IMPL_STATUS, EXECUTION, ADR_STATUS, LOG_KINDS, HANDOFF_STATUS } from './parse-plan.mjs';

/** @typedef {{file:string, line:number, severity:'error'|'warn', rule:string, message:string}} Issue */
/** @typedef {{id:string, since:number, severity:'error'|'warn', scope:'plan'|'impl'|'both'|'dir', check:(ctx:any)=>Issue[]}} Rule */

// Return only prose outside fenced code, HTML comments and inline code.
function prose(text) {
  let fence = null, comment = false;
  return text.replace(/\r\n?/g, '\n').split('\n').map(raw => {
    if (fence) { if (new RegExp('^\\s*' + fence + '{3,}').test(raw)) fence = null; return ''; }
    let visible = '', pos = 0;
    while (pos < raw.length) {
      if (comment) { const end = raw.indexOf('-->', pos); if (end < 0) break; pos = end + 3; comment = false; }
      else { const start = raw.indexOf('<!--', pos); if (start < 0) { visible += raw.slice(pos); break; } visible += raw.slice(pos, start); pos = start + 4; comment = true; }
    }
    const match = /^\s*(`{3,}|~{3,})/.exec(visible);
    if (match) { fence = match[1][0]; return ''; }
    return visible.replace(/(`+).*?\1/g, '');
  });
}

const issue = (ctx, line, message, file = ctx.file) => ({ file, line: line || 1, severity: ctx.rule.severity, rule: ctx.rule.id, message });
const rule = (id, since, severity, scope, check) => ({ id, since, severity, scope, check });
const duplicates = (ctx, items) => { const seen = new Set(); return items.flatMap(item => { if (seen.has(item.id)) return [issue(ctx, item.line, `Duplicate ${item.id}`)]; seen.add(item.id); return []; }); };

/** @type {Rule[]} */
export const RULES = [
  rule('header-status', 1, 'error', 'both', c => (c.doc.kind === 'plan' ? PLAN_STATUS : IMPL_STATUS).includes(c.doc.header.Status?.value) ? [] : [issue(c, c.doc.header.Status?.line, 'Missing or invalid Status')]),
  rule('task-heading', 1, 'error', 'impl', c => c.doc.malformed.filter(x => x.rule === 'task-heading').map(x => issue(c, x.line, x.text))),
  rule('task-duplicate', 1, 'error', 'impl', c => duplicates(c, c.doc.tasks)),
  rule('task-depends', 1, 'error', 'impl', c => c.doc.tasks.filter(t => t.dependsOn === null).map(t => issue(c, t.line, `${t.id} missing Depends on`))),
  rule('task-verify', 1, 'error', 'impl', c => c.doc.tasks.filter(t => !t.verify).map(t => issue(c, t.line, `${t.id} missing Verify`))),
  rule('task-dep-unknown', 1, 'error', 'impl', c => { const ids = new Set(c.doc.tasks.map(t => t.id)); return c.doc.tasks.flatMap(t => (t.dependsOn || []).filter(id => !ids.has(id)).map(id => issue(c, t.line, `${t.id} depends on unknown ${id}`))); }),
  rule('task-dep-cycle', 1, 'error', 'impl', c => {
    const tasks = new Map(c.doc.tasks.map(t => [t.id, t])), state = new Map(), stack = [], out = [];
    const visit = id => { state.set(id, 1); stack.push(id); const task = tasks.get(id); for (const dep of task.dependsOn || []) { if (!tasks.has(dep)) continue; if (state.get(dep) === 1) { const cycle = stack.slice(stack.indexOf(dep)).concat(dep); out.push(issue(c, tasks.get(dep).line, cycle.join(' → '))); } else if (!state.has(dep)) visit(dep); } stack.pop(); state.set(id, 2); };
    for (const id of tasks.keys()) if (!state.has(id)) visit(id);
    return out;
  }),
  rule('adr-duplicate', 1, 'error', 'plan', c => duplicates(c, c.doc.adrs)),
  rule('adr-status', 1, 'error', 'plan', c => c.doc.adrs.filter(a => !ADR_STATUS.test(a.status || '')).map(a => issue(c, a.line, `${a.id} missing or invalid Status`))),
  rule('adr-supersede-unknown', 1, 'error', 'plan', c => { const ids = new Set(c.doc.adrs.map(a => a.id)); return c.doc.adrs.flatMap(a => { const target = ADR_STATUS.exec(a.status || '')?.[2]; return target && !ids.has(target) ? [issue(c, a.line, `${a.id} supersedes unknown ${target}`)] : []; }); }),
  rule('log-format', 1, 'error', 'both', c => [...c.doc.malformed.filter(x => x.rule === 'log-format').map(x => issue(c, x.line, x.text)), ...c.doc.log.filter(x => !LOG_KINDS.includes(x.kind)).map(x => issue(c, x.line, `Unknown log kind ${x.kind}`))]),
  rule('log-task-unknown', 1, 'error', 'dir', c => { if (!c.dir.impl || c.newer.impl) return []; const ids = new Set(c.dir.impl.tasks.map(t => t.id)); return ['plan', 'impl'].flatMap(kind => !c.dir[kind] || c.newer[kind] ? [] : c.dir[kind].log.filter(x => x.task && !ids.has(x.task)).map(x => issue(c, x.line, `Unknown task ${x.task}`, `${kind}.md`))); }),
  rule('placeholder', 1, 'error', 'both', c => c.lines.flatMap((line, i) => line.includes('{{') ? [issue(c, i + 1, 'Unresolved placeholder')] : [])),
  rule('run-name', 1, 'error', 'dir', c => { const bad = c.dir.badRuns.map(id => issue(c, 1, `Invalid run name ${id}`, `runs/${id}`)); if (!c.dir.impl || c.newer.impl) return bad; const ids = new Set(c.dir.impl.tasks.map(t => t.id)); return bad.concat(c.dir.runs.filter(r => !ids.has(r.task)).map(r => issue(c, 1, `Unknown task ${r.task}`, `runs/${r.id}`))); }),
  rule('handoff-status', 1, 'error', 'dir', c => c.dir.runs.filter(r => r.handoff && !HANDOFF_STATUS.includes(r.handoff.status)).map(r => issue(c, r.handoff.line, 'Missing or invalid handoff Status', `runs/${r.id}/handoff.md`))),
  rule('impl-done-open-tasks', 1, 'error', 'impl', c => c.doc.header.Status?.value === 'done' ? c.doc.tasks.filter(t => t.status !== 'done' && !t.status.startsWith('dropped: ')).map(t => issue(c, t.line, `${t.id} is still open`)) : []),
  rule('impl-ahead-of-plan', 1, 'error', 'dir', c => c.dir.plan && c.dir.impl && !c.newer.plan && !c.newer.impl && c.dir.plan.header.Status?.value === 'draft' && ['approved', 'in-progress', 'done'].includes(c.dir.impl.header.Status?.value) ? [issue(c, c.dir.impl.header.Status.line, 'Implementation is ahead of draft plan', 'impl.md')] : []),
  rule('plan-aligned-proposed-adr', 1, 'error', 'plan', c => c.doc.header.Status?.value === 'aligned' ? c.doc.adrs.filter(a => a.status === 'proposed').map(a => issue(c, a.line, `${a.id} is proposed`)) : []),
  rule('frontmatter-invalid', 1, 'error', 'both', c => c.doc.malformed.filter(x => x.rule === 'frontmatter').map(x => issue(c, x.line, x.text))),
  rule('frontmatter', 2, 'error', 'both', c => !c.doc.frontmatter || c.doc.frontmatter.skill !== 'writing-dev-plans' ? [issue(c, 1, 'Missing frontmatter or invalid skill')] : []),
  rule('impl-execution', 2, 'error', 'impl', c => EXECUTION.includes(c.doc.header.Execution?.value) ? [] : [issue(c, c.doc.header.Execution?.line, 'Missing or invalid Execution')]),
  rule('plan-glance', 2, 'error', 'plan', c => c.doc.glance ? [] : [issue(c, 1, 'Missing At a Glance')]),
  rule('tbd', 1, 'warn', 'both', c => c.lines.flatMap((line, i) => /\b(TBD|TODO)\b/.test(line) ? [issue(c, i + 1, 'Unresolved TBD or TODO')] : [])),
  rule('open-question', 1, 'warn', 'plan', c => c.doc.header.Status?.value === 'aligned' ? c.doc.checkboxes.filter(x => !x.checked).map(x => issue(c, x.line, 'Open question in aligned plan')) : []),
  rule('doing-without-run', 1, 'warn', 'impl', c => c.doc.header.Execution?.value === 'subagents' ? c.doc.tasks.filter(t => t.status === 'doing' && !c.dir.runs.some(r => r.task === t.id)).map(t => issue(c, t.line, `${t.id} has no run`)) : []),
  rule('handoff-unlogged', 1, 'warn', 'dir', c => !c.dir.impl || c.newer.impl ? [] : c.dir.runs.filter(r => r.handoff && !c.dir.impl.log.some(x => x.task === r.task)).map(r => issue(c, 1, `${r.task} handoff not logged`, `runs/${r.id}/handoff.md`))),
  rule('format-newer', 1, 'warn', 'both', c => c.newer[c.doc.kind] ? [issue(c, 1, `Format ${c.doc.format} is newer than known format ${c.known}`)] : []),
];

/** @param {string} absDir @param {{asFormat?:number, knownFormat?:number}} [options] @returns {Issue[]} */
export function lintPlanDir(absDir, { asFormat, knownFormat = getKnownFormat() } = {}) {
  const dir = readPlanDir(absDir, { knownFormat });
  const newer = { plan: !!dir.plan && dir.plan.format > knownFormat, impl: !!dir.impl && dir.impl.format > knownFormat };
  const effective = kind => asFormat ?? dir[kind]?.format ?? 1;
  const issues = [];
  for (const rule of RULES) {
    if (rule.scope === 'dir') {
      const formats = ['plan', 'impl'].filter(kind => dir[kind]).map(effective);
      if (Math.min(...formats, Infinity) >= rule.since) issues.push(...rule.check({ dir, newer, rule, known: knownFormat, file: 'impl.md' }));
    } else {
      for (const kind of rule.scope === 'both' ? ['plan', 'impl'] : [rule.scope]) {
        const doc = dir[kind]; if (!doc || (newer[kind] && rule.id !== 'format-newer') || (!newer[kind] && rule.id === 'format-newer') || (rule.id !== 'frontmatter-invalid' && effective(kind) < rule.since)) continue;
        const file = `${kind}.md`;
        const lines = rule.id === 'placeholder' || rule.id === 'tbd' ? prose(fs.readFileSync(path.join(absDir, file), 'utf8')) : [];
        issues.push(...rule.check({ dir, doc, file, lines, newer, rule, known: knownFormat }));
      }
    }
  }
  return issues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
