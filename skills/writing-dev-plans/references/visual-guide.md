# Visual document generation guide

## Purpose

The visual document is an **interactive technical document** generated from one Markdown plan (`plan.md` or `impl.md`). A reviewer uses it to see, without reading the Markdown top to bottom: where each decision stands and what it settled, how the technical parts fit together, what gets built or changed and in what order, and what is risky or still open. Structure, diagrams, tables, and click-to-inspect replace long paragraphs.

It is the same plan, not a different message. It never adds claims, never rephrases for effect, and is not a presentation or a pitch. If it reads like the Markdown rendered in a nicer font, it has failed. If a section of the source is missing, it has failed worse.

You design the page. There is no template to fill: choose the sections, layout, diagrams, and interactions the source needs. `assets/visual-sample.html` is the reference for quality and look.

## Dispatch prompt

Give the subagent this guide and the following filled-in prompt:

```text
Read the visual generation guide at <absolute guide path>, the reference sample at <absolute sample path>, and the source Markdown at <absolute md path>. Write the visual document at <absolute target HTML path> (initialized by visual-status.mjs --init). Mode: <full | sync>. In sync mode, the changed, added, and removed unit IDs are: <lists from visual-status, or none>. Emphasis from the user: <text, or none>. Follow the guide. Reply with the target path and the number of required units covered.
```

## Voice and wording (hard)

- Professional, neutral, technical, in the register of the source and in its language (do not translate).
- **Use the source's own words.** Headings, labels, and column names are the source's (`ADR-3: ...`, `Context`, `Risks`) or plain functional ones (`Decisions`, `Architecture`, `Files`). Keep identifiers, file names, commands, numbers, and terminology exactly.
- Summaries (one-line outcomes, table cells) are cut from source sentences: drop repetition and filler, keep each fact, number, qualification, and condition. Do not introduce a term, claim, adjective, or emphasis the source does not use.
- Forbidden: slogans, hero statements, rhetorical headings, marketing language, decorative English captions or "eyebrow" labels, invented numbering, evaluative commentary.

## Fidelity rules (hard)

- The given Markdown is the **only content source**. Do not read repository code, other plan files, or conversation history; do not invent facts, relationships, status values, risk levels, or conclusions absent from it.
- **Condense, never drop.** Every constraint, qualification, example, rationale, number, rejected alternative, risk, open question, table row, and code block is present: either at summary level or in the detail view of its item. Content the page has no designed component for still appears, in a section or block you design for it, or as the source text itself. Dropping it is never the fallback.
- **Content lives in the markup.** Write all content as static HTML. Scripts only add interaction (show/hide, highlight, draw connector lines between existing elements); they never generate content from embedded data. Hidden content (collapsed rows, unselected panels, closed `<details>`) is fine if it is reachable by click or keyboard, not hover-only.
- **Summary level carries the key facts.** Without opening anything, each item shows its identifier, status, and outcome (the chosen option), plus rejected alternatives for decisions. The detail view holds the full Context / Decision / Consequences / Rejected text, including nested bullets, tables, and code.
- **`data-src` coverage.** The initialized file lists the required unit IDs in a `required data-src` comment. Put `data-src="<unit id>"` on the element that holds that unit's full content (any element, any order; a unit may span several elements with the same ID). IDs: `header` (text before the first section), `ADR-N` / `Tn` / `Mn`, `sec:<slug>` for other sections. Use the listed IDs exactly; do not invent others. Questions and risk rows belong to their containing section. `data-src` inside `<script>` or comments does not count.
- **Derived views and numbers**: a diagram, table, or count assembled from several units (component map, file table, dependency graph, status counts) may only restate facts already in the Markdown. Wrap derived diagrams and tables in `<figure data-derived="<unit ids it draws on>">` with a plain caption, and keep the underlying units present elsewhere with their own `data-src`. Counts equal the source exactly; never estimated.
- Escape source text (`&`, `<`, `>`) in text nodes, including inside `<pre>` and Mermaid blocks; escape quotes in attribute values.
- Never write hashes or touch `<script type="application/json" id="plan-source">`; the main agent runs `visual-status.mjs --stamp` after review.

## What to take from the reference sample

`assets/visual-sample.html` is a finished document for one plan. Open it in a browser and read its source. Borrow; do not copy its section list.

| Borrow | Detail |
|---|---|
| Palette and type | The `:root` / `:root[data-theme="light"]` variables (including the `--syn-*` syntax colors), font stacks, sizes, spacing. Copy the variable block as is so every visual matches the viewer. |
| Page frame | Sticky top bar (title, source path, theme toggle), left table of contents with scroll tracking, one document column, footer linking the source with "以 md 为准". |
| Components | Fact strip, cards (with a warning variant for the weakest point), expandable decision rows with a detail grid (chosen / rejected / consequences), tables with grouped rows, milestone steps, `<details>` for background material, chips that jump to an ADR, highlighted code blocks (ADR-3, ADR-8 details). |
| Interaction patterns | Component map: click a node to dim unrelated nodes and show an inspector panel (files, milestone, risks, constraining ADRs); click an ADR or milestone to highlight its components; Escape clears. Rows expand with Enter/Space and keep `aria-expanded` in sync. Chips scroll to and open their target. |
| Static content, light script | Inspector panels exist in the markup (`hidden`), relations sit in `data-*` attributes, and the script only reads them. |

Work from the sample's code: copy its `<style>` and interaction script into your file, then restructure the markup for your source and adapt the script's selectors. This is faster than writing CSS and interaction from scratch and keeps every visual consistent.

## Minimum bar (hard)

A page that misses any of these has not been designed, whatever its coverage:

| Element | Required | Not acceptable |
|---|---|---|
| Header | Title, status badge, date, and a fact strip of counts (decisions, milestones, risks, answered/total questions) | The header lines as a bullet list |
| Decisions (or tasks in an impl) | One compact row per item at summary level: ID, title, one-line outcome cut from the source, rejected options, status. The full text opens in an expandable detail (click and Enter/Space) | Every item printed in full, one card after another |
| Architecture | A drawn map: components placed in layers or lanes, connectors drawn (SVG) with the source's edge labels, legend if line styles differ. Clicking a component shows an inspector with what the source ties to it (files, milestone, risks, constraining ADRs) and dims the rest | Cards with arrow characters in the text; Mermaid source in a `<details>` as the only diagram |
| Cross-links | Every ADR / task / milestone ID shown outside its own row is a control that opens it; selecting an ADR or milestone highlights its components on the map | Plain-text IDs |
| Delivery | Milestones as ordered steps with their verification; a derived file table when the source names files | Roadmap as a numbered list |
| Background | Context, goals, and non-goals laid out compactly; blindspots, answered questions, and assumptions collapsed by default | Background sections at full length before the decisions |

For an impl, the task graph (dependencies, status colors, click to select) takes the architecture map's place, and contracts sit next to the tasks that use them.

## Structure

Choose sections from the source, in reading order: orientation first (header facts, At a Glance, success check, constraints), then structure, decisions, delivery, risks, background. Usual set for a **plan**: overview, architecture, decisions, roadmap, files (derived), risks, background (context, goals, non-goals, blindspots, open questions, assumptions). For an **impl**: overview (tasks by status and milestone), contracts, milestones with Verify, tasks (status, depends on, files, steps, verify; dependency graph), files (file → tasks), discoveries and deviations from the Progress Log if present.

Skip a section only when the source has nothing for it. Give anything outside the usual set its own designed treatment:

| Source content | Treatment |
|---|---|
| State machine, lifecycle | Diagram of states and transitions plus a transition table (from, event, to, guard) |
| Migration, rollout, backfill | Ordered steps with their checks and rollback, phase boundaries visible |
| Request path, sequence, async hops | Sequence diagram, then per-hop notes |
| Option comparison | Comparison table: options × the source's criteria, chosen option marked |
| Contracts, schemas, API shapes | Code blocks with the source's code, grouped by the entity they define |
| Anything else | A section with the source's heading and its content laid out as cards, tables, or lists; the source text itself if no layout fits |

Draw the technical structure the source describes (components, data flow, states, file layout) as diagrams and maps, not paragraphs.

## Technical requirements

- One self-contained HTML file; opened directly from disk it must work. No network except pinned CDN modules, and the page stays readable when they fail.
- Mermaid if needed: `import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'`, `securityLevel: 'strict'`, colors from the CSS variables. Keep the diagram source readable as the fallback, with the source's node names. Hand-drawn SVG and HTML maps are fine; color them with CSS variables.
- Code blocks: every fenced block in the source becomes `<pre class="code"><code class="language-<fence language>">` holding the code verbatim and escaped (never trimmed, paraphrased, or merged into prose). Unlabelled fences use `language-plaintext`. Copy the sample's `pre.code` and `.hljs-*` CSS and its highlight module script (the last `<script type="module">`): it colors the blocks with highlight.js from the CDN and leaves them plain when offline. Inline code stays `<code>`; Mermaid source stays `pre.mermaid`.
- Light and dark through `data-theme` on `<html>`. When embedded, the viewer posts `{ type: 'plan-theme', theme }` from the parent window: follow it and hide the page's own theme toggle (see the sample's last lines).
- The viewer embeds the page in a sandboxed iframe without same-origin access: no `localStorage`, cookies, or parent DOM access.
- Accessible names on controls and diagrams, visible focus, WCAG AA contrast in both themes, `prefers-reduced-motion` respected, no horizontal scroll at 390 px width.

## Sync mode

Rewrite only the elements carrying the listed changed unit IDs, insert added units at their source position, remove removed units, and update derived views that draw on any of them (`data-derived`). Leave everything else unchanged.

## Review checklist (main agent, before stamping)

- `node <skill-dir>/scripts/visual-status.mjs <plan-dir>`: no `missing data-src`; review any `unknown data-src`.
- Completeness: walk the Markdown section by section; every section, table row, nested bullet, and code block has a home on the page. Pay most attention to sections outside the usual set and to ADRs or tasks carrying extra tables or code.
- Fidelity: pick three ADRs (or tasks) and compare their detail views with the source; every risk row and open question is present; every diagram node and edge exists in the source.
- Minimum bar: every row of the [Minimum bar](#minimum-bar-hard) table holds; any "not acceptable" pattern sends the page back.
- Interaction: open the file; use every control (selection, expand, jump, theme). Controls that do nothing fail.
- Look: palette and type match the sample in both themes; technical structure is drawn, not left as prose; no slogans or invented labels.
