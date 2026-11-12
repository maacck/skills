// @ts-check
import { badge, esc, getJSON, renderDiagrams, renderMarkdown, setLook, subscribe, tone } from './common.mjs';
import { renderProgress } from './progress.mjs';

const dir = decodeURIComponent(location.pathname.slice('/p/'.length));
const names = ['plan', 'impl', 'progress', 'visual'];
const $ = id => document.getElementById(id);
const tabEls = names.map(name => $(`tab-${name}`));
const panels = Object.fromEntries(names.map(name => [name, $(`panel-${name}`)]));
const look = /** @type {HTMLSelectElement} */ ($('look'));
let detail;
let current = 'plan';
let visualFile = '';
/** @type {{tab:string, scrollY:number}|null} */
let visualReturn = null;

$('crumb-dir').textContent = dir;
try { look.value = localStorage.getItem('mermaid-look') === 'handDrawn' ? 'handDrawn' : 'neo'; } catch { /* Storage may be unavailable. */ }
look.addEventListener('change', () => setLook(look.value === 'handDrawn' ? 'handDrawn' : 'neo'));

/** @param {string} status */
const statusKind = status => String(status ?? '').split(':', 1)[0];
/** @param {string} md */
const markdown = async md => `<div class="md">${await renderMarkdown(md)}</div>`;
/** @param {{md:string}} unit */
const source = async unit => `<details class="source"><summary>原文</summary>${await markdown(unit.md)}</details>`;
const GROUP = { task: 'tasks', milestone: 'milestones' };

/** @param {import('../scripts/lib/parse-plan.mjs').Doc|null} doc @param {HTMLElement} el @param {string} file */
async function renderDoc(doc, el, file) {
  if (!doc) { el.innerHTML = '<div class="empty"><h2>文档不存在</h2><p>方案目录里没有这个文件。</p></div>'; return; }
  if (!doc.structured) {
    el.innerHTML = `<div class="banner is-warn">无法解析，显示原文</div>${await markdown(doc.units.map(unit => unit.md).join(''))}`;
    await renderDiagrams(el);
    return;
  }
  const adrs = new Map(doc.adrs.map(item => [item.id, item]));
  const tasks = new Map(doc.tasks.map(item => [item.id, item]));
  const milestones = new Map(doc.milestones.map(item => [item.id, item]));
  const implTasks = new Map((detail.impl?.tasks ?? []).map(item => [item.id, item]));
  const glanceId = doc.glance?.id;

  /** @param {string} label @param {string} key @param {any} adr @param {string} [cls] */
  const field = async (label, key, adr, cls = '') => adr.fields[key] ? `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${await markdown(adr.fields[key])}</dd></div>` : '';

  const parts = await Promise.all(doc.units.filter(unit => unit.kind !== 'header' && unit.id !== glanceId).map(async unit => {
    const id = esc(unit.id);
    const adr = unit.kind === 'adr' && adrs.get(unit.id);
    if (adr) return { unit, html: `<article class="decision" id="${id}"><header><h3>${esc(adr.id)} · ${esc(adr.title)}</h3>${badge(adr.status || '—', tone(adr.status))}</header><dl>${await field('Decision', 'Decision', adr)}${await field('Consequences', 'Consequences', adr)}${await field('Rejected', 'Rejected', adr, 'rejected')}</dl>${await source(unit)}</article>` };
    const task = unit.kind === 'task' && tasks.get(unit.id);
    if (task) return { unit, html: `<article id="${id}"><header><h3>${esc(task.id)} · ${esc(task.name)}</h3>${badge(task.status, tone(task.status))}</header><p>Depends on: ${esc(task.dependsOn === null ? '—' : task.dependsOn.join(', ') || 'none')}</p><ul>${task.steps.map(step => `<li>${step.done ? '☑' : '☐'} ${esc(step.text)}</li>`).join('')}</ul><p class="verify">Verify: ${esc(task.verify || '—')}</p>${task.files ? `<code>${esc(task.files)}</code>` : ''}${await source(unit)}</article>` };
    const milestone = unit.kind === 'milestone' && milestones.get(unit.id);
    if (milestone) {
      const done = milestone.tasks.filter(taskId => statusKind(implTasks.get(taskId)?.status) === 'done').length;
      return { unit, html: `<div id="${id}"><strong>${esc(milestone.id)} · ${esc(milestone.name)}</strong><span>${esc(milestone.tasks.join(', ') || '—')}</span><b>${done} / ${milestone.tasks.length}</b>${milestone.verify ? `<p class="verify">Verify: ${esc(milestone.verify)}</p>` : ''}${await source(unit)}</div>` };
    }
    return { unit, html: `<section class="unit" id="${id}">${await markdown(unit.md)}</section>` };
  }));

  let content = '';
  for (let i = 0; i < parts.length; i++) {
    const group = GROUP[parts[i].unit.kind];
    if (!group) { content += parts[i].html; continue; }
    let end = i;
    while (end < parts.length && parts[end].unit.kind === parts[i].unit.kind) end++;
    content += `<div class="${group}">${parts.slice(i, end).map(part => part.html).join('')}</div>`;
    i = end - 1;
  }

  const notes = [['Source', file], ['Status', doc.header.Status?.value ?? '—'], ['Format', doc.format]];
  if (doc.adrs.length) notes.splice(1, 0, ['Decisions', `${doc.adrs.length} ADR`]);
  if (doc.tasks.length) notes.splice(1, 0, ['Tasks', doc.tasks.length]);
  if (doc.milestones.length) notes.splice(1, 0, ['Milestones', doc.milestones.length]);
  const sections = parts.filter(part => part.unit.kind === 'section');
  el.innerHTML = `${doc.header.Goal ? `<div class="section-lead"><h2>${esc(doc.title || file)}</h2><p>${esc(doc.header.Goal.value)}</p></div>` : ''}
    ${doc.glance ? `<section class="glance" id="${esc(glanceId)}">${await markdown(doc.glance.md)}</section>` : ''}
    <div class="document"><div class="content">${content}</div>
      <aside class="rail">
        <section><h2>Sheet notes</h2><dl>${notes.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>
        ${sections.length ? `<section><h2>On this sheet</h2><nav>${sections.map(part => `<a href="#${esc(part.unit.id)}" data-jump="${esc(part.unit.id)}">${esc(part.unit.title || part.unit.id)}</a>`).join('')}</nav></section>` : ''}
      </aside></div>`;
  // Jump in place: a real hash change would be read as a tab switch.
  el.querySelectorAll('[data-jump]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    document.getElementById(link.getAttribute('data-jump') ?? '')?.scrollIntoView();
  }));
  await renderDiagrams(el);
}

function renderChrome() {
  const { plan, impl } = detail;
  const tasks = impl?.tasks ?? [];
  const done = tasks.filter(task => statusKind(task.status) === 'done').length;
  const title = plan?.title || impl?.title || dir;
  $('title').textContent = title;
  document.title = `${title} · Plan Viewer`;
  const date = plan?.header.Date?.value ?? impl?.header.Date?.value;
  $('meta').textContent = `.plans/${dir}${date ? ` · ${date}` : ''}`;
  const formats = [...new Set([plan?.format, impl?.format].filter(Boolean))];
  $('head-badges').innerHTML = [
    plan ? badge(`PLAN · ${plan.header.Status?.value ?? 'unavailable'}`, tone(plan.header.Status?.value)) : '',
    impl ? badge(`IMPL · ${impl.header.Status?.value ?? 'unavailable'}`, tone(impl.header.Status?.value)) : '',
    impl?.header.Execution ? badge(impl.header.Execution.value, 'accent') : '',
    ...formats.map(format => badge(`format ${format}`, '')),
  ].join('');
  const visuals = detail.visualStatus;
  $('count-plan').textContent = `${plan?.adrs.length ?? 0} ADR`;
  $('count-impl').textContent = `${tasks.length} TASKS`;
  $('count-progress').textContent = `${done} / ${tasks.length}`;
  $('count-visual').textContent = !visuals.length ? 'EMPTY' : visuals.every(item => item.state === 'fresh' && !item.missing.length) ? `${visuals.length} DOC` : 'STALE';
  $('st-dir').textContent = dir;
  $('st-status').textContent = plan?.header.Status?.value ?? impl?.header.Status?.value ?? '—';
  $('st-tasks').textContent = `${done} / ${tasks.length} tasks`;

  const issues = detail.lint;
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.filter(issue => issue.severity === 'warn').length;
  $('lint').innerHTML = `<details class="banner ${errors ? 'is-error' : warnings ? 'is-warn' : ''}"><summary>Lint: ${errors} errors · ${warnings} warnings</summary>${issues.length ? `<ul>${issues.map(issue => `<li>${esc(issue.file)}:${issue.line} ${badge(issue.severity, issue.severity === 'error' ? 'error' : 'warn')} ${esc(issue.rule)} ${esc(issue.message)}</li>`).join('')}</ul>` : '<p>没有 lint 问题。</p>'}</details>`;
}

function renderVisual() {
  const el = panels.visual;
  const items = detail.visualStatus;
  if (!items.length) {
    visualFile = '';
    el.innerHTML = '<div class="visual-reader"><div class="visual-toolbar"><span class="visual-status">没有 Visual 文档</span><button type="button" class="visual-exit" data-exit-visual><kbd>Esc</kbd> 退出沉浸阅读</button></div><div class="empty"><h2>还没有 Visual 文档</h2><p>让 agent 为这个方案生成 visual-plan.html 或 visual-impl.html；生成后会在这里以独立样式的 iframe 显示。</p></div></div>';
    return;
  }
  if (!items.some(item => item.file === visualFile)) visualFile = items[0].file;
  const item = items.find(entry => entry.file === visualFile);
  const version = detail.visuals.find(visual => visual.file === visualFile)?.mtime;
  const src = `/files/${encodeURIComponent(dir)}/${encodeURIComponent(visualFile)}?v=${encodeURIComponent(String(version ?? ''))}`;
  if (!el.querySelector('#visual-frame')) el.innerHTML = '<div class="visual-reader"><div class="visual-toolbar"><div class="visual-doc-switch" role="group" aria-label="选择 Visual 文档"></div><div class="visual-status"></div><button type="button" class="visual-exit" data-exit-visual><kbd>Esc</kbd> 退出沉浸阅读</button></div><iframe id="visual-frame" title="Visual 文档" sandbox="allow-scripts allow-popups"></iframe></div>';
  el.querySelector('.visual-doc-switch').innerHTML = items.map(entry => `<button type="button" data-visual-doc="${esc(entry.file)}" aria-pressed="${entry.file === visualFile}">${esc(entry.file)}</button>`).join('');
  const detailOf = key => item[key].length ? `${key} ${item[key].length}` : '';
  const summary = ['changed', 'added', 'removed'].map(detailOf).filter(Boolean).join(' · ');
  const title = ['changed', 'added', 'removed'].filter(key => item[key].length).map(key => `${key}: ${item[key].join(', ')}`).join('\n');
  const problem = (list, label) => list.length ? badge(`${list.length} ${label}`, 'error').replace('<span', `<span title="${esc(list.join('\n'))}"`) : '';
  el.querySelector('.visual-status').innerHTML = `${badge(item.state, tone(item.state))}${summary ? `<span title="${esc(title)}">${esc(summary)}</span>` : ''}${problem(item.missing, '处原文未覆盖')}${problem(item.broken, '个 data-src 失效')}`;
  const frame = el.querySelector('iframe');
  if (!frame.dataset.themed) { frame.dataset.themed = '1'; frame.addEventListener('load', postTheme); }
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
}

// The sandboxed iframe cannot read the viewer's theme, so send it.
function postTheme() {
  document.getElementById('visual-frame')?.contentWindow?.postMessage({ type: 'plan-theme', theme: document.documentElement.dataset.theme }, '*');
}

function crumbFile(tab) {
  $('crumb-file').textContent = tab === 'visual' ? visualFile || 'visual' : { plan: 'plan.md', impl: 'impl.md', progress: 'progress' }[tab];
}

function hashTab() {
  const requested = location.hash.slice(1).toLowerCase();
  return names.includes(requested) && (requested !== 'progress' || detail.impl?.tasks.length) ? requested : 'plan';
}

async function show() {
  if (!detail) return;
  const tab = hashTab();
  const entering = tab === 'visual' && current !== 'visual';
  const leaving = current === 'visual' && tab !== 'visual';
  if (entering) visualReturn = { tab: current, scrollY: window.scrollY };
  current = tab;
  document.body.dataset.panel = tab;
  document.body.classList.toggle('is-visual-open', tab === 'visual');
  names.forEach((name, i) => {
    tabEls[i].hidden = name === 'progress' && !detail.impl?.tasks.length;
    tabEls[i].setAttribute('aria-selected', String(name === tab));
    tabEls[i].tabIndex = name === tab ? 0 : -1;
    panels[name].hidden = name !== tab;
  });
  if (tab === 'visual') {
    renderVisual();
    crumbFile(tab);
    if (entering) requestAnimationFrame(() => /** @type {HTMLElement|null} */ (document.querySelector('[data-exit-visual]'))?.focus({ preventScroll: true }));
    return;
  }
  crumbFile(tab);
  // Keep each render in its own mounted container so graph libraries can measure it.
  const content = document.createElement('div');
  panels[tab].replaceChildren(content);
  if (tab === 'progress') await renderProgress(detail, content);
  else await renderDoc(detail[tab], content, `${tab}.md`);
  if (leaving && visualReturn) {
    window.scrollTo(0, visualReturn.scrollY);
    $('tab-visual').focus({ preventScroll: true });
  }
}

async function refresh() {
  try {
    detail = await getJSON(`/api/plans/${encodeURIComponent(dir)}`);
    renderChrome();
    const x = window.scrollX, y = window.scrollY;
    await show();
    window.scrollTo(x, y);
  } catch (error) {
    $('lint').innerHTML = `<div class="banner is-error">无法加载方案：${esc(error.message)}</div>`;
  }
}

const exitVisual = () => { location.hash = visualReturn?.tab ?? 'plan'; };
tabEls.forEach(tab => tab.addEventListener('click', () => { location.hash = /** @type {string} */ (tab.dataset.tab); }));
document.querySelector('.tabs').addEventListener('keydown', event => {
  const visible = tabEls.filter(tab => !tab.hidden);
  const index = visible.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  const key = /** @type {KeyboardEvent} */ (event).key;
  const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: visible.length - 1 }[key];
  if (index < 0 || next === undefined) return;
  event.preventDefault();
  const target = visible[(next + visible.length) % visible.length];
  location.hash = /** @type {string} */ (target.dataset.tab);
  target.focus();
});
panels.visual.addEventListener('click', event => {
  const target = /** @type {HTMLElement} */ (event.target).closest('[data-exit-visual], [data-visual-doc]');
  if (!target) return;
  if (target.hasAttribute('data-exit-visual')) { exitVisual(); return; }
  visualFile = target.getAttribute('data-visual-doc') ?? visualFile;
  renderVisual();
  crumbFile('visual');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && current === 'visual') exitVisual(); });
window.addEventListener('hashchange', () => { if (detail && names.includes(location.hash.slice(1).toLowerCase())) void show(); });
// Diagrams and graphs read theme colors at render time; redraw when the theme flips.
new MutationObserver(() => { postTheme(); if (detail && current !== 'visual') void show(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
subscribe(changed => { if (changed === dir) void refresh(); });
void refresh();
