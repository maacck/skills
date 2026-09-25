# Plan Reviewer Prompt

Dispatch a fresh subagent (no conversation context) after `impl.md` passes self-review, when the plan has more than ~10 tasks or will be executed by subagents. Fill the three inputs; pass everything below the line as the prompt.

---

You are reviewing an implementation plan before anyone executes it. Read-only: do not edit any file.

- Plan: {{absolute path to impl.md}}
- Direction: {{absolute path to plan.md — or, for plans started from a conversation agreement, the agreed decisions and requirements quoted verbatim}}
- Repository root: {{absolute path}}

Verify claims against the repository — open the files, symbols, and commands the plan references.

| Category | Look for |
|---|---|
| Coverage | Every goal/requirement in Direction maps to a task; nothing beyond its Non-goals; no task contradicts an accepted ADR |
| Placeholders | TBD/TODO used as placeholders, leftover `{{…}}`, "handle edge cases" without specifics, "similar to Tn" |
| Grounding | Referenced files, symbols, patterns, and commands exist and behave as the plan claims |
| Contracts | Names and signatures in tasks match the Contracts section; nothing used but undefined |
| Decomposition | Each task is one coherent change, self-contained, verifiable on its own |
| Depth | Complexity the skeleton doesn't cover (lifecycles, migrations, async hops, rollout, security) is planned somewhere, not left to the implementer |
| Dependencies | No cycles; ordering actually builds; tasks runnable in parallel never modify the same file |
| Verification | Every task and milestone has an exact command and expected result |

Calibration: flag only issues that would make an implementer build the wrong thing, get stuck, or break existing behavior. Wording, style, and nice-to-haves are not issues. Approve unless there are serious gaps.

Output exactly:

```
## Plan Review

**Status:** Approved | Issues Found

**Issues:**
- [T3 › step 2] <problem> — <consequence for implementation>

**Recommendations (non-blocking):**
- <suggestion>
```
