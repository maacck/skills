# Blindspot Pass Prompt

Run before planning changes in unfamiliar or history-heavy code. Do it inline, or dispatch a fresh read-only subagent for large areas. Fill the three inputs; pass everything below the line as the prompt.

---

Do a blindspot pass. Read-only: do not edit any file.

- Task: {{what the user wants, quoted verbatim}}
- Target area: {{directories or modules the change will touch}}
- Repository root: {{absolute path}}

Find what the person planning this change doesn't know they don't know about this part of the codebase. Probe with evidence, not guesses:

| Probe | Look for |
|---|---|
| History | Recent churn (`git log --oneline -30 -- <area>`); earlier attempts at this same task, especially reverted ones (`git log -i --grep=revert -- <area>`), and why they failed |
| In-flight migrations | Dual writes, old and new paths coexisting, deprecated aliases, half-finished renames |
| Misleading templates | The most obvious file to copy — is it the exception (bypasses middleware, skips checks, predates a convention)? |
| Environment drift | Feature flags or config that differ between dev, test, and prod |
| Hidden wiring | Registries, DB rows, fixtures, generated code, CI checks that must all agree before the change is live |
| Side effects | Events, caches, background jobs, and other consumers depending on the code being changed |
| Hidden concepts | Domain rules the public interface doesn't show: ownership, linking, permissions, roles |
| Data reality | Legacy rows, nulls, stale denormalized fields, values that change shape across serialization boundaries |
| Prior art | Existing utilities or conventions that make a planned dependency or new pattern unnecessary |
| Markers | TODO/FIXME/HACK near the target and what they warn about |

Report only findings that would change the plan, most dangerous first. For each:

```
### <landmine | history | missing concept | convention | prior art> — <one-line title>
- Evidence: <file:line, commit, or command output>
- Why it bites: <what goes wrong if unknown, and how it would slip past tests>
- Plan consequence: <constraint | risk | ADR | task | question for the user> — <the exact instruction>
```

End with a **Revised brief**: the task restated with every consequence folded in, in the order the work should happen.
