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
const attr = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
// Write the page the way an agent would: one empty placeholder per listed selector, skipping `omit`.
const fill = (file, omit = []) => {
  const html = readFileSync(file, 'utf8');
  const selectors = /Selectors that must be covered: (.*) -->/.exec(html)[1].split(' | ').filter(s => !omit.includes(s));
  writeFileSync(file, html.replace('</body>', `<main>${selectors.map(s => `<section data-src='${attr(s)}'></section>`).join('')}</main>\n</body>`));
};
const sourcesOf = file => JSON.parse(/<script type="application\/json" id="plan-sources">([\s\S]*?)<\/script>/.exec(readFileSync(file, 'utf8'))[1]);

test('init, stamp and stale detection', t => {
  const dir = setup(t);
  const html = path.join(dir, 'visual-plan.html');
  assert.match(run(dir).stdout, /no visual documents/);
  let result = run(dir, '--init', 'plan');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), html);
  const skeleton = readFileSync(html, 'utf8');
  assert.match(skeleton, /Selectors that must be covered: li \| At a Glance \| Context \| ADR-1 \| ADR-2 \| Architecture \| Open Questions -->/);
  assert.match(skeleton, /Reference sample: .*assets[/\\]visual-sample\.html/);
  assert.equal(run(dir, '--init', 'plan').status, 2);

  result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /visual-plan\.html  unstamped\n  missing data-src: li \| At a Glance \|/);
  fill(html, ['ADR-2']);
  result = run(dir, '--stamp');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not stamped\n  missing data-src: ADR-2$/m);
  assert.equal(readManifest(readFileSync(html, 'utf8'))?.version_hash, undefined);

  writeFileSync(html, readFileSync(html, 'utf8').replace('</main>', `<div data-src='ADR-2 > li:has("Decision")'></div><div data-src='ADR-2 > li[1..2]'></div><div data-src='ADR-2 > li:has("Consequences")'></div><div data-src='ADR-9'></div></main>`));
  result = run(dir, '--stamp');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /broken data-src: ADR-9: no match at "ADR-9"/);
  writeFileSync(html, readFileSync(html, 'utf8').replace(`<div data-src='ADR-9'></div>`, ''));
  result = run(dir, '--stamp');
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /visual-plan\.html  fresh/);
  const manifest = readManifest(readFileSync(html, 'utf8'));
  assert.equal(manifest?.source, 'plan.md');
  assert.match(manifest?.version_hash ?? '', /^[a-f0-9]{16}$/);
  assert.equal(sourcesOf(html)['ADR-2 > li:has("Decision")'], '- Decision: Superseded.');
  assert.match(sourcesOf(html)['ADR-1'], /^### ADR-1: Use Node\n\n- Status: accepted[\s\S]*- Rejected: Another runtime\.$/);
  const status = JSON.parse(run(dir, '--json').stdout)[0];
  assert.deepEqual([status.state, status.kit, status.missing, status.broken], ['fresh', 'ok', [], []]);

  const plan = path.join(dir, 'plan.md');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('- Status: aligned', '- Status: superseded'));
  assert.equal(run(dir).status, 0, 'header Status is tracking, not content');
  writeFileSync(plan, readFileSync(plan, 'utf8').replace('- Decision: Use Node.', '- Decision: Use Nodes.'));
  result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /stale  changed: ADR-1/);
  assert.equal(run(dir, '--stamp').status, 0);
  assert.match(sourcesOf(html)['ADR-1'], /- Decision: Use Nodes\./, 'source follows the Markdown without the agent copying it');
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

test('stamp restores a damaged kit and refuses a duplicated one', t => {
  const dir = setup(t);
  const html = path.join(dir, 'visual-plan.html');
  assert.equal(run(dir, '--init', 'plan').status, 0);
  fill(html);
  assert.equal(run(dir, '--stamp', 'plan').status, 0);
  const good = readFileSync(html, 'utf8');

  writeFileSync(html, good.replace(/(<style id="visual-kit">\n)[\s\S]*?(<\/style>)/, '$1body{}$2').replace(/<script id="visual-kit-js">[\s\S]*?<\/script>/, ''));
  assert.match(run(dir).stdout, /kit missing: --stamp restores it/);
  assert.equal(run(dir, '--stamp', 'plan').status, 0);
  assert.equal(JSON.parse(run(dir, '--json').stdout)[0].kit, 'ok');

  writeFileSync(html, good.replace('</body>', '<script id="visual-kit-js">1</script></body>'));
  const out = run(dir, '--stamp', 'plan');
  assert.equal(out.status, 1);
  assert.match(out.stdout, /duplicate visual-kit block/);
  assert.ok(readFileSync(html, 'utf8').includes('<script id="visual-kit-js">1</script>'), 'nothing written');
});
