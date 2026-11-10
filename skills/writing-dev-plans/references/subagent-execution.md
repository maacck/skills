# Subagent Execution

Load when the user chose `Execution: subagents` at the approval gate. You are the orchestrator: one fresh subagent per task, dispatched natively or with a brief file, results returned as a handoff plus evidence per `references/handoff-contract.md`, and you stay the only writer of `impl.md`.

## Run Folder

```
.plans/<date>-<slug>/
  plan.md
  impl.md
  runs/
    T3-1/
      brief.md       brief dispatch only (references/implementer-prompt.md)
      handoff.md     subagent writes when it stops
      evidence/      subagent writes: verify.log, other proof
    T3-2/            re-dispatch = new folder; never overwrite an attempt
```

`.plans/.gitignore` already ignores everything under `.plans/`; add no ignore rules. Folder name is `<task ID>-<attempt>`, attempts start at 1.

## Loop

1. **Pick** ready tasks: `[todo]` with every `Depends on` task `[done]`. Dispatch several at once only when their Files are disjoint and their Verify commands share no mutable state (database, port, build output, lockfile, generated code); otherwise one at a time.
2. **Dispatch**: create `runs/<Tn>-<k>/`, set the heading `[doing]`, send the task in one of the two forms below. Match the model to the task when the harness allows: mechanical (1–2 files, complete spec) → fast; multi-file integration → standard; design judgment → strongest.
3. **Accept** each returned handoff (Acceptance below).
4. **Track** in `impl.md` immediately after each acceptance: heading status, step checkboxes, Progress log entries citing the run folder.
5. **Milestone end**: run the milestone Verify yourself before starting the next milestone.

## Dispatch

Both forms bind the subagent to `references/handoff-contract.md`: same rules, same `evidence/verify.log`, same `handoff.md`. They differ only in how the task reaches the subagent.

**Native (default)** — the task section in `impl.md` already says everything:

```
Implement <Tn> from <absolute impl.md path>: read the header, Contracts, and the <Tn> section.
Repository root: <absolute path>. Run folder: <absolute runs/<Tn>-1/ path>.
Read <absolute skill-dir>/references/handoff-contract.md first and follow it exactly.
```

Add a `Commits:` line only if the user commits per task.

**Brief** — fill `references/implementer-prompt.md` into `runs/<Tn>-<k>/brief.md` when any of these holds:

| Signal | Why the brief |
|---|---|
| Retry (k > 1) | Previous attempt and what changed must travel with the task |
| Context not in `impl.md`: user answers, earlier discoveries not yet folded in, conversation agreements | The subagent cannot find it otherwise |
| Complex task: ≥3 files, cross-module integration, or judgment calls bound by ADRs or Blindspots | Curated verbatim excerpts beat "go read the plan" |
| Parallel batch while you are amending `impl.md` | The brief freezes the task text at dispatch |

## Acceptance

A handoff is a claim; evidence plus your own checks make it a fact.

- `handoff.md` is complete, and `evidence/verify.log` shows the task's exact Verify command and its expected result.
- Rerun Verify yourself. The log proves the subagent ran it; your rerun proves it still holds, including after parallel work.
- `git status --porcelain` and the diff: changed files ⊆ the task's Files plus declared Deviations. An unexplained file is a failed acceptance until explained.
- Deviations within accepted ADRs → log `deviation`. A deviation that breaks an accepted ADR or a goal → stop and follow SKILL.md › Changing Course.
- Discoveries → log `discovery`; if one affects a pending task, amend that task before dispatching it.

Log on acceptance: `2026-11-10 14:10 · T3 done · Verify rerun: 6/6 pass · runs/T3-1/`

## Handling Status

| Handoff status | Action |
|---|---|
| `DONE` | Run acceptance. Passes → `[done]`. Fails → brief attempt k+1 with the failure under Previous attempt. |
| `DONE_WITH_CONCERNS` | Read the concerns first. Correctness or scope → resolve before `[done]` (fix attempt or plan change). Observations → log `discovery`, then accept. |
| `NEEDS_CONTEXT` | Answer from the repo or plan when you can; a product decision goes to the user (log `needs-user`). Dispatch attempt k+1 with the answer. |
| `BLOCKED` | Missing context → add it, attempt k+1. Task too big → split into new task IDs (impl-only change). Needs more reasoning → stronger model. Plan is wrong → Changing Course. Otherwise `[blocked: reason]` and continue with independent tasks. |

- Never re-dispatch an unchanged instruction; something must differ — context, answer, scope, or model. Retries always use a brief.
- Two failed attempts on the same task → stop and bring it to the user with both run folders.
- A one- or two-line fix found during acceptance: make it yourself, rerun Verify, log it. Anything larger goes to a new attempt.

## Resuming in a New Session

For each task marked `[doing]`, open its latest run folder:
- `handoff.md` present → run acceptance, then track.
- No `handoff.md` → the subagent died. Inspect the diff against the task's Files, then dispatch the next attempt with what you found under Previous attempt.

## Finish

After the last task, continue with SKILL.md › Execute (Done-when check, final report). Cite run folders for every deviation and concern in the report. `runs/` stays local with the rest of `.plans/`.
