# Visual document generation guide

## Purpose

The visual document is an **interactive technical document** generated from one Markdown plan (`plan.md` or `impl.md`). A reviewer uses it to see, without reading the Markdown top to bottom: where each decision stands and what it settled, how the technical parts fit together, what gets built or changed and in what order, and what is risky or still open. Structure, diagrams, tables, and click-to-inspect replace long paragraphs.

It is the same plan, not a different message. It never adds claims, never rephrases for effect, and is not a presentation or a pitch. If it reads like the Markdown rendered in a nicer font, it has failed. If a section of the source is missing, it has failed worse.

You design the page. There is no template to fill: choose the sections, layout, diagrams, and interactions the source needs. `assets/visual-sample.html` is the reference for quality and look. The shared kit (look, diagrams, drawer, source rendering) is already in the file; you write the content and layout on top of it.

## Dispatch prompt

Give the subagent this guide and the following filled-in prompt:

```text
Read the visual generation guide at <absolute guide path>, the reference sample at <absolute sample path>, and the source Markdown at <absolute md path>. Write the visual document at <absolute target HTML path> (initialized by visual-status.mjs --init). Mode: <full | sync>. In sync mode, the changed, added, and removed sections are: <selectors from visual-status, or none>. Emphasis from the user: <text, or none>. Follow the guide. Reply with the target path and the output of `visual-status.mjs <plan dir>`.
```

## How the page is built

The initialized file ends with a generated block (kit CSS, kit script, cited source). `--stamp` replaces it every time, so never edit it; whatever you change there is overwritten. Everything above it is yours:

| You write | The kit does |
|---|---|
| Page structure: `<header class="topbar">`, `.layout > nav.toc + main`, sections, footer | Look for the components below, light and dark themes, table-of-contents tracking, theme toggle (`[data-theme-toggle]`) |
| Summary layer: facts, cards, rows, steps, tables, hand-drawn SVG, in your own words cut from the source | - |
| `<div data-src='selector'></div>`, always empty | Fills it with the Markdown the selector picks, verbatim, and renders it (tables, code, Mermaid, highlighting) |
| `<pre class="mermaid">` inside `<div class="diagram" data-links="NodeId:key ...">` | Renders the diagram, adds zoom, pan and full screen, makes linked nodes open the drawer |
| `data-open="key"` on any button or chip, and `<template data-sum="key" data-title="..."> summary html + source placeholders </template>` | Builds the drawer, opens it with Esc closing it first, returns focus |
| `[data-tabs]` with `.tabs > button[data-tab=x]` and `[data-panel=x]` | Tab switching |

Components with kit styles (class names only; look at the sample for the markup): `.fig` (framed figure with `figcaption`, `.tag`, `.cap`), `.card` (`.weak` marks the weakest point), `.pill` (`.ok` `.warn` `.err`), `.chips` / `.chip`, `.btn`, `.facts`, `.checks`, `.choices` / `.choice`, `.rows` / `.row`, `.steps` / `.step`, `.tw` (table), `details.more`, `.kv`, `.grid` with `.g2` `.g3` `.g-wide`, `pre.code`. Page-specific styles go in your own `<style>`; unlayered styles win over the kit.

Do not hand-write: a drawer, zoom or full-screen buttons, theme handling, Markdown rendering, highlight.js or Mermaid loading, the manifest, the kit, or the cited source.

## Citing the source: `data-src` selectors

A selector picks a part of the Markdown. Steps are separated by `>`; each step goes one level down.

| Step | Picks |
|---|---|
| `ADR-3`, `Goals`, `"Risks (pre-mortem)"` | A section by heading: its full text, subsections included. Match the whole heading, or the leading id before `:` / `：`. Quote headings that contain spaces, parentheses, or `>` |
| `Context[2]` | The nth heading when several share a name (the first step must be unique, otherwise stamping reports the candidates) |
| `p` `li` `tr` `code` `quote` `table` | A paragraph, list item, table row (header row excluded), code block, quote, or whole table inside the section before it |
| `[2]` `[1..3]` | The nth block, or a range. Counts from 1 |
| `[lang=mermaid]` | Code blocks by fence language |
| `:has("text")` | Blocks containing the text; steadier than a number when the list may change |
| nested | `Goals > li[2] > li[1]`: the first sub-item of the second item |

Examples: `ADR-3`, `ADR-3 > li:has("Decision")`, `Options > A > li[1..2]`, `"数据集目录（V1）" > tr[2]`, `Architecture > code[lang=mermaid]`, `Roadmap > li[2]`. A row or item comes out with its table header or in its own list, verbatim. A selector that matches nothing, or matches an ambiguous heading, fails stamping and names the step.

Put an attribute value containing `"` in single quotes: `<div data-src='ADR-3 > li:has("Decision")'></div>`.

Selectors at the top of the document (before the first section) use the block step alone: `li`, `p`.

## Voice and wording (hard)

- Professional, neutral, technical, in the register of the source and in its language (do not translate).
- **Use the source's own words.** Headings, labels, and column names are the source's (`ADR-3: ...`, `Context`, `Risks`) or plain functional ones (`Decisions`, `Architecture`, `Files`). Keep identifiers, file names, commands, numbers, and terminology exactly.
- Summaries (one-line outcomes, table cells) are cut from source sentences: drop repetition and filler, keep each fact, number, qualification, and condition. Do not introduce a term, claim, adjective, or emphasis the source does not use.
- Forbidden: slogans, hero statements, rhetorical headings, marketing language, decorative English captions or "eyebrow" labels, invented numbering, evaluative commentary.

## Fidelity rules (hard)

- The given Markdown is the **only content source**. Do not read repository code, other plan files, or conversation history; do not invent facts, relationships, status values, risk levels, or conclusions absent from it.
- **Condense, never drop.** Every constraint, qualification, example, rationale, number, rejected alternative, risk, open question, table row, and code block is present: either at summary level or in the source shown on demand. Content the page has no designed component for still appears, in a section or block you design for it, or as a `data-src` placeholder. Dropping it is never the fallback.
- **Two layers.** The summary layer is static HTML you write; scripts you add may only show, hide, or highlight what is already there. The source layer is `data-src` placeholders the kit fills. Hidden content (collapsed rows, drawers, closed `<details>`, unselected tabs) is fine if reachable by click or keyboard, not hover-only.
- **Summary level carries the key facts.** Without opening anything, each item shows its identifier, status, and outcome (the chosen option), plus rejected alternatives for decisions. Its drawer holds a short summary and, under it, the whole Context / Decision / Consequences / Rejected text via `data-src`.
- **Coverage is by source line.** The initialized file lists, in a comment, the selectors that together reach all content (headings, blank lines, HTML comments, table header rows, the header `Status` line, and progress-log lines are not content). Every line must be reached by some `data-src`, in a drawer template or inline; partial selections leave the remaining lines uncovered and `visual-status.mjs` names them as selectors. A line may be cited more than once. `data-src` inside `<script>`, `<style>`, or comments does not count.
- **Derived views and numbers**: a diagram, table, or count assembled from several sections (component map, file table, dependency graph, status counts) may only restate facts already in the Markdown. Mark derived figures with `<span class="tag">由原文整理</span>` (or the document's language equivalent) in the caption, and cite the underlying text elsewhere with `data-src`. Counts equal the source exactly; never estimated.
- A Mermaid diagram in the source that fails to parse is shown by the kit as source text with an error line. When you redraw it, keep its nodes, edges, and labels, fix only the syntax (quote labels with `()`, `[]`), and cite the original with `Section > code[lang=mermaid]`.
- Escape source text (`&`, `<`, `>`) in text nodes you write, including Mermaid blocks; escape quotes in attribute values.
- Never write hashes or touch the manifest `<script id="plan-source">` or the generated block; the main agent runs `visual-status.mjs --stamp` after review.

## What to take from the reference sample

`assets/visual-sample.html` is a finished page for one plan, written the way you write yours. Open the file and read the markup after the `<style>`. Borrow; do not copy its section list.

| Borrow | Detail |
|---|---|
| Page frame | Sticky top bar (title, source path, theme toggle), table of contents, one document column, footer linking the source with "以 md 为准" |
| Components | Fact strip, cards (with a warning variant for the weakest point), option cards, expandable decision rows, milestone steps, `<details>` for background material, chips that open a drawer |
| Diagrams | `.fig` with a `.diagram` and `data-links`: a component map where each node opens a drawer with files, milestone, risks, constraining decisions; sequence diagrams; hand-drawn SVG for what Mermaid cannot show (time ruler, bar chart, matrix) |
| Drawers | `<template data-sum>`: a short summary and the source placeholders; never the source text |
| Light script | None needed. If you add one, it may only read the markup |

## Minimum bar (hard)

A page that misses any of these has not been designed, whatever its coverage:

| Element | Required | Not acceptable |
|---|---|---|
| Header | Title, status badge, date, and a fact strip of counts (decisions, milestones, risks, answered/total questions) | The header lines as a bullet list |
| Decisions (or tasks in an impl) | One compact row per item at summary level: ID, title, one-line outcome cut from the source, rejected options, status. The full text opens in a drawer (click and Enter/Space) | Every item printed in full, one card after another |
| Architecture | A drawn diagram of components and data flow with the source's edge labels, readable at a glance, linked nodes opening what the source ties to them (files, milestone, risks, constraining decisions) | Cards with arrow characters in the text; Mermaid source in a `<details>` as the only diagram |
| Cross-links | Every ADR / task / milestone ID shown outside its own row is a `data-open` control | Plain-text IDs |
| Delivery | Milestones as ordered steps with their verification; a derived file table when the source names files | Roadmap as a numbered list |
| Background | Context, goals, and non-goals laid out compactly; blindspots, answered questions, and assumptions collapsed by default | Background sections at full length before the decisions |
| Beyond components | At least one figure drawn from this plan's own content (a flow, ruler, matrix, chart, or map the source implies) | A page built only from the kit's generic components |

For an impl, the task graph (dependencies, status colors, click to select) takes the architecture diagram's place, and contracts sit next to the tasks that use them.

## Structure

Choose sections from the source, in reading order: orientation first (header facts, At a Glance, success check, constraints), then structure, decisions, delivery, risks, background. Usual set for a **plan**: overview, architecture, decisions, roadmap, files (derived), risks, background (context, goals, non-goals, blindspots, open questions, assumptions). For an **impl**: overview (tasks by status and milestone), contracts, milestones with Verify, tasks (status, depends on, files, steps, verify; dependency graph), files (file → tasks), discoveries and deviations from the Progress Log if present.

Skip a section only when the source has nothing for it. Give anything outside the usual set its own designed treatment:

| Source content | Treatment |
|---|---|
| State machine, lifecycle | Diagram of states and transitions plus a transition table (from, event, to, guard) |
| Migration, rollout, backfill | Ordered steps with their checks and rollback, phase boundaries visible |
| Request path, sequence, async hops | Sequence diagram, then per-hop notes |
| Option comparison | Comparison table: options × the source's criteria, chosen option marked |
| Contracts, schemas, API shapes | Code blocks with the source's code, grouped by the entity they define (`data-src` with `code`) |
| Anything else | A section with the source's heading and its content laid out as cards, tables, or lists; a `data-src` placeholder if no layout fits |

Draw the technical structure the source describes (components, data flow, states, file layout) as diagrams, not paragraphs.

## Technical requirements

- One HTML file that works opened from disk. The generated block inlines the kit; Mermaid, marked, DOMPurify, and highlight.js load from pinned CDN modules, and when they fail the page stays readable (source text shows as plain text, Mermaid source stays visible with an error line).
- Colors come from the kit's CSS variables (`--bg --paper --raised --wash --selected --ink --muted --faint --line --line-strong --accent --accent-ink --accent-wash --success --warning --warning-wash --error --error-wash --syn-*`), so both themes work; hand-drawn SVG uses them too. Keep the defaults unless the user asks for a different look or the plan's subject calls for one. To change the theme, override these variables in your own `<style>` (never in the generated block): put the dark values in `:root` and the light values in `:root[data-theme="light"]`, always both, because a plain `:root` override also applies in light. Change only values, not names; Mermaid, code highlighting, and kit components follow the variables. Every text color keeps WCAG AA contrast (4.5:1, 3:1 for large text) against `--paper`, `--raised`, and `--wash` in both themes; the script does not check this, so check it yourself.
- The viewer embeds the page in a sandboxed iframe and posts `{ type: 'plan-theme', theme }`; the kit follows it and hides `[data-theme-toggle]`. No `localStorage`, cookies, or parent DOM access.
- Accessible names on controls and diagrams (`role="img"` and `aria-label` on `.diagram`), visible focus, WCAG AA contrast in both themes, `prefers-reduced-motion` respected, no horizontal scroll at 390 px width.

## Sync mode

Rewrite only the summary elements, templates, and diagram nodes that belong to the listed changed sections, insert added sections at their source position (adding `data-src` selectors), remove the elements of removed sections, and update derived figures that draw on any of them. Cited source follows the Markdown on the next stamp; do not copy it. Leave everything else unchanged.

## Review checklist (main agent, before stamping)

- `node <skill-dir>/scripts/visual-status.mjs <plan-dir>`: no `missing data-src`, no `broken data-src`, `kit` is `ok` or `linked`.
- Completeness: walk the Markdown section by section; every section, table row, nested bullet, and code block has a home on the page. Pay most attention to sections outside the usual set and to ADRs or tasks carrying extra tables or code.
- Fidelity of the summary layer: pick three ADRs (or tasks) and compare their rows and drawer summaries with the source; every risk row and open question is present; every diagram node and edge exists in the source.
- Minimum bar: every row of the [Minimum bar](#minimum-bar-hard) table holds; any "not acceptable" pattern sends the page back.
- Interaction: open the file in a browser; every diagram renders (no error line), zoom and full screen work, every `data-open` control opens its drawer with the source filled, theme toggles. Controls that do nothing fail.
- Look: palette and type match the sample in both themes, or the page overrides the variables for both themes (dark in `:root`, light in `:root[data-theme="light"]`) with readable contrast; technical structure is drawn, not left as prose; no slogans or invented labels.
