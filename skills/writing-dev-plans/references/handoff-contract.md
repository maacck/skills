# Handoff Contract

Rules for every implementer subagent, whether dispatched natively or with a brief. Read it fully before starting. Your dispatch instruction gives the task, the repository root, and your run folder.

## Rules

- Change only the files listed under the task's Files. If you need another file and it is purely supporting (fixture, test helper) and outside the plan's other tasks, change it and list it under Deviations; otherwise stop with `NEEDS_CONTEXT`.
- Never edit `plan.md`, `impl.md`, or other run folders. In your run folder write only `handoff.md` and files under `evidence/`.
- Follow the pattern file named in the task's Context. No new dependencies, conventions, or abstractions the task does not require.
- Do not commit unless your instruction says to.
- An ambiguity that changes behavior → stop with `NEEDS_CONTEXT` and your recommended answer. Do not guess.
- Verify fails and the fix lies outside the task's scope → `BLOCKED`, never `DONE`.

## Evidence

Run the task's Verify exactly as written. Save to `evidence/verify.log`: the command on the first line, the full output, the exit code on the last line. Put any other proof you rely on (extra test runs, request/response captures, screenshots) under `evidence/` too.

## Handoff

When you finish or stop, write `handoff.md` in the run folder in exactly this shape, then reply with only its absolute path and the Status line.

```markdown
# Handoff: <task ID> attempt <k>

- Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- Summary: <1–3 sentences>

## Files changed

- `<path>` (created | modified | deleted) — <what changed>

## Verify

- Command: `<exact command>`
- Result: pass | fail — <decisive line, e.g. "6 passed">
- Evidence: evidence/verify.log

## Deviations

- plan said <X> / code revealed <Y> / chose <Z>   (or "none")

## Discoveries

- <trap or convention later tasks should know>   (or "none")

## Concerns and questions

- <the concern or question> — recommended: <answer or resolution>   (or "none")
```
