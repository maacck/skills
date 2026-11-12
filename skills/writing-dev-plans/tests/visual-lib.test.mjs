// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseDoc, readPlanDir } from '../scripts/lib/parse-plan.mjs';
import { hashDoc } from '../scripts/lib/source-hash.mjs';
import { coverage, dataSrcs, injectGenerated, kitState, readManifest, visualSkeleton, visualStatus, writeManifest } from '../scripts/lib/visual.mjs';

const fixture = kind => readFileSync(new URL(`./fixtures/v2-en/${kind}.md`, import.meta.url), 'utf8');
const htmlFor = selectors => `<script type="application/json" id="plan-source">{}</script>${selectors.map(s => `<section data-src='${s}'></section>`).join('')}`;
const full = ['li', 'At a Glance', 'Context', 'ADR-1', 'ADR-2', 'Architecture', 'Open Questions'];

test('visual status: hashes, coverage, broken selectors, kit', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = fixture('plan');
  const doc = parseDoc(source, 'plan');
  writeFileSync(path.join(dir, 'plan.md'), source);
  const visual = path.join(dir, 'visual-plan.html');
  const status = () => visualStatus(readPlanDir(dir, { knownFormat: 2 }))[0];

  writeFileSync(visual, htmlFor(full));
  assert.equal(status().state, 'unstamped');
  assert.deepEqual(status().missing, []);
  writeFileSync(visual, writeManifest(htmlFor([...full.filter(s => s !== 'ADR-2'), 'ADR-9']), hashDoc(doc)));
  assert.deepEqual(status(), { file: 'visual-plan.html', kind: 'plan', state: 'fresh', changed: [], added: [], removed: [], missing: ['ADR-2'], broken: ['ADR-9: no match at "ADR-9"'], kit: 'missing' });

  writeFileSync(path.join(dir, 'plan.md'), source.replace('- Decision: Use Node.', '- Decision: Use Bun.').replace('### ADR-2: Alternative', '### ADR-3: Alternative'));
  const stale = status();
  assert.equal(stale.state, 'stale');
  assert.deepEqual([stale.changed, stale.added, stale.removed], [['ADR-1'], ['ADR-3'], ['ADR-2']]);

  writeFileSync(visual, '<main data-src="Context"></main>');
  assert.equal(status().state, 'missing-manifest');
  rmSync(path.join(dir, 'plan.md'));
  assert.equal(status().state, 'missing-source');
});

test('coverage is by source lines: partial selections leave the rest missing, noise is not required', () => {
  const doc = parseDoc('# T · Plan\n\n- Status: draft\n\nIntro.\n\n## Empty\n\n## Commented\n<!-- note -->\n\n## Real\n\n- a\n- b\n\n## Progress Log\n\n2026-11-10 10:00 · T1 done · ok\n', 'plan');
  assert.deepEqual(coverage(htmlFor([]), doc).missing, ['p', 'Real']);
  assert.deepEqual(coverage(htmlFor(['p', 'Real > li[1]']), doc).missing, ['Real']);
  assert.deepEqual(coverage(htmlFor(['p', 'Real > li[1..2]']), doc).missing, []);
  assert.deepEqual(coverage(htmlFor(['p', 'Real']), doc).missing, []);
});

test('data-src values decode entities and ignore scripts, styles and comments', () => {
  const html = `<script type="application/json" id="plan-source">broken</script><div data-src='ADR-1 &gt; li:has("x")' data-src="T1"></div><!-- <p data-src="ghost"></p> --><script>q('[data-src="js"]')</script><style>[data-src="css"]{}</style>`;
  assert.equal(readManifest(html), null);
  assert.deepEqual([...dataSrcs(html)], ['ADR-1 > li:has("x")', 'T1']);
  const manifest = { version_hash: '$&', units: { 'ADR-1': '123' } };
  assert.deepEqual(readManifest(writeManifest(html, manifest)), manifest);
  assert.equal(readManifest('<div></div>'), null);
});

test('generated blocks: inlined, restored when deleted, refreshed when edited, escaped, never duplicated', () => {
  const doc = parseDoc(fixture('plan'), 'plan');
  const skeleton = visualSkeleton(doc);
  assert.equal(kitState(skeleton), 'linked');
  assert.match(skeleton, /Selectors that must be covered: li \| At a Glance \| Context \| ADR-1 \| ADR-2 \| Architecture \| Open Questions -->/);

  const sources = { 'ADR-1': 'a </script><script>x</script> <!-- b' };
  const stamped = injectGenerated(skeleton, sources);
  assert.equal(kitState(stamped), 'ok');
  assert.ok(!stamped.includes('href="file:'), 'kit link replaced by the inline block');
  const block = /<script type="application\/json" id="plan-sources">([\s\S]*?)<\/script>/.exec(stamped)[1];
  assert.deepEqual(JSON.parse(block), sources);
  assert.ok(!/<\/script|<!--/.test(block), 'source JSON cannot close its own script element');
  assert.equal(injectGenerated(stamped, sources), stamped, 'idempotent');

  const edited = stamped.replace(/(<style id="visual-kit">\n)[\s\S]*?(<\/style>)/, '$1body{}$2');
  assert.equal(kitState(edited), 'outdated');
  assert.equal(injectGenerated(edited, sources), stamped);
  const gutted = stamped.replace(/<script id="visual-kit-js">[\s\S]*?<\/script>/, '');
  assert.equal(kitState(gutted), 'missing');
  assert.equal(kitState(injectGenerated(gutted, sources)), 'ok');

  const twice = stamped.replace('</body>', '<style id="visual-kit">x</style></body>');
  assert.equal(kitState(twice), 'duplicate');
  assert.throws(() => injectGenerated(twice, sources), /duplicate visual-kit/);
});
