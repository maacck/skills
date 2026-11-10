// @ts-check
import { createHash } from 'node:crypto';
import { LOG_LIKE } from './parse-plan.mjs';

/** @param {{kind:string, md:string}} unit */
export function normalizeUnit(unit) {
  const out = [];
  let inFence = false;
  for (const raw of unit.md.replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence) {
      if (unit.kind === 'header' && /^- Status:/.test(line)) continue;
      if (LOG_LIKE.test(line)) continue;
      line = line.replace(/^(### T\d+: .+?) \[[^\]]*\]$/, '$1')
        .replace(/^(\s*- )\[[xX]\]/, '$1[ ]');
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** @param {string} value */
function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** @param {{units:{id:string, kind:string, md:string}[]}} doc
 * @returns {{version_hash:string, units:Record<string,string>}}
 */
export function hashDoc(doc) {
  const units = Object.fromEntries(doc.units.map(unit => [unit.id, hash(normalizeUnit(unit))]));
  return { version_hash: hash(doc.units.map(unit => `${unit.id}:${units[unit.id]}`).join('\n')), units };
}
