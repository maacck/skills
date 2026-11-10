// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDoc, readPlanDir, knownFormat } from '../scripts/lib/parse-plan.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));
const text = (name, file) => fs.readFileSync(`${fixture(name)}/${file}.md`, 'utf8');

test('English format 2 documents and runs', () => {
  const dir = readPlanDir(fixture('v2-en'), { knownFormat: 2 });
  const { plan, impl } = dir;
  assert.equal(knownFormat(), 2);
  assert.equal(plan.format, 2);
  assert.equal(plan.title, 'Demo · Plan');
  assert.equal(plan.header.Status.value, 'aligned');
  assert.equal(impl.header.Execution.value, 'subagents');
  for (const [doc, file] of [[plan, 'plan'], [impl, 'impl']]) {
    assert.equal(doc.units.map(unit => unit.md).join(''), text('v2-en', file).replace(/^---\n[\s\S]*?\n---\n/, ''));
  }
  for (const id of ['header', 'sec:at-a-glance', 'ADR-1']) assert.ok(plan.units.some(unit => unit.id === id));
  for (const id of ['M1', 'T1']) assert.ok(impl.units.some(unit => unit.id === id));
  assert.deepEqual(impl.tasks.map(t => t.id), ['T1', 'T2', 'T3']);
  assert.deepEqual(impl.tasks[0].dependsOn, []);
  assert.deepEqual(impl.tasks[2].dependsOn, ['T1', 'T2']);
  assert.equal(impl.tasks[0].steps[0].done, true);
  assert.equal(impl.tasks[1].steps[0].done, false);
  assert.deepEqual(impl.log.map(({ kind, task }) => [kind, task]), [['done', 'T1'], ['needs-user', 'T2'], ['change', null]]);
  assert.equal(dir.runs.length, 2);
  assert.equal(dir.runs.find(run => run.id === 'T1-1').handoff.status, 'DONE');
  assert.equal(dir.runs.find(run => run.id === 'T1-1').handoff.result, 'pass');
  assert.deepEqual(dir.runs.find(run => run.id === 'T1-1').evidence, ['evidence/verify.log']);
  assert.equal(dir.runs.find(run => run.id === 'T2-1').handoff, null);
});

test('Chinese and legacy fixtures', () => {
  const zh = readPlanDir(fixture('v2-zh'), { knownFormat: 2 });
  assert.ok(zh.plan.units.some(unit => unit.id === 'sec:背景'));
  assert.equal(zh.impl.tasks.length, 3);
  assert.equal(zh.impl.log.length, 3);
  assert.deepEqual(zh.runs, []);
  const old = readPlanDir(fixture('v1'), { knownFormat: 2 });
  assert.equal(old.plan.format, 1);
  assert.equal(old.impl.header.Execution, undefined);
  assert.equal(old.plan.glance, null);
  assert.equal(old.plan.structured, true);
  assert.equal(old.impl.structured, true);
});

test('malformed entries, unknown kinds and repeated headings', () => {
  const doc = parseDoc('# Example\n- Status: aligned\n## Notes\n## Notes\n### T5 broken\n2026-01-01 10:00 · T1 finished\n2026-01-01 10:00 ·broken\n', 'impl');
  assert.deepEqual(doc.units.filter(unit => unit.id.startsWith('sec:notes')).map(unit => unit.id), ['sec:notes', 'sec:notes-2']);
  assert.equal(doc.log[0].kind, 'finished');
  assert.deepEqual(doc.malformed.map(item => item.rule), ['task-heading', 'log-format']);
});

test('normalizes CRLF without changing ids or line numbers', () => {
  for (const file of ['plan', 'impl']) {
    const source = text('v2-en', file);
    const lf = parseDoc(source, file), crlf = parseDoc(source.replace(/\n/g, '\r\n'), file);
    assert.equal(crlf.format, 2);
    assert.ok(crlf.frontmatter);
    assert.deepEqual(crlf.units.map(({ id, line }) => [id, line]), lf.units.map(({ id, line }) => [id, line]));
  }
});

test('invalid and newer frontmatter', () => {
  for (const value of ['0', 'abc']) {
    const doc = parseDoc(`---\nformat: ${value}\n---\n# Title\n- Status: aligned\n`, 'plan');
    assert.equal(doc.format, 1);
    assert.ok(doc.malformed.some(item => item.rule === 'frontmatter'));
  }
  assert.equal(parseDoc('---\nformat: 3\n---\n- Status: aligned\n', 'plan').structured, false);
});

test('comments and indented fences are not structure', () => {
  const doc = parseDoc('# Title\n- Status: aligned <!-- comment -->\n  ```\n<!--\n  ```\n## Visible\n<!--\n### T1: hidden [todo]\n-->\n## End\n', 'plan');
  assert.equal(doc.header.Status.value, 'aligned');
  assert.deepEqual(doc.units.map(unit => unit.id), ['header', 'sec:visible', 'sec:end']);
});
