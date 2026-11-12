// @ts-check
// Markdown block tree with verbatim line ranges, and the selector language visual documents use to
// cite source (`data-src`). Grammar: step (">" step)*.
//   heading step: bare or "quoted" heading text, or the heading's leading id before ":"/"：" (ADR-3, T4, A);
//                 optional [n] picks the nth match. The first step searches every depth; later steps match children.
//   block step:   p | li | tr | code | quote | table, then any of [n] [n..m] [lang=x] :has("text").
//                 First step = blocks before the first section. li > li walks nested lists; table > tr picks rows.

/** @typedef {{kind:string, start:number, end:number, text?:string, depth?:number, lang?:string, children:MdNode[], blocks:MdNode[], parent?:MdNode}} MdNode */

const ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}/;
const BLOCK_KINDS = ['p', 'li', 'tr', 'code', 'quote', 'table'];

export class SelectorError extends Error {}

/** @param {string} text */
export function parseTree(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  if (lines[0] === '---') { const end = lines.indexOf('---', 1); if (end > 0) i = end + 1; }
  /** @type {MdNode} */
  const root = { kind: 'root', text: '', depth: 0, start: i, end: lines.length, children: [], blocks: [] };
  const stack = [root];
  const cur = () => stack[stack.length - 1];
  const node = (kind, start, end, extra = {}) => ({ kind, start, end, children: [], blocks: [], ...extra });
  const startsBlock = l => /^#{1,6}\s/.test(l) || FENCE.test(l) || /^\s*[|>]/.test(l) || ITEM.test(l) || /^\s*<!--/.test(l);

  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(l);
    if (h && h[1].length === 1) { cur().blocks.push(node('title', i, i + 1)); i++; continue; }
    if (h) {
      const depth = h[1].length;
      while (cur().depth >= depth) stack.pop().end = i;
      const sec = node('section', i, lines.length, { text: h[2], depth, parent: cur() });
      cur().children.push(sec); stack.push(sec); i++; continue;
    }
    let j = i + 1;
    if (/^\s*<!--/.test(l)) {
      j = i; while (j < lines.length && !lines[j].includes('-->')) j++;
      cur().blocks.push(node('comment', i, Math.min(j + 1, lines.length))); i = j + 1; continue;
    }
    const f = FENCE.exec(l);
    if (f) {
      const close = new RegExp(`^\\s*${f[2][0] === '`' ? '`' : '~'}{${f[2].length},}\\s*$`);
      while (j < lines.length && !close.test(lines[j])) j++;
      cur().blocks.push(node('code', i, Math.min(j + 1, lines.length), { lang: f[3] })); i = j + 1; continue;
    }
    if (/^\s*\|/.test(l) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
      const table = node('table', i, j);
      for (let k = i + 2; k < j; k++) table.children.push(node('tr', k, k + 1, { parent: table }));
      cur().blocks.push(table); i = j; continue;
    }
    if (/^\s*>/.test(l)) {
      while (j < lines.length && /^\s*>/.test(lines[j])) j++;
      cur().blocks.push(node('quote', i, j)); i = j; continue;
    }
    const m = ITEM.exec(l);
    if (m) {
      const base = m[1].length;
      for (; j < lines.length; j++) {
        const next = lines[j].trim() ? lines[j] : lines.slice(j).find(x => x.trim());
        if (next === undefined) break;
        const indent = next.length - next.trimStart().length;
        if (!(indent > base || (indent === base && ITEM.test(next)))) break;
      }
      while (!lines[j - 1].trim()) j--;
      const list = node('list', i, j);
      list.children = items(lines, i, j, base, list);
      cur().blocks.push(list); i = j; continue;
    }
    while (j < lines.length && lines[j].trim() && !startsBlock(lines[j])) j++;
    cur().blocks.push(node('p', i, j)); i = j;
  }
  while (stack.length > 1) stack.pop().end = lines.length;
  return { lines, root };
}

/** @param {string[]} lines @param {number} a @param {number} b @param {number} indent @param {MdNode} parent @returns {MdNode[]} */
function items(lines, a, b, indent, parent) {
  const out = [];
  for (let k = a; k < b; k++) { const m = ITEM.exec(lines[k]); if (m && m[1].length === indent) out.push({ kind: 'li', start: k, end: b, children: [], blocks: [], parent }); }
  out.forEach((item, n) => {
    item.end = n + 1 < out.length ? out[n + 1].start : b;
    while (item.end > item.start + 1 && !lines[item.end - 1].trim()) item.end--;
    for (let k = item.start + 1; k < item.end; k++) {
      const m = ITEM.exec(lines[k]);
      if (m) { item.children = items(lines, k, item.end, m[1].length, item); break; }
    }
  });
  return out;
}

/** Split on ">" outside quotes and brackets. @param {string} sel */
function steps(sel) {
  const out = []; let s = '', quote = false, bracket = 0;
  for (const c of sel) {
    if (c === '"') quote = !quote;
    else if (!quote && c === '[') bracket++;
    else if (!quote && c === ']') bracket--;
    if (c === '>' && !quote && !bracket) { out.push(s.trim()); s = ''; } else s += c;
  }
  out.push(s.trim());
  if (quote || bracket || out.some(x => !x)) throw new SelectorError(`malformed selector: ${sel}`);
  return out;
}

const BLOCK_STEP = new RegExp(`^(${BLOCK_KINDS.join('|')})((?:\\[[^\\]]*\\]|:has\\("[^"]*"\\))*)$`);
const HEADING_STEP = /^(?:"([^"]*)"|([^"]+?))(?:\[(\d+)\])?$/;

/** @param {MdNode} node @param {string} name */
const headingMatches = (node, name) => node.text === name || node.text?.startsWith(name + ':') || node.text?.startsWith(name + '：');

/** @param {MdNode} node @returns {MdNode[]} */
export const sectionsUnder = node => node.children.filter(c => c.kind === 'section').flatMap(c => [c, ...sectionsUnder(c)]);

/** @param {MdNode} node @param {string} kind */
function blocksOf(node, kind) {
  if (node.kind === 'root' || node.kind === 'section') {
    return node.blocks.flatMap(b => b.kind === kind ? [b] : (kind === 'li' && b.kind === 'list') || (kind === 'tr' && b.kind === 'table') ? b.children : []);
  }
  if ((node.kind === 'li' && kind === 'li') || (node.kind === 'table' && kind === 'tr')) return node.children;
  throw new SelectorError(`${kind} cannot follow ${node.kind}`);
}

/** Resolve a selector to source nodes; throws SelectorError naming the failing step.
 * @param {{lines:string[], root:MdNode}} tree @param {string} sel @returns {MdNode[]} */
export function select(tree, sel) {
  /** @type {MdNode[]} */
  let nodes = [tree.root];
  steps(sel).forEach((step, k) => {
    const block = BLOCK_STEP.exec(step);
    if (block) {
      let found = nodes.flatMap(n => blocksOf(n, block[1]));
      for (const m of block[2].matchAll(/\[([^\]]*)\]|:has\("([^"]*)"\)/g)) {
        if (m[2] !== undefined) { const needle = m[2]; found = found.filter(n => tree.lines.slice(n.start, n.end).join('\n').includes(needle)); continue; }
        const lang = /^lang=(.+)$/.exec(m[1]), range = /^(\d+)(?:\.\.(\d+))?$/.exec(m[1]);
        if (lang) found = found.filter(n => n.lang === lang[1]);
        else if (range && Number(range[1]) >= 1) found = found.slice(Number(range[1]) - 1, Number(range[2] ?? range[1]));
        else throw new SelectorError(`bad filter [${m[1]}] in "${step}"`);
      }
      nodes = found;
    } else {
      const h = HEADING_STEP.exec(step);
      if (!h) throw new SelectorError(`bad step "${step}"`);
      if (nodes.some(n => n.kind !== 'root' && n.kind !== 'section')) throw new SelectorError(`heading "${step}" cannot follow a block`);
      const name = (h[1] ?? h[2]).trim();
      let found = (k === 0 ? sectionsUnder(tree.root) : nodes.flatMap(n => n.children.filter(c => c.kind === 'section'))).filter(n => headingMatches(n, name));
      if (h[3]) found = found.slice(Number(h[3]) - 1, Number(h[3]));
      else if (found.length > 1) throw new SelectorError(`ambiguous "${step}": ${found.map(n => `${n.text} (L${n.start + 1})`).join(' | ')}; add a parent heading or [n]`);
      nodes = found;
    }
    if (!nodes.length) throw new SelectorError(`no match at "${step}"`);
  });
  return nodes;
}

/** Verbatim Markdown for selected nodes: list items dedented, table rows under their table header.
 * @param {{lines:string[]}} tree @param {MdNode[]} nodes */
export function sourceText(tree, nodes) {
  const parts = [];
  let prev = null;
  for (const n of nodes) {
    let text = tree.lines.slice(n.start, n.end).join('\n').replace(/\s+$/, '');
    if (n.kind === 'li') { const indent = /^\s*/.exec(tree.lines[n.start])[0].length; text = text.split('\n').map(l => l.slice(Math.min(indent, /^\s*/.exec(l)[0].length))).join('\n'); }
    if (n.kind === 'tr' && n.parent && prev?.parent !== n.parent) text = tree.lines.slice(n.parent.start, n.parent.start + 2).join('\n') + '\n' + text;
    parts.push(prev && (prev.end === n.start || (n.kind === 'tr' && prev.parent === n.parent)) ? '\n' : prev ? '\n\n' : '', text);
    prev = n;
  }
  return parts.join('');
}

/** Line indexes that carry content: everything except blank lines, headings, comments and table headers.
 * @param {{lines:string[], root:MdNode}} tree */
export function contentLines(tree) {
  const out = new Set();
  const walk = sec => {
    for (const b of sec.blocks) {
      if (b.kind === 'comment' || b.kind === 'title') continue;
      for (let k = b.kind === 'table' ? b.start + 2 : b.start; k < b.end; k++) if (tree.lines[k].trim()) out.add(k);
    }
    sec.children.forEach(walk);
  };
  walk(tree.root);
  return out;
}

/** A selector that reaches this section: the path of leading ids or heading texts, [n] where needed.
 * @param {{lines:string[], root:MdNode}} tree @param {MdNode} sec */
export function pathOf(tree, sec) {
  const chain = []; for (let n = sec; n && n.kind === 'section'; n = n.parent) chain.unshift(n);
  const name = n => { const id = /^([\p{L}\p{N}_-]{1,16})[:：]/u.exec(n.text)?.[1]; return id ?? n.text; };
  const fmt = s => /^[^">[\]]+$/.test(s) && !BLOCK_STEP.test(s) && s === s.trim() ? s : `"${s}"`;
  const parts = chain.map(n => fmt(name(n)));
  for (let k = parts.length - 1; k >= 0; k--) {
    const candidate = parts.slice(k).join(' > ');
    try { const found = select(tree, candidate); if (found.length === 1 && found[0] === sec) return candidate; } catch (error) { if (!(error instanceof SelectorError)) throw error; }
  }
  const same = sectionsUnder(tree.root).filter(n => headingMatches(n, name(sec)));
  return `${parts[parts.length - 1]}[${same.indexOf(sec) + 1}]`;
}

/** Innermost section (or root) that contains a line. @param {MdNode} root @param {number} line @returns {MdNode} */
export function sectionAt(root, line) {
  const inner = root.children.find(c => c.kind === 'section' && c.start <= line && line < c.end);
  return inner ? sectionAt(inner, line) : root;
}
