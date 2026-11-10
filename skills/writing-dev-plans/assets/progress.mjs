// @ts-check
import { load } from './cdn.mjs';
import { badge, cssTokens, esc, tone } from './common.mjs';

/** @param {string} status */
const statusKind = status => status.split(':', 1)[0];
/** @param {number} done @param {number} total */
const bar = (done, total) => `<i role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="${done}/${total}"><b style="--value:${total ? done / total : 0}"></b></i>`;
/** @param {import('../scripts/lib/parse-plan.mjs').Task} task */
const taskDetail = task => `<div><strong>${esc(task.id)} · ${esc(task.name)}</strong><span>Depends on: ${esc(task.dependsOn?.join(', ') || 'none')}</span></div><div>${badge(task.status, tone(task.status))}<span>Verify: ${esc(task.verify || '—')}</span><span>Files: ${esc(task.files || '—')}</span></div>`;

/** @param {import('../scripts/lib/parse-plan.mjs').PlanDir} detail @param {HTMLElement} el */
export async function renderProgress(detail, el) {
  const impl = detail.impl;
  if (!impl || !impl.tasks.length) {
    el.innerHTML = '<div class="empty"><h2>进度不可用</h2><p>没有可解析的任务。</p></div>';
    return;
  }
  const tasks = impl.tasks;
  const byId = new Map(tasks.map(task => [task.id, task]));
  const counts = Object.fromEntries(['todo', 'doing', 'done', 'blocked', 'dropped'].map(status => [status, tasks.filter(task => statusKind(task.status) === status).length]));
  const logs = [...impl.log].sort((a, b) => b.at.localeCompare(a.at) || b.line - a.line);
  const needsUser = logs.filter(log => log.kind === 'needs-user');
  const attention = needsUser.map(log => `<li>${esc(log.at)} ${esc(log.task || '')} ${esc(log.text)}</li>`)
    .concat(tasks.filter(task => statusKind(task.status) === 'blocked').map(task => `<li>${esc(task.id)}: ${esc(task.name)} — ${esc(task.status)}</li>`));
  const path = (...parts) => parts.map(part => encodeURIComponent(part)).join('/');
  const runs = new Map();
  for (const run of detail.runs) {
    if (!runs.has(run.task)) runs.set(run.task, []);
    runs.get(run.task).push(run);
  }
  const subtitle = counts.done === tasks.length ? '全部完成' : counts.doing ? `${counts.doing} 个进行中` : counts.done ? '等待下一个任务' : '执行尚未开始';
  const runCards = [...runs].flatMap(([task, entries]) => entries.map(run => `<article class="run"><h3>${esc(task)} · attempt ${run.attempt} ${badge(run.handoff ? run.handoff.status || '—' : 'running', run.handoff ? tone(run.handoff.status) : 'accent')}</h3><p>${esc(run.id)} · Brief: ${run.hasBrief ? '有' : '无'}</p><p>Result: ${esc(run.handoff?.result || '—')}</p>${run.evidence.length ? `<ul>${run.evidence.map(file => `<li><a href="/files/${path(detail.dir, 'runs', run.id, ...file.split('/'))}">${esc(file)}</a></li>`).join('')}</ul>` : ''}</article>`));
  el.innerHTML = `
    ${attention.length ? `<section class="glance is-warn"><h2>需要关注</h2><ul>${attention.join('')}</ul></section>` : ''}
    <div class="progress-head"><div><strong>${counts.done} / ${tasks.length}</strong><span>${subtitle} · ${counts.blocked || needsUser.length ? `${counts.blocked} blocked / ${needsUser.length} needs-user` : '无 blocked / needs-user'}</span></div><div class="badges">${Object.entries(counts).map(([status, count]) => badge(`${status} · ${count}`, tone(status))).join('')}</div></div>
    ${impl.milestones.length ? `<section class="unit"><h2>Milestone progress</h2><div class="progress-list">${impl.milestones.map(milestone => {
      const done = milestone.tasks.filter(id => statusKind(byId.get(id)?.status || '') === 'done').length;
      return `<div><span>${esc(milestone.id)} · ${esc(milestone.name)}</span>${bar(done, milestone.tasks.length)}<strong>${done} / ${milestone.tasks.length}</strong></div>`;
    }).join('')}</div></section>` : ''}
    <section class="unit"><h2>Task dependencies</h2><p>点击任务查看依赖与验证命令。</p><div class="graph" aria-label="任务依赖图"></div><div class="task-detail" aria-live="polite"><strong>未选择任务</strong></div></section>
    ${runCards.length ? `<section class="unit"><h2>Runs &amp; evidence</h2><div class="runs">${runCards.join('')}</div></section>` : '<section class="empty"><h2>Runs &amp; evidence</h2><p>还没有执行记录。任务开始后，这里会显示 attempt、handoff、Result 与 evidence 链接。</p></section>'}
    ${logs.length ? `<section class="unit"><h2>Progress log</h2><ol class="log">${logs.map(log => `<li data-kind="${esc(log.kind)}"><time>${esc(log.at)}</time>${badge(log.kind, tone(log.kind))}<span>${esc(log.task || '')} ${esc(log.text)}</span></li>`).join('')}</ol></section>` : ''}`;

  const graph = el.querySelector('.graph');
  const selected = el.querySelector('.task-detail');
  const cytoscape = await load('cytoscape');
  try {
    if (!cytoscape) throw new Error('Graph library unavailable');
    // Layered left-to-right layout: x = longest dependency depth, y = row within the layer.
    // (cytoscape-dagre@2 from jsDelivr +esm throws at import, so no layout extension is used.)
    const depth = new Map();
    const levelOf = (task, seen = new Set()) => {
      if (depth.has(task.id)) return depth.get(task.id);
      if (seen.has(task.id)) return 0;
      seen.add(task.id);
      const d = Math.max(-1, ...(task.dependsOn || []).filter(id => byId.has(id)).map(id => levelOf(byId.get(id), seen))) + 1;
      depth.set(task.id, d);
      return d;
    };
    const rows = new Map();
    const position = Object.fromEntries(tasks.map(task => {
      const x = levelOf(task), y = rows.get(x) || 0;
      rows.set(x, y + 1);
      return [task.id, { x: x * 240 + 60, y: y * 90 + 40 }];
    }));
    const colors = cssTokens();
    const colorKey = { done: 'success', doing: 'accent', blocked: 'error', dropped: 'muted', todo: 'border' };
    const cy = cytoscape({
      container: graph,
      elements: [
        ...tasks.map(task => ({ data: { id: task.id, label: `${task.id}: ${task.name}`, color: colors[colorKey[statusKind(task.status)] || 'border'] } })),
        ...tasks.flatMap(task => (task.dependsOn || []).filter(id => byId.has(id)).map(id => ({ data: { source: id, target: task.id } }))),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': 'data(color)', color: colors.fg, 'font-family': colors['font-mono'], 'font-size': 11, 'border-width': 1, 'border-color': colors.border, 'text-valign': 'bottom', 'text-wrap': 'wrap', 'text-max-width': '140px' } },
        { selector: 'edge', style: { 'line-color': colors.muted, 'target-arrow-color': colors.muted, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
      ],
      layout: { name: 'preset', positions: node => position[node.id()], fit: true, padding: 30 },
    });
    cy.on('tap', 'node', event => { selected.innerHTML = taskDetail(byId.get(event.target.id())); });
  } catch (error) {
    console.error('task graph unavailable, showing table', error);
    graph.classList.add('is-table');
    graph.innerHTML = `<table><thead><tr><th>任务</th><th>状态</th><th>依赖</th></tr></thead><tbody>${tasks.map(task => `<tr><td>${esc(task.id)}: ${esc(task.name)}</td><td>${badge(task.status, tone(task.status))}</td><td>${esc((task.dependsOn || []).join(', ') || '—')}</td></tr>`).join('')}</tbody></table>`;
  }
}
