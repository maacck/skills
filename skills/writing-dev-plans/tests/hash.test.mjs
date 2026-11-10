// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseDoc } from '../scripts/lib/parse-plan.mjs';
import { hashDoc, normalizeUnit } from '../scripts/lib/source-hash.mjs';

const fixture = kind => readFileSync(new URL(`./fixtures/v2-en/${kind}.md`, import.meta.url), 'utf8');
const hashed = (text, kind) => hashDoc(parseDoc(text, kind));

test('progress and whitespace changes leave hashes unchanged', () => {
  for (const kind of ['plan', 'impl']) {
    const source = fixture(kind);
    const baseline = hashed(source, kind);
    const variants = [
      source.replace(/^- Status: .+$/m, '- Status: changed'),
      source.replace(/\n/g, '\r\n'),
      source.replace(/^(?!-{3}$)(.*)$/gm, '$1  '),
      source.replace('- [x] Runtime?', '- [ ] Runtime?'),
    ];
    if (kind === 'impl') variants.push(
      source.replace('### T2: Second task [doing]', '### T2: Second task [done]'),
      source.replace('- [ ] Finish the second task.', '- [x] Finish the second task.'),
      `${source}\n2026-11-10 10:03 · T2 done · completed\n`,
    );
    for (const variant of variants) assert.deepEqual(hashed(variant, kind), baseline);
  }
});

test('ADR content and status change only the affected unit', () => {
  const source = fixture('plan');
  const baseline = hashed(source, 'plan');
  for (const variant of [source.replace('- Decision: Use Node.', '- Decision: Use Nodes.'), source.replace('- Status: accepted', '- Status: superseded by ADR-2')]) {
    const result = hashed(variant, 'plan');
    assert.notEqual(result.version_hash, baseline.version_hash);
    assert.deepEqual(Object.keys(result.units).filter(id => result.units[id] !== baseline.units[id]), ['ADR-1']);
  }
});

test('new task adds a unit and changes the version hash', () => {
  const source = fixture('impl');
  const baseline = hashed(source, 'impl');
  const result = hashed(source.replace('## Progress Log', '### T4: x [todo]\n\n## Progress Log'), 'impl');
  assert.ok(Object.hasOwn(result.units, 'T4'));
  assert.notEqual(result.version_hash, baseline.version_hash);
});

test('hashes normalized units and their ordered identifiers with SHA-256', () => {
  const doc = parseDoc(fixture('plan'), 'plan');
  const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
  const result = hashDoc(doc);
  for (const unit of doc.units) assert.equal(result.units[unit.id], digest(normalizeUnit(unit)));
  assert.equal(result.version_hash, digest(doc.units.map(unit => `${unit.id}:${result.units[unit.id]}`).join('\n')));
  assert.notEqual(hashDoc({ units: [...doc.units].reverse() }).version_hash, result.version_hash);
});

test('fenced content retains task and checkbox state', () => {
  const unit = { kind: 'section', md: '## Example\n```\n### T1: example [doing]\n- [x] example\n```' };
  assert.match(normalizeUnit(unit), /\[doing\]\n- \[x\]/);
});
