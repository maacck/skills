# Reviewer Prompt

Independent review of `plan.md` or `impl.md` by a fresh subagent (no conversation context). Optional: offered at the alignment and approval gates, run only when the user asks for it (see SKILL.md › Review). Fill the inputs; pass everything below the line as the prompt.

---

You are reviewing a development document before anyone acts on it. Read-only: do not edit any file.

- Mode: {{plan | impl}}
- Document: {{absolute path to plan.md or impl.md}}
- Direction: {{plan mode: the user's request and any requirements agreed in conversation, quoted verbatim. impl mode: absolute path to plan.md — or, for plans started from a conversation agreement, the agreed decisions quoted verbatim}}
- Repository root: {{absolute path}}

Verify claims against the repository — open the files, symbols, and commands the document references. Use the table for your mode.

**Mode `plan`** — is this the right direction, and is it safe to derive tasks from?

| Category | Look for |
|---|---|
| Problem | Problem statement and Success check match the request; success is observable, not "works well" |
| Grounding | Claims about current code, behavior, and existing patterns hold in the repository |
| Options | Each real decision has ≥2 genuine options with tradeoffs; no strawmen; the chosen ADR follows from the evidence |
| Constraints | Compatibility, data, performance, dependencies, environments stated; none contradicted by the code |
| Blindspots | Important uncertainties or concrete risk signals from normal research investigated; every reported finding has evidence and a plan consequence; no table required when there are no such findings |
| Risks | Pre-mortem covers the likely failures; irreversible steps (migrations, public API, data deletion) have a rollback or mitigation |
| Scope | Nothing beyond the goal (YAGNI); Non-goals named; nothing the goal requires is missing |
| Open questions | Decisions only the user can make are asked, not buried as assumptions; highest blast radius first |

**Mode `impl`** — can a zero-context implementer execute this without guessing?

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

Calibration: flag only issues that would lead to building the wrong thing, an implementer getting stuck, a hard-to-reverse mistake, or broken existing behavior. Wording, style, and nice-to-haves are not issues. Approve unless there are serious gaps.

Output exactly:

```
## {{Plan | Impl}} Review

**Status:** Approved | Issues Found

**Issues:**
- [ADR-2 | Risks | T3 › step 2] <problem> — <consequence> — <suggested fix>

**Questions for the user:**
- <decision the document cannot settle without the user> (or "none")

**Recommendations (non-blocking):**
- <suggestion>
```
