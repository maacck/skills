// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lintPlanDir } from '../scripts/lib/lint.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));
const cli = fileURLToPath(new URL('../scripts/lint-plan.mjs', import.meta.url));
function copy(name = 'v2-en') { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-')); fs.cpSync(fixture(name), dir, { recursive: true }); return dir; }
function change(dir, file, from, to) { const p = path.join(dir, file), text = fs.readFileSync(p, 'utf8'); assert.ok(text.includes(from), `missing ${from}`); fs.writeFileSync(p, text.replace(from, to)); }
function rules(dir, options = {}) { return lintPlanDir(dir, { knownFormat: 2, ...options }).map(i => i.rule); }

for (const name of ['v1', 'v2-en', 'v2-zh']) test(`${name} has no errors`, () => {
  assert.deepEqual(lintPlanDir(fixture(name), { knownFormat: 2 }).filter(i => i.severity === 'error'), []);
});

const cases = [
  ['header-status', 'plan.md', '- Status: aligned', '- Status: wrong'],
  ['task-heading', 'impl.md', '### T1: First task [done]', '### T1: First task [oops]'],
  ['task-duplicate', 'impl.md', '### T2: Second task [doing]', '### T1: Second task [doing]'],
  ['task-depends', 'impl.md', '- Depends on: none', '- Other: none'],
  ['task-verify', 'impl.md', '- Verify: `node --test` → pass\n\n### T2', '- Other: none\n\n### T2'],
  ['task-dep-unknown', 'impl.md', '- Depends on: T1, T2', '- Depends on: T1, T99'],
  ['task-dep-cycle', 'impl.md', '- Depends on: none', '- Depends on: T3'],
  ['adr-duplicate', 'plan.md', '### ADR-2:', '### ADR-1:'],
  ['adr-status', 'plan.md', '- Status: accepted', '- Status: wrong'],
  ['adr-supersede-unknown', 'plan.md', 'superseded by ADR-1', 'superseded by ADR-99'],
  ['log-format', 'impl.md', 'T1 done · completed', 'T1 invalid · completed'],
  ['log-task-unknown', 'impl.md', 'T1 done · completed', 'T99 done · completed'],
  ['placeholder', 'plan.md', 'A small demonstration.', 'A {{placeholder}}.'],
  ['run-name', 'impl.md', '### T1: First task [done]', '### T9: First task [done]'],
  ['handoff-status', 'runs/T1-1/handoff.md', '- Status: DONE', '- Status: invalid'],
  ['impl-done-open-tasks', 'impl.md', '- Status: in-progress', '- Status: done'],
  ['impl-ahead-of-plan', 'plan.md', '- Status: aligned', '- Status: draft'],
  ['plan-aligned-proposed-adr', 'plan.md', '- Status: accepted', '- Status: proposed'],
  ['frontmatter-invalid', 'plan.md', 'format: 2', 'format: abc'],
  ['frontmatter', 'plan.md', 'skill: writing-dev-plans', 'skill: wrong'],
  ['impl-execution', 'impl.md', '- Execution: subagents', '- Execution: invalid'],
  ['plan-glance', 'plan.md', '## At a Glance', '## Summary'],
];
for (const [expected, file, from, to] of cases) test(`detects ${expected}`, () => {
  const dir = copy(); try { change(dir, file, from, to); assert.ok(rules(dir).includes(expected)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('legacy rules and forced format', () => {
  const dir = copy('v1'); try {
    assert.ok(!rules(dir).includes('impl-execution'));
    const result = rules(dir, { asFormat: 2 });
    for (const id of ['impl-execution', 'plan-glance', 'frontmatter']) assert.ok(result.includes(id));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('newer files suppress all dependent interpretation', () => {
  const dir = copy(); try {
    for (const file of ['plan.md', 'impl.md']) { change(dir, file, 'format: 2', 'format: 3'); change(dir, file, '- Status:', '- Invalid:'); }
    change(dir, 'impl.md', '### T1: First task [done]', '### T1 invalid');
    const issues = lintPlanDir(dir, { knownFormat: 2 });
    assert.deepEqual(issues.map(i => i.rule), ['format-newer', 'format-newer']);
    assert.ok(issues.every(i => i.severity === 'warn'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('comments, fences and inline code do not produce prose issues', () => {
  const dir = copy(); try {
    change(dir, 'plan.md', 'A small demonstration.', 'A `{{example}} TODO` example.\n<!-- {{hidden}} TODO -->\n  ~~~\n{{hidden}} TODO\n  ~~~');
    assert.ok(!rules(dir).includes('placeholder')); assert.ok(!rules(dir).includes('tbd'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('warnings, bad run names and malformed log syntax', () => {
  const dir = copy(); try {
    change(dir, 'plan.md', '- [x] Runtime?', '- [ ] Runtime? TODO');
    change(dir, 'impl.md', '2026-11-10 10:00 · T1 done · completed', '2026-11-10 10:00 ·invalid');
    fs.mkdirSync(path.join(dir, 'runs', 'bad'));
    const result = rules(dir);
    for (const id of ['tbd', 'open-question', 'log-format', 'run-name', 'handoff-unlogged']) assert.ok(result.includes(id), id);
    fs.rmSync(path.join(dir, 'runs', 'T2-1'), { recursive: true });
    assert.ok(rules(dir).includes('doing-without-run'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI exit codes and JSON', () => {
  const dir = copy(); try {
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(run(dir).status, 0);
    assert.deepEqual(JSON.parse(run(dir, '--json').stdout).filter(i => i.severity === 'error'), []);
    change(dir, 'plan.md', '- Status: aligned', '- Status: broken');
    assert.equal(run(dir).status, 1);
    assert.equal(run(dir, '--as', 'no').status, 2);
    assert.equal(run(path.join(dir, 'missing')).status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
