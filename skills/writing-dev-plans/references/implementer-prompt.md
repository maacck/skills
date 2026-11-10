# Implementer Brief Prompt

Brief dispatch for complex tasks only (when to use it: `references/subagent-execution.md` › Dispatch). Fill the inputs, write everything below the line to `<run-dir>/brief.md`, then dispatch the subagent with only: "Read `<absolute path>/brief.md` and follow it exactly."

Copy task text, Contracts, and constraints **verbatim** — never "see impl.md". The brief freezes what was asked at dispatch time; `impl.md` keeps changing.

---

# Brief: {{Tn}} — {{task name}} (attempt {{k}})

You are implementing one task of an approved implementation plan. You have no other context; this brief is complete by design.

- Repository root: {{absolute path}}
- Run folder: {{absolute path to .plans/<plan>/runs/<Tn>-<k>/}}
- Rules, evidence, and handoff format: {{absolute path to <skill-dir>/references/handoff-contract.md}} — read it first and follow it exactly
- Background, read-only: {{absolute paths to plan.md and impl.md}} — this brief wins where they differ
- Commits: {{only if the user commits per task: the convention; otherwise delete this line}}

## Why this change exists

{{impl.md Goal and Approach, 2–4 lines}}

## Your task

{{the task section copied verbatim from impl.md: heading, Depends on, Files, Context, steps, Verify}}

## Contracts

{{verbatim excerpts of the Contracts this task uses; delete if none}}

## Constraints and traps

{{verbatim: accepted ADRs, Blindspot findings, Constraints, user answers, and earlier tasks' discoveries that touch this task; delete if none}}

## Previous attempt

{{only when k > 1: what attempt k-1 reported, why it was not accepted, and what is different now — answers, added context, narrowed scope. Delete for k = 1.}}
