// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TASK_HEADING = /^### (T\d+): (.+?) \[(todo|doing|done|blocked: .+|dropped: .+)\]\s*$/;
export const TASK_LIKE = /^### T\d/;
export const ADR_HEADING = /^### (ADR-\d+): (.+)$/;
export const ADR_STATUS = /^(proposed|accepted|superseded by (ADR-\d+))$/;
export const LOG_LIKE = /^(?:- )?\d{4}-\d{2}-\d{2} \d{2}:\d{2} ·/;
export const LOG_ENTRY = /^(?:- )?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (?:(T\d+) )?([a-z-]+)(?: · (.*))?$/;
export const LOG_KINDS = ['done', 'discovery', 'deviation', 'needs-user', 'change'];
export const PLAN_STATUS = ['draft', 'aligned', 'superseded'];
export const IMPL_STATUS = ['draft', 'approved', 'in-progress', 'done'];
export const EXECUTION = ['inline', 'subagents'];
export const RUN_DIR = /^(T\d+)-(\d+)$/;
export const HANDOFF_STATUS = ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'];
export const GLANCE_TITLE = 'At a Glance';

/** @param {string} title */
export function slugify(title) {
  const s = title.normalize('NFKC').toLowerCase().replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'section';
}

/** Parse a normalized Markdown document without throwing.
 * @param {string} text @param {'plan'|'impl'} kind @param {{knownFormat?:number}} [options]
 */
export function parseDoc(text, kind, { knownFormat: known = 2 } = {}) {
  const empty = () => ({ kind, format: 1, frontmatter: null, title: null, header: {}, units: [], tasks: [], adrs: [], milestones: [], log: [], checkboxes: [], glance: null, malformed: [], structured: false });
  try {
    text = text.replace(/\r\n?/g, '\n');
    const doc = empty();
    const lines = text.split('\n');
    let start = 0;
    if (text.startsWith('---\n')) {
      const end = lines.indexOf('---', 1);
      const fields = {};
      let invalid = end < 0;
      const last = end < 0 ? lines.length : end;
      for (let i = 1; i < last; i++) {
        const match = /^([^:]+):\s*(.*)$/.exec(lines[i]);
        if (!match || !match[1].trim()) invalid = true;
        else fields[match[1].trim()] = match[2].trim();
      }
      doc.frontmatter = fields;
      if (!/^[1-9]\d*$/.test(fields.format || '') || !Number.isSafeInteger(Number(fields.format))) invalid = true;
      if (invalid) doc.malformed.push({ rule: 'frontmatter', line: 1, text: 'Invalid frontmatter' });
      else doc.format = Number(fields.format);
      start = end < 0 ? 0 : end + 1;
    }
    const counts = new Map();
    let unit = { id: 'header', kind: 'header', title: '', level: 0, line: start + 1, md: '' };
    doc.units.push(unit);
    let unitStart = start;
    let currentTask = null, currentAdr = null, currentMilestone = null, adrField = null;
    let fence = null, inComment = false;
    for (let i = start; i < lines.length; i++) {
      const raw = lines[i];
      if (fence) {
        if (new RegExp('^\\s*' + fence + '{3,}').test(raw)) fence = null;
        continue;
      }
      let visible = '', cursor = 0;
      while (cursor < raw.length) {
        if (inComment) {
          const end = raw.indexOf('-->', cursor);
          if (end < 0) break;
          cursor = end + 3; inComment = false;
        } else {
          const begin = raw.indexOf('<!--', cursor);
          if (begin < 0) { visible += raw.slice(cursor); break; }
          visible += raw.slice(cursor, begin); cursor = begin + 4; inComment = true;
        }
      }
      const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(visible);
      if (fenceMatch) { fence = fenceMatch[1][0]; continue; }
      const heading = /^(#{2,4}) (.+)$/.exec(visible);
      if (heading) {
        unit.md = lines.slice(unitStart, i).map(line => line + '\n').join('');
        const title = heading[2].trim();
        const idMatch = /^(ADR-\d+|T\d+|M\d+):/.exec(title);
        const base = idMatch ? idMatch[1] : `sec:${slugify(title)}`;
        const count = (counts.get(base) || 0) + 1; counts.set(base, count);
        const taskMatch = TASK_HEADING.exec(visible);
        const adrMatch = ADR_HEADING.exec(visible);
        const milestoneMatch = /^### (M\d+): (.+)$/.exec(visible);
        unit = { id: count === 1 ? base : `${base}-${count}`, kind: taskMatch ? 'task' : adrMatch ? 'adr' : milestoneMatch ? 'milestone' : 'section', title, level: heading[1].length, line: i + 1, md: '' };
        doc.units.push(unit); unitStart = i;
        currentTask = taskMatch ? { id: taskMatch[1], name: taskMatch[2], status: taskMatch[3], line: i + 1, dependsOn: null, verify: null, files: null, steps: [] } : null;
        currentAdr = adrMatch ? { id: adrMatch[1], title: adrMatch[2], status: null, line: i + 1, fields: {} } : null;
        currentMilestone = milestoneMatch ? { id: milestoneMatch[1], name: milestoneMatch[2], tasks: [], verify: null, line: i + 1 } : null;
        adrField = null;
        if (currentTask) doc.tasks.push(currentTask);
        if (currentAdr) doc.adrs.push(currentAdr);
        if (currentMilestone) doc.milestones.push(currentMilestone);
        if (unit.level === 2 && title === GLANCE_TITLE) doc.glance = unit;
      }
      if (TASK_LIKE.test(visible) && !TASK_HEADING.test(visible)) doc.malformed.push({ rule: 'task-heading', line: i + 1, text: raw });
      if (LOG_LIKE.test(visible)) {
        const match = LOG_ENTRY.exec(visible);
        if (match) doc.log.push({ line: i + 1, at: match[1], task: match[2] || null, kind: match[3], text: match[4] || '' });
        else doc.malformed.push({ rule: 'log-format', line: i + 1, text: raw });
      }
      if (unit.kind === 'header') {
        const title = /^# (.+)$/.exec(visible);
        if (title && doc.title === null) doc.title = title[1].trim();
        const field = /^- ([^:]+):\s*(.*)$/.exec(visible);
        if (field) doc.header[field[1]] = { value: field[2].trim(), line: i + 1 };
      }
      const field = /^- ([^:]+):\s*(.*)$/.exec(visible);
      if (currentTask && field) {
        const value = field[2].trim();
        if (field[1] === 'Depends on') currentTask.dependsOn = value === 'none' ? [] : value.split(',').map(s => s.trim()).filter(Boolean);
        if (field[1] === 'Verify') currentTask.verify = value;
        if (field[1] === 'Files') currentTask.files = value;
      }
      if (currentMilestone && field) {
        if (field[1] === 'Tasks') currentMilestone.tasks = field[2].split(',').map(s => s.trim()).filter(Boolean);
        if (field[1] === 'Verify') currentMilestone.verify = field[2].trim();
      }
      if (currentAdr) {
        if (field) { adrField = field[1]; currentAdr.fields[adrField] = field[2].trim(); if (adrField === 'Status') currentAdr.status = field[2].trim(); }
        else if (adrField && /^  \S/.test(visible)) currentAdr.fields[adrField] += '\n' + visible.trim();
      }
      const checkbox = /^\s*- \[([ xX])\]\s*(.*)$/.exec(visible);
      if (checkbox) {
        if (currentTask) currentTask.steps.push({ done: checkbox[1].toLowerCase() === 'x', text: checkbox[2], line: i + 1 });
        else doc.checkboxes.push({ checked: checkbox[1].toLowerCase() === 'x', text: checkbox[2], line: i + 1 });
      }
    }
    unit.md = lines.slice(unitStart).join('\n');
    doc.structured = doc.format <= known && !!doc.header.Status;
    return doc;
  } catch {
    const doc = empty();
    doc.units.push({ id: 'header', kind: 'header', title: '', level: 0, line: 1, md: typeof text === 'string' ? text : String(text) });
    return doc;
  }
}

/** @returns {number} */
export function knownFormat() {
  const template = fs.readFileSync(fileURLToPath(new URL('../../templates/plan.md', import.meta.url)), 'utf8');
  return parseDoc(template, 'plan').format;
}

/** @param {string} absDir @param {{knownFormat?:number}} [options] */
export function readPlanDir(absDir, { knownFormat: known = knownFormat() } = {}) {
  const read = name => { try { return fs.readFileSync(path.join(absDir, name), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const planText = read('plan.md'), implText = read('impl.md');
  const runs = [], badRuns = [], visuals = [];
  const runRoot = path.join(absDir, 'runs');
  const entries = fs.existsSync(runRoot) ? fs.readdirSync(runRoot, { withFileTypes: true }) : [];
  const filesUnder = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(prefix, entry.name), full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full, rel) : entry.isFile() ? [rel] : [];
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = RUN_DIR.exec(entry.name);
    if (!match) { badRuns.push(entry.name); continue; }
    const base = path.join('runs', entry.name);
    const handoffText = read(path.join(base, 'handoff.md'));
    const status = handoffText?.match(/^- Status: (.+)$/m), result = handoffText?.match(/^- Result: (.+)$/m);
    const evidenceDir = path.join(absDir, base, 'evidence');
    runs.push({ id: entry.name, task: match[1], attempt: Number(match[2]), hasBrief: fs.existsSync(path.join(absDir, base, 'brief.md')), handoff: handoffText === null ? null : { status: status?.[1] ?? null, result: result?.[1] ?? null, line: status ? handoffText.slice(0, status.index).split('\n').length : null }, evidence: fs.existsSync(evidenceDir) ? filesUnder(evidenceDir).map(file => path.join('evidence', file)) : [] });
  }
  for (const file of ['visual-plan.html', 'visual-impl.html']) {
    const full = path.join(absDir, file);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) visuals.push({ file, mtime: fs.statSync(full).mtimeMs });
  }
  const allFiles = fs.existsSync(absDir) ? filesUnder(absDir) : [];
  const mtime = allFiles.reduce((max, file) => Math.max(max, fs.statSync(path.join(absDir, file)).mtimeMs), 0);
  return { dir: path.basename(absDir), path: absDir, plan: planText === null ? null : parseDoc(planText, 'plan', { knownFormat: known }), impl: implText === null ? null : parseDoc(implText, 'impl', { knownFormat: known }), runs, badRuns, visuals, mtime };
}
