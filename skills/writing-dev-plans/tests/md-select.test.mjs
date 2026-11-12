// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelectorError, parseTree, pathOf, sectionsUnder, select, sourceText } from '../scripts/lib/md-select.mjs';

const md = `# Title

- Status: draft
- Date: 2026

Intro paragraph.

## Goals

- One
- Two
  - Nested a
  - Nested b
- Three

## Decisions

### ADR-1: First

- Status: accepted
- Decision: Use X.

### ADR-2: Second

| Col | Val |
| --- | --- |
| a | 1 |
| b | 2 |

\`\`\`json
{ "k": 1, "## not a heading": true }
\`\`\`

## Notes

### Context

First context.

## Other

### Context

Second context.

### Quoted > name

Odd heading.
`;
const tree = parseTree(md);
const pick = sel => sourceText(tree, select(tree, sel));
const fails = (sel, pattern) => assert.throws(() => select(tree, sel), error => error instanceof SelectorError && pattern.test(error.message));

test('headings match by id prefix or full text, sections include subsections', () => {
  assert.match(pick('ADR-1'), /^### ADR-1: First\n[\s\S]*- Decision: Use X\.$/);
  assert.equal(pick('"Quoted > name"').split('\n')[0], '### Quoted > name');
  assert.equal(pick('Decisions > ADR-1 > li[1]'), '- Status: accepted');
  assert.match(pick('Decisions'), /ADR-2: Second[\s\S]*"## not a heading"/);
});

test('duplicate headings are ambiguous until parent or index disambiguates', () => {
  fails('Context', /ambiguous .*Context \(L\d+\) \| Context \(L\d+\)/);
  assert.equal(pick('Notes > Context > p'), 'First context.');
  assert.equal(pick('Context[2] > p'), 'Second context.');
});

test('block steps: list items, nesting, ranges, text and language filters', () => {
  assert.deepEqual(select(tree, 'li').map(n => n.start), [2, 3], 'root items only');
  assert.equal(pick('p'), 'Intro paragraph.');
  assert.equal(pick('Goals > li[2]'), '- Two\n  - Nested a\n  - Nested b');
  assert.equal(pick('Goals > li[2] > li[2]'), '- Nested b');
  assert.equal(pick('Goals > li[1..2]').split('\n')[0], '- One');
  assert.equal(pick('ADR-1 > li:has("Decision")'), '- Decision: Use X.');
  assert.equal(pick('ADR-2 > code[lang=json]'), '```json\n{ "k": 1, "## not a heading": true }\n```');
});

test('table rows carry their header once', () => {
  assert.equal(pick('ADR-2 > tr[2]'), '| Col | Val |\n| --- | --- |\n| b | 2 |');
  assert.equal(pick('ADR-2 > tr[1..2]'), '| Col | Val |\n| --- | --- |\n| a | 1 |\n| b | 2 |');
  assert.equal(pick('ADR-2 > table').split('\n').length, 4);
});

test('failures name the step and never match silently', () => {
  fails('ADR-9', /no match at "ADR-9"/);
  fails('Goals > li[9]', /no match at "li\[9\]"/);
  fails('Goals > li[0]', /bad filter \[0\]/);
  fails('Goals > li > p', /p cannot follow li/);
  fails('ADR-1 > "Context"', /no match/);
  fails('Goals >', /malformed/);
  fails('"Goals', /malformed/);
});

test('pathOf returns the shortest selector that resolves back to the section', () => {
  const all = sectionsUnder(tree.root);
  for (const sec of all) assert.deepEqual(select(tree, pathOf(tree, sec)), [sec], pathOf(tree, sec));
  const paths = all.map(sec => pathOf(tree, sec));
  assert.ok(paths.includes('ADR-1') && paths.includes('Notes > Context') && paths.includes('"Quoted > name"'), paths.join(' | '));
});
