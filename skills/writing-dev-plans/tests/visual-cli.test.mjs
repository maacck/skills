// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readManifest } from '../scripts/lib/visual.mjs';

const cli = fileURLToPath(new URL('../scripts/visual-status.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/v2-en/', import.meta.url));
const run = (dir, ...args) => spawnSync(process.execPath, [cli, dir, ...args], { encoding: 'utf8' });
const setup = t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(fixture, dir, { recursive: true });
  return dir;
};
// Write the page the way an agent would: one element per required unit, skipping `omit`.
const fill = (file, omit = []) => {
  const html = readFileSync(file, 'utf8');
  const ids = /required data-src: (.*) -->/.exec(html)[1].split(', ').filter(id => !omit.includes(id));
  writeFileSync(file, html.replace('</body>', `<main>${ids.map(id => `<section data-src="${id}"></section>`).join('')}</main>\n</body>`));
};

test('init, stamp and stale detection', t => {
  const dir = setup(t);
  const html = path.join(dir, 'visual-plan.html');
  assert.match(run(dir).stdout, /no visual documents/);
  let result = run(dir, '--init', 'plan');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), html);
  const skeleton = readFileSync(html, 'utf8');
  assert.match(skeleton, /required data-src: header, sec:at-a-glance, sec:context, ADR-1, ADR-2, sec:architecture, sec:open-questions -->/);
  assert.match(skeleton, /reference sample: .*assets[/\\]visual-sample\.html/);
  assert.equal(run(dir, '--init', 'plan').status, 2);

  result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /visual-plan\.html  unstamped\n  missing data-src: header,/);
  fill(html, ['ADR-2']);
  result = run(dir, '--stamp');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not stamped\n  missing data-src: ADR-2$/m);
  assert.equal(readManifest(readFileSync(html, 'utf8'))?.version_hash, undefined);

  writeFileSync(html, readFileSync(html, 'utf8').replace('</main>', '<div data-src="ADR-2"></div></main>'));
  result = run(dir, '--stamp');
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /visual-plan\.html  fresh/);
  const manifest = readManifest(readFileSync(html, 'utf8'));
  assert.equal(manifest?.source, 'plan.md');
  assert.match(manifest?.version_hash ?? '', /^[a-f0-9]{16}$/);
  assert.equal(JSON.parse(run(dir, '--json').stdout)[0].state, 'fresh');

  const plan = path.join(dir, 'plan.md');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('- Status: aligned', '- Status: superseded'));
  assert.equal(run(dir).status, 0, 'header Status is tracking, not content');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('- Decision: Use Node.', '- Decision: Use Nodes.'));
  result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /stale  changed: ADR-1/);
});

test('stamp checks every requested visual before writing any', t => {
  const dir = setup(t);
  assert.equal(run(dir, '--init', 'plan').status, 0);
  assert.equal(run(dir, '--init', 'impl').status, 0);
  const planHtml = path.join(dir, 'visual-plan.html'), implHtml = path.join(dir, 'visual-impl.html');
  fill(planHtml);
  fill(implHtml, ['T3']);
  let result = run(dir, '--stamp');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /visual-impl\.html  not stamped\n  missing data-src: T3/);
  assert.equal(readManifest(readFileSync(planHtml, 'utf8'))?.version_hash, undefined, 'plan must not be stamped when impl fails');

  writeFileSync(planHtml, readFileSync(planHtml, 'utf8').replace(/<script type="application\/json" id="plan-source">\{\}<\/script>/, ''));
  assert.match(run(dir, '--stamp', 'plan').stdout, /missing manifest/);
  fill(implHtml);
  assert.equal(run(dir, '--stamp', 'impl').status, 0);

  rmSync(path.join(dir, 'impl.md'));
  assert.match(run(dir, '--stamp', 'impl').stdout, /missing source: impl\.md/);
  assert.equal(run(dir, '--init', 'impl').status, 2);
  rmSync(implHtml);
  assert.ok(!existsSync(implHtml));
  assert.match(run(dir, '--stamp', 'impl').stdout, /missing visual-impl\.html; run --init impl/);
});
