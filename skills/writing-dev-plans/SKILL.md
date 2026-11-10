---
name: writing-dev-plans
description: Use when work needs a written plan before coding — unsettled architecture or technology choices, decisions worth recording as ADRs, features spanning many files or milestones, changes in unfamiliar or history-heavy code, work split across subagents and tracked to completion, adjustments to an existing plan, or when the user asks for a design doc, implementation plan, plan review, blindspot pass, or help finding unknown unknowns.
---

# Writing Dev Plans

## Overview

Two documents, one flow: **plan → impl → execution**, all in the current session.

| | Plan `plan.md` | Implementation `impl.md` |
|---|---|---|
| Answers | Which direction, and why? | What exactly gets built, in what order, verified how? |
| Holds | goals, constraints, blindspots, options, ADRs, technology choices, risks, open questions, roadmap | contracts (entities/models/interfaces), milestones, tasks, file scope, example code, progress log |
| Reader | user + AI aligning on direction | an implementer with zero context (you later, or a subagent) |
| Changes | only through user-confirmed direction changes, recorded as ADRs | living tracker until every task is done |

**Core principle:** plans are session working files, not repo artifacts. They live in `.plans/`, which git ignores. Plan, align, implement, and track in the same session.

**Language:** write document contents in the user's language; template headings may be translated. Keep tracking tokens in English: task headings `### T<n>: <name> [status]`, task/document status values, ADR statuses.

## Flow

1. **Plan** — research, write `plan.md`, optional independent review, pass the alignment gate.
2. **Impl** — derive `impl.md` from the aligned plan, self-review, optional independent review, pass the approval gate and choose the execution mode.
3. **Execute** — implement task by task, inline or through subagents, tracking progress in `impl.md`.

**Shortcut:** direction already discussed and confirmed with the user in this conversation → start at step 2 and list the agreed decisions under `Source:` in the impl header.

**Not for:** obvious changes of 1–2 files with no design choice — just do the work.

## Storage

Run from inside the target repository:

```bash
<skill-dir>/scripts/new-plan.sh <kebab-slug> <plan|impl|both>
```

Creates or reuses `.plans/YYYY-MM-DD-<slug>/` at the repository (worktree) root, copies the skeletons, prints absolute paths. `.plans/.gitignore` containing `*` makes the folder ignore itself; the project's own `.gitignore` stays untouched. Warns when run outside git or when `.plans/` has tracked files.

- NEVER `git add -f` plan files. NEVER add `.plans` rules to the project's `.gitignore`.
- Keep a plan in git only on explicit user request (e.g. as a long-term roadmap): copy it to `docs/plans/<slug>/` and say so.

## Templates Are Skeletons

`templates/` gives a starting shape, not a form to fill. Depth follows the problem's complexity, not the skeleton's length; a complex change whose plan merely fills the skeleton is under-planned.

- **Fixed** (tracking and review depend on it): header `Status`, ADR numbering and statuses, task headings `### T<n>: <name> [status]` with `Depends on` and `Verify`, Progress log entry kinds.
- **Free**: everything else. Add, split, rename, reorder, or delete sections. Delete sections that would stay empty.
- When a section is too small for what it must carry, expand it or add a dedicated one. Common additions:

| Signal | Add |
|---|---|
| Entities with a lifecycle (orders, jobs, sessions) | State machine: states, transitions, invariants, illegal transitions |
| Several components, async work, network hops | Sequence diagram; failure, retry, timeout, idempotency per hop |
| Schema or stored-data change | Migration: steps, backfill, dual-read/write window, rollback |
| Public API or protocol | Request/response/error spec, versioning, compatibility |
| Many related entities | Model table or ER diagram with ownership and lifecycle |
| Auth, PII, multi-tenant data | Threat model: actors, assets, abuse cases, mitigations |
| Performance-sensitive path | Budgets, measurement method, benchmark task |
| Risky rollout | Flags, rollout stages, signals to watch, rollback trigger |
| Wide or tricky test surface | Test strategy: layers, fixtures, edge-case matrix |

## Think Before Writing

Research first, write second. A plan built on unread code is fiction.

1. Read the code being changed, its callers, and its tests. Find the existing pattern for this kind of change; the plan follows it, never a second convention.
2. State the problem in one sentence plus the end-to-end check proving it solved (command + expected output, or observable behavior).
3. List hard constraints: compatibility, data migration, performance, allowed dependencies, runtime/deploy environment.
4. Every real decision gets ≥2 options with tradeoffs. Prefer the boring option unless evidence says otherwise. Record the choice.
5. Pre-mortem: "It shipped and broke — why?" Each answer becomes a mitigation, a task, or a risk entry.
6. Surface unknowns (next section): tools answer what they can; the user answers the rest.
7. YAGNI: cut everything the goal does not require; name it under Non-goals.

## Finding Unknowns

Plans fail on what nobody wrote down. Every unknown the plan leaves open becomes a guess during implementation. Sort unknowns by kind; each kind needs a different technique:

| Kind | What it is | Technique |
|---|---|---|
| Known knowns | Stated in the request | Record as goals and constraints |
| Known unknowns | Gaps the user already sees | Options + proposed ADRs; interview |
| Unknown knowns | Tacit preferences the user would recognize but never state | Show, don't ask; ask for a reference |
| Unknown unknowns | Traps in the territory nobody has considered | Blindspot pass |

**Blindspot pass** — before planning changes in code the user hasn't worked in, or any area with history (migrations, reverts, flags). Follow `references/blindspot-prompt.md`: inline, or as a read-only subagent for large areas. Each finding carries evidence, why it bites, and where it lands: Constraint, Risk, ADR, task, or Open Question. Record findings in the Blindspots table. A finding that changes nothing in the plan is noise; drop it.

**Interview** — for what only the user can answer: one question at a time, highest blast radius first (answers that change architecture or data model before naming and UX details). Each question carries your recommended answer and what it would change. Stop once remaining answers would not change the plan; adopt your recommended defaults and list them as assumptions.

**Show, don't ask** — when the user will only "know it when they see it" (output format, API ergonomics, UX, naming): present 2–4 concrete alternatives (sample output, usage snippet, throwaway mock) and let them react. When words run out, ask for a reference (a file, repo, or product that does it right), then state what you will copy and its gotchas.

**Tweakable presentation** — at every gate, lead with the decisions the user is most likely to change (data model, interfaces, user-facing behavior), each with its alternative and "pick this if…". Name the weakest part of the plan. Compress mechanical work to one line.

## Plan

Skeleton: `templates/plan.md`. ADRs live inline under **Decisions**, numbered `ADR-1…`, status `proposed → accepted | superseded by ADR-N`.

**Alignment gate:** present options, proposed ADRs, blindspots, and open questions (tweakable presentation), and offer an independent review ([Review](#review)), then stop — no `impl.md` yet. When the user confirms: mark ADRs `accepted`, record answers under Open Questions, set Status `aligned`, then write `impl.md`.

## Implementation

Skeleton: `templates/impl.md`. Baseline sections by need; add more per [Templates Are Skeletons](#templates-are-skeletons):

| Section | Include when |
|---|---|
| Header: goal, source, approach, done-when | always |
| Blindspots: findings and the task that handles each | no `plan.md` (conversation shortcut) and the blindspot pass found something |
| Contracts: entities, models, interfaces, API/error shapes in real code, defined once | tasks share types, or the data shape is itself a decision |
| Scope: file map with owning task | >5 files, or parallel tasks need disjoint file ownership |
| Milestones: each ends in a working, verifiable state | >~8 tasks, or independently shippable stages |
| Tasks, Progress log | always |

**Task rules:**
- One task = one coherent change a zero-context implementer finishes and verifies in one sitting. Steps are 2–10 minute actions, as checkboxes.
- Self-contained: files, the pattern file to imitate, the Contracts used. Never "same as T2" — a subagent may read only this task.
- `Depends on:` explicit. Tasks with met dependencies and disjoint files may run in parallel; parallel tasks never modify the same file.
- Every task has `Verify:` — exact command and expected result. Test first where the repo tests that layer.
- Code where it pins something down: contracts, non-obvious algorithms, edge cases, migrations, config. Skip boilerplate derivable from the referenced pattern file.
- No commit steps unless the user works that way.

**Forbidden in a finished plan:** TBD/TODO placeholders, leftover `{{…}}`, "add error handling / validation / handle edge cases" without specifics, "similar to Tn", types or functions used but never defined, Modify paths not checked to exist.

**Approval gate:** present Contracts and user-facing decisions first (tweakable presentation), then the milestone/task outline and the Done-when check. In the same question, offer an independent review ([Review](#review)) and the execution mode with your recommendation ([Execute](#execute)). Execute only after the user approves; set Status `approved` and the header `Execution`.

## Tracking Progress

`impl.md` is the single source of truth for progress.

- Task status lives in the heading: `[todo]`, `[doing]`, `[done]`, `[blocked: reason]`, `[dropped: reason]`. Overview: `grep -n '^### T' impl.md`.
- Update at every transition, immediately: heading status, step checkboxes, header Status, one Progress log entry with evidence (`2026-09-25 14:10 · T3 done · repo.test.ts 6/6 pass`). Entry kinds: `done`, `discovery` (a trap or convention found, no plan change), `deviation`, `needs-user`, `change`.
- **Single writer:** the orchestrating agent edits `impl.md`; subagents never do — concurrent edits clobber each other. Subagents write only to their own run folder (`references/subagent-execution.md`).
- Code contradicts a step but the fix stays within accepted ADRs → take the most conservative option, log a `deviation` (plan said / code revealed / choice taken / revisit), continue. Product calls you shouldn't make alone → log `needs-user`, pick the strictest defensible default, continue unless blocked.
- Anything that breaks an accepted ADR or a goal → stop; handle it as a change (next section). Never diverge silently.
- New session: read `plan.md` (Status `draft` → re-present open questions) and `impl.md`; resume at the first task not `done`.

## Changing Course

When the user adjusts the solution — or execution disproves it — after `impl.md` exists, classify the change before editing. Test: *would someone reading only `plan.md` now misunderstand what is being built or why?*

| Change touches | Update |
|---|---|
| Goals, non-goals, constraints, an accepted ADR, technology choice, architecture, roadmap | `plan.md` first: new ADR superseding the old one, amend affected sections. Confirm with the user. Then `impl.md`. |
| Task split, ordering, files, steps, contract details within accepted ADRs | `impl.md` only |

Then in `impl.md`:
- Rewrite affected pending tasks; add new tasks with new IDs, never renumber.
- `[done]` tasks the change invalidates → `[todo]` with what to redo; obsolete tasks → `[dropped: reason]`.
- Update Contracts, Scope, and Done-when if affected.
- Progress log: `<time> · change · <summary> · plan ADR-N` or `· impl only`.

Tell the user which documents changed and why.

## Self-Review Before Presenting

1. Coverage: each goal or requirement maps to ≥1 task.
2. `grep -nE 'TBD|TODO|\{\{' <file>` → every hit is a quoted code identifier, not a placeholder.
3. Names and signatures in tasks match Contracts.
4. Dependency graph has no cycles; parallel tasks share no files.
5. Every task and milestone has a concrete Verify.
6. Depth: take the hardest task. Could a zero-context implementer finish it without asking a question or guessing? If not, add the missing contract, example code, or section.

Fix inline.

## Review

Self-review always runs. An independent review — a fresh read-only subagent with `references/reviewer-prompt.md` — is the user's call, offered as a gate option next to approve/revise.

- Recommend it when the document is high-risk (data migration, security, public API, irreversible step), has >~10 tasks, will run through subagents, or covers unfamiliar code; otherwise list it as optional. Declined → proceed, don't re-offer at the same gate.
- Alignment gate → mode `plan` on `plan.md`; approval gate → mode `impl` on `impl.md`. The user may also ask for a review at any time; same procedure.
- Handling the result: fix blocking issues in the document; the reviewer's user questions go to Open Questions or the interview. Re-present with the verdict, what you changed, and what you rejected and why. Re-review only after substantial fixes, at most two rounds; then the user decides.

## Execute

**Choose the mode** at the approval gate. Recommend from the plan's shape; the user decides:

| Plan shape | Recommend |
|---|---|
| ≤3 tasks, or one chain of tightly coupled tasks | inline — don't ask, state it |
| Tasks need frequent user feedback (UI tuning, exploratory work) | inline |
| >~8 tasks, independent branches in the dependency graph, or a long run that would crowd this session's context | subagents |

Record it in the header (`Execution: inline | subagents`). Switching mid-run: update the header, log a `change`.

Set Status `in-progress`. **Inline:** implement task by task in this session. **Subagents:** follow `references/subagent-execution.md`. Finish with the header's Done-when check, then set Status `done`. Report to the user: every `deviation` and open `needs-user` entry, plus lessons the next plan should know up front (fold them into `plan.md` Blindspots if work continues). Plan files stay in `.plans/`, local only.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Plan written before reading code | Think steps 1–3 first; cite real paths |
| Architecture debate inside `impl.md` | Move it to `plan.md`, align, then plan tasks |
| Direction change edited only in `impl.md` | Supersede the ADR in `plan.md` first |
| Full code for every step | Code only what pins contracts or non-obvious logic |
| Complex change squeezed into the skeleton's sections | Add the sections the problem needs (state machine, migration, sequence, rollout) |
| Task too big ("build the API") | Split until each task has one Verify |
| Subagents editing the tracker | Orchestrator is the only writer |
| `.plans` added to the project `.gitignore` | `.plans/.gitignore` already ignores the folder |
| Planning unfamiliar code without a blindspot pass | Run `references/blindspot-prompt.md` before writing the plan |
| Ten questions dumped on the user at once | Interview: one at a time, highest blast radius first |
| Trusting a subagent's "done" | Accept on evidence: rerun Verify, diff ⊆ task Files |
| Re-dispatching a failed task with the same instruction | New attempt folder with a brief; change context, scope, or model |
| Pushing a review the user declined | Offer once per gate, then proceed |
