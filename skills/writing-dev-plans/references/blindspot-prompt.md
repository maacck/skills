# Blindspot Pass Prompt

Use when normal code/caller/test reading leaves an uncertainty that could change the plan or reveals a concrete risk signal, or when explicitly requested. Investigate only those gaps, inline or with a fresh read-only subagent for large areas. Fill the three inputs; pass everything below the line as the prompt.

---

Do a blindspot pass. Read-only: do not edit any file.

- Task: {{what the user wants, quoted verbatim}}
- Target area: {{directories or modules the change will touch}}
- Repository root: {{absolute path}}

Investigate the important uncertainties or concrete risk signals in the target area with evidence, not guesses. The probes below are a menu, not a checklist: select only those relevant to the change, reuse evidence already gathered, and do not repeat settled research. Stop when relevant uncertainties are resolved or recorded as evidence-backed constraints, risks, or open questions.

| Probe | Look for |
|---|---|
| History | Only with a history-related risk signal: relevant earlier attempts, reverts, or migration decisions and why they still constrain this change. Do not browse history by default |
| In-flight migrations | Dual writes, old and new paths coexisting, deprecated aliases, half-finished renames |
| Misleading templates | The most obvious file to copy — is it the exception (bypasses middleware, skips checks, predates a convention)? |
| Environment drift | Feature flags or config that differ between dev, test, and prod |
| Hidden wiring | Registries, DB rows, fixtures, generated code, CI checks that must all agree before the change is live |
| Side effects | Events, caches, background jobs, and other consumers depending on the code being changed |
| Hidden concepts | Domain rules the public interface doesn't show: ownership, linking, permissions, roles |
| Data reality | Legacy rows, nulls, stale denormalized fields, values that change shape across serialization boundaries |
| Prior art | Existing utilities or conventions that make a planned dependency or new pattern unnecessary |
| Markers | TODO/FIXME/HACK near the target and what they warn about |

Report only evidence-backed findings that would change the plan, most dangerous first. If there are none, say so in one sentence and stop; omit the Blindspots table. For each finding:

```
### <landmine | history | missing concept | convention | prior art> — <one-line title>
- Evidence: <file:line, commit, or command output>
- Why it bites: <what goes wrong if unknown, and how it would slip past tests>
- Plan consequence: <constraint | risk | ADR | task | question for the user> — <the exact instruction>
```
