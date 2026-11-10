// @ts-check
import { load } from './cdn.mjs';

/** @param {unknown} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** @param {string} url */
export async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** @param {(dir:string) => void} onChange */
export function subscribe(onChange) {
  const events = new EventSource('/events');
  events.addEventListener('change', event => {
    try { onChange(JSON.parse(event.data).dir); } catch { /* Ignore malformed events. */ }
  });
  return events;
}

/** Names Mermaid and Cytoscape code asks for, mapped to the viewer.css variables. */
const TOKEN_VARS = { bg: 'bg', surface: 'paper', 'surface-2': 'raised', fg: 'ink', muted: 'muted', border: 'line', accent: 'accent', success: 'success', warning: 'warning', error: 'error', 'font-sans': 'font', 'font-mono': 'font' };

export function cssTokens() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(TOKEN_VARS).map(([name, variable]) => [name, style.getPropertyValue(`--${variable}`).trim()]));
}

const TONES = { done: 'accepted', accepted: 'accepted', fresh: 'accepted', aligned: 'accepted', approved: 'accepted', doing: 'accent', 'in-progress': 'accent', proposed: 'accent', discovery: 'accent', change: 'accent', blocked: 'error', error: 'error', stale: 'warn', warn: 'warn', deviation: 'warn', 'needs-user': 'warn', done_with_concerns: 'warn', needs_context: 'warn' };

/** Badge modifier class for a status or log kind ('' when neutral). @param {unknown} status */
export function tone(status) {
  return TONES[String(status ?? '').toLowerCase().split(/[: ]/, 1)[0]] ?? '';
}

/** @param {string} md */
export async function renderMarkdown(md) {
  const [marked, purify, hljs] = await Promise.all([load('marked'), load('purify'), load('hljs')]);
  if (!marked || !purify) return `<pre class="md-raw">${esc(md)}</pre>`;
  const template = document.createElement('template');
  template.innerHTML = purify.sanitize(await marked.parse(md));
  if (hljs) {
    for (const code of template.content.querySelectorAll('pre code:not(.language-mermaid)')) {
      try {
        const language = [...code.classList].find(c => c.startsWith('language-'))?.slice(9);
        const result = language && hljs.getLanguage(language)
          ? hljs.highlight(code.textContent, { language })
          : hljs.highlightAuto(code.textContent);
        code.innerHTML = purify.sanitize(result.value);
        code.classList.add('hljs');
      } catch { /* Keep the original code. */ }
    }
  }
  return template.innerHTML;
}

/** @type {WeakMap<Element, string>} */
const diagramSources = new WeakMap();
let diagramId = 0;
let currentLook;

/** @param {ParentNode} root */
export async function renderDiagrams(root) {
  const diagrams = new Set([...root.querySelectorAll('pre.mermaid, code.language-mermaid')].map(el => el.matches('code') && el.parentElement?.tagName === 'PRE' ? el.parentElement : el));
  if (!diagrams.size) return;
  const [mermaid, elk] = await Promise.all([load('mermaid'), load('elk')]);
  const tokens = cssTokens();
  try { currentLook ??= localStorage.getItem('mermaid-look') || 'neo'; } catch { currentLook ??= 'neo'; }
  for (const el of diagrams) {
    const source = diagramSources.get(el) ?? el.textContent ?? '';
    diagramSources.set(el, source);
    el.classList.add('mermaid');
    try {
      if (!mermaid) throw new Error('Mermaid unavailable');
      if (elk) mermaid.registerLayoutLoaders(elk);
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', look: currentLook, ...(elk ? { layout: 'elk' } : {}), themeVariables: { primaryColor: tokens['surface-2'], primaryTextColor: tokens.fg, primaryBorderColor: tokens.accent, lineColor: tokens.muted, secondaryColor: tokens.surface, tertiaryColor: tokens.bg, fontFamily: tokens['font-sans'] } });
      const { svg } = await mermaid.render(`diagram-${++diagramId}`, source);
      el.innerHTML = svg;
      el.classList.remove('is-error');
      el.removeAttribute('title');
    } catch {
      el.textContent = source;
      el.classList.add('is-error');
      el.setAttribute('title', 'Diagram could not be rendered; showing source.');
    }
  }
}

/** @param {'neo'|'handDrawn'} look */
export function setLook(look) {
  currentLook = look;
  try { localStorage.setItem('mermaid-look', look); } catch { /* Storage may be unavailable. */ }
  void renderDiagrams(document);
}

/** @param {unknown} text @param {string} cls */
export function badge(text, cls) {
  return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
}
