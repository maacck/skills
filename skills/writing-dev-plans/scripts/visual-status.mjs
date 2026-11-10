// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { knownFormat, readPlanDir } from './lib/parse-plan.mjs';
import { hashDoc } from './lib/source-hash.mjs';
import { VISUAL_FILES, coverage, readManifest, visualSkeleton, visualStatus, writeManifest } from './lib/visual.mjs';

const args = process.argv.slice(2);
let dir, init, stamp, json = false, invalid = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json' && !json) json = true;
  else if (arg === '--init' && init === undefined && ['plan', 'impl'].includes(args[i + 1])) init = args[++i];
  else if (arg === '--stamp' && stamp === undefined) stamp = ['plan', 'impl'].includes(args[i + 1]) ? args[++i] : 'all';
  else if (!arg.startsWith('-') && !dir) dir = arg;
  else invalid = true;
}
if (invalid || !dir || (init !== undefined && stamp !== undefined) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error('Usage: visual-status.mjs <plan-dir> [--init plan|impl] [--stamp [plan|impl]] [--json]');
  process.exitCode = 2;
} else {
  const planDir = readPlanDir(path.resolve(dir), { knownFormat: knownFormat() });
  const target = kind => path.join(planDir.path, VISUAL_FILES[kind]);

  if (init !== undefined) {
    const doc = planDir[init];
    if (!doc || fs.existsSync(target(init))) {
      console.error(!doc ? `missing source: ${init}.md` : `already exists: ${target(init)}`);
      process.exitCode = 2;
    } else {
      fs.writeFileSync(target(init), visualSkeleton(doc), { flag: 'wx' });
      console.log(target(init));
    }
  } else if (stamp !== undefined) {
    // Check every requested visual first; write nothing unless all pass.
    const kinds = stamp === 'all' ? /** @type {const} */ (['plan', 'impl']).filter(kind => fs.existsSync(target(kind))) : [stamp];
    const writes = [];
    for (const kind of kinds) {
      const doc = planDir[kind], file = VISUAL_FILES[kind];
      const html = fs.existsSync(target(kind)) ? fs.readFileSync(target(kind), 'utf8') : null;
      const errors = [];
      if (!doc) errors.push(`missing source: ${kind}.md`);
      if (html === null) errors.push(`missing ${file}; run --init ${kind}`);
      else if (!readManifest(html)) errors.push('missing manifest: keep <script type="application/json" id="plan-source"> from --init');
      if (doc && html !== null) {
        const { missing } = coverage(html, doc);
        if (missing.length) errors.push(`missing data-src: ${missing.join(', ')}`);
      }
      if (errors.length) { console.log(`${file}  not stamped`); for (const error of errors) console.log(`  ${error}`); }
      else writes.push({ kind, doc, html });
    }
    if (writes.length < kinds.length) process.exitCode = 1;
    else if (!writes.length) console.log('no visual documents');
    else for (const { kind, doc, html } of writes) {
      const manifest = { source: /** @type {'plan.md'|'impl.md'} */ (`${kind}.md`), format: doc.format, ...hashDoc(doc), stamped_at: new Date().toISOString() };
      fs.writeFileSync(target(kind), writeManifest(html, manifest));
      console.log(`${VISUAL_FILES[kind]}  fresh`);
    }
  } else {
    const statuses = visualStatus(planDir);
    if (json) console.log(JSON.stringify(statuses, null, 2));
    else if (!statuses.length) console.log('no visual documents');
    else for (const status of statuses) {
      let line = `${status.file}  ${status.state}`;
      for (const key of ['changed', 'added', 'removed']) if (status[key].length) line += `  ${key}: ${status[key].join(', ')}`;
      console.log(line);
      if (status.missing.length) console.log(`  missing data-src: ${status.missing.join(', ')}`);
      if (status.unknown.length) console.log(`  unknown data-src: ${status.unknown.join(', ')}`);
    }
    if (statuses.some(status => status.state !== 'fresh' || status.missing.length)) process.exitCode = 1;
  }
}
