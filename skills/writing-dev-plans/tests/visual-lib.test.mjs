// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseDoc, readPlanDir } from '../scripts/lib/parse-plan.mjs';
import { hashDoc } from '../scripts/lib/source-hash.mjs';
import { dataSrcs, readManifest, requiredUnits, visualStatus, writeManifest } from '../scripts/lib/visual.mjs';

const fixture = kind => readFileSync(new URL(`./fixtures/v2-en/${kind}.md`, import.meta.url), 'utf8');
const htmlFor = ids => `<script type="application/json" id="plan-source">{}</script>${ids.map(id => `<section data-src="${id}"></section>`).join('')}`;

test('visual status: hashes, coverage, unknown ids', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = fixture('plan');
  const doc = parseDoc(source, 'plan');
  writeFileSync(path.join(dir, 'plan.md'), source);
  const visual = path.join(dir, 'visual-plan.html');
  const status = () => visualStatus(readPlanDir(dir, { knownFormat: 2 }))[0];

  writeFileSync(visual, htmlFor(requiredUnits(doc)));
  assert.equal(status().state, 'unstamped');
  writeFileSync(visual, writeManifest(htmlFor([...requiredUnits(doc).filter(id => id !== 'ADR-2'), 'ADR-9']), hashDoc(doc)));
  assert.deepEqual(status(), { file: 'visual-plan.html', kind: 'plan', state: 'fresh', changed: [], added: [], removed: [], missing: ['ADR-2'], unknown: ['ADR-9'] });

  writeFileSync(path.join(dir, 'plan.md'), source.replace('- Decision: Use Node.', '- Decision: Use Bun.').replace('### ADR-2: Alternative', '### ADR-3: Alternative'));
  const stale = status();
  assert.equal(stale.state, 'stale');
  assert.deepEqual([stale.changed, stale.added, stale.removed], [['ADR-1'], ['ADR-3'], ['ADR-2']]);

  writeFileSync(visual, '<main data-src="header"></main>');
  assert.equal(status().state, 'missing-manifest');
  rmSync(path.join(dir, 'plan.md'));
  assert.equal(status().state, 'missing-source');
});

test('required units skip heading-only and comment-only sections', () => {
  const doc = parseDoc('# T · Plan\n\nIntro.\n\n## Empty\n\n## Commented\n<!-- note -->\n\n## Real\nText.\n', 'plan');
  assert.deepEqual(requiredUnits(doc), ['header', 'sec:real']);
});

test('manifest and data-src round trip', () => {
  const html = `<script type="application/json" id="plan-source">broken</script><div data-src='ADR-1' data-src="T1"></div><!-- <p data-src="ghost"></p> --><script>q('[data-src="js"]')</script>`;
  assert.equal(readManifest(html), null);
  assert.deepEqual([...dataSrcs(html)], ['ADR-1', 'T1']);
  const manifest = { version_hash: '$&', units: { 'ADR-1': '123' } };
  assert.deepEqual(readManifest(writeManifest(html, manifest)), manifest);
  assert.equal(readManifest('<div></div>'), null);
});
