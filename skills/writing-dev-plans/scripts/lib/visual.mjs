// @ts-check
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashDoc, normalizeUnit } from './source-hash.mjs';

export const VISUAL_FILES = { plan: 'visual-plan.html', impl: 'visual-impl.html' };
export const SAMPLE = fileURLToPath(new URL('../../assets/visual-sample.html', import.meta.url));
export const MANIFEST_RE = /<script type="application\/json" id="plan-source">([\s\S]*?)<\/script>/;

/** @typedef {{source?:'plan.md'|'impl.md', format?:number, version_hash?:string, units?:Record<string,string>, stamped_at?:string}} Manifest */

/** @param {string} html @returns {Manifest|null} */
export function readManifest(html) {
  const match = html.match(MANIFEST_RE);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

/** @param {string} html @param {Manifest} manifest */
export function writeManifest(html, manifest) {
  return html.replace(MANIFEST_RE, () => `<script type="application/json" id="plan-source">${JSON.stringify(manifest)}</script>`);
}

/** `data-src` attribute values in markup; scripts and comments are ignored. @param {string} html */
export function dataSrcs(html) {
  const markup = html.replace(/<script\b[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi, '');
  return new Set([...markup.matchAll(/\sdata-src\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => m[1] ?? m[2]));
}

/** Units with content beyond their heading (HTML comments and tracking noise ignored); these need coverage. @param {{units:{id:string,kind:string,md:string}[]}} doc */
export function requiredUnits(doc) {
  return doc.units.filter(unit => normalizeUnit(unit).replace(/<!--[\s\S]*?-->/g, '').split('\n').slice(unit.kind === 'header' ? 0 : 1).join('').trim()).map(unit => unit.id);
}

/** Starting file for the generating agent: the manifest slot, the required IDs, and the reference sample. @param {{title:string|null, units:{id:string,kind:string,md:string}[]}} doc */
export function visualSkeleton(doc) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<script type="application/json" id="plan-source">{}</script>
</head>
<body>
<!-- reference sample: ${SAMPLE} -->
<!-- required data-src: ${requiredUnits(doc).join(', ')} -->
</body>
</html>
`;
}

/** @param {string} html @param {{units:{id:string,kind:string,md:string}[]}} doc */
export function coverage(html, doc) {
  const srcs = dataSrcs(html), unitIds = new Set(doc.units.map(unit => unit.id));
  return { missing: requiredUnits(doc).filter(id => !srcs.has(id)), unknown: [...srcs].filter(id => !unitIds.has(id)) };
}

/** @param {ReturnType<import('./parse-plan.mjs').readPlanDir>} planDir */
export function visualStatus(planDir) {
  return planDir.visuals.map(({ file }) => {
    const kind = file === VISUAL_FILES.plan ? 'plan' : 'impl';
    const html = readFileSync(path.join(planDir.path, file), 'utf8');
    const doc = planDir[kind];
    const result = { file, kind, state: 'missing-source', changed: [], added: [], removed: [], missing: [], unknown: [] };
    if (!doc) return result;

    Object.assign(result, coverage(html, doc));
    const current = hashDoc(doc);
    const manifest = readManifest(html);
    if (!manifest) {
      result.state = 'missing-manifest';
    } else if (!manifest.version_hash) {
      result.state = 'unstamped';
    } else if (manifest.version_hash === current.version_hash) {
      result.state = 'fresh';
    } else {
      result.state = 'stale';
      const previous = manifest.units ?? {};
      result.changed = Object.keys(current.units).filter(id => Object.hasOwn(previous, id) && previous[id] !== current.units[id]);
      result.added = Object.keys(current.units).filter(id => !Object.hasOwn(previous, id));
      result.removed = Object.keys(previous).filter(id => !Object.hasOwn(current.units, id));
    }
    return result;
  });
}
