---
skill: writing-dev-plans
format: 2
---
<!-- Skeleton, not a form: add, split, rename, reorder, or delete sections to fit the problem. Keep only the tracking formats fixed (frontmatter (skill, format), Status, Execution, `### T<n>: name [status]`, Depends on, Verify, Progress log kinds). -->

# {{Title}} · Implementation

- Status: draft <!-- draft | approved | in-progress | done -->
- Execution: inline <!-- inline | subagents; set at the approval gate; subagent runs live in ./runs/ -->
- Date: {{DATE}}
- Source: {{./plan.md — or "agreed in conversation, DATE" followed by the agreed decisions as bullets}}
- Goal: {{One sentence}}
- Approach: {{2–3 sentences: architecture and key choices}}
- Done when: `{{end-to-end command}}` → {{expected result}}

## Blindspots

<!-- Only when there is no plan.md (conversation shortcut); otherwise they live in plan.md. Delete if unused. -->

| Finding | Kind | Why it bites | Handled by |
|---|---|---|---|
| {{finding, with file or commit reference}} | {{landmine / history / missing concept / convention / prior art}} | {{what goes wrong if unknown}} | {{Tn / Contracts}} |

## Contracts

<!-- Shared entities, models, interfaces, API/error shapes in real code. Tasks reference them by name. Delete if unused. -->

```{{lang}}
{{definitions}}
```

## Scope

<!-- Optional: >5 files, or parallel tasks. One owning task per file. Delete if unused. -->

| File | Action | Responsibility | Task |
|---|---|---|---|
| `{{path}}` | {{create / modify / delete}} | {{one line}} | T1 |

## Milestones

<!-- Optional: >~8 tasks, or independently shippable stages. Each ends working and verifiable. Delete if unused. -->

### M1: {{name}}

- Tasks: T1
- Verify: `{{command}}` → {{expected}}

## Tasks

<!-- Heading status: [todo] [doing] [done] [blocked: reason] [dropped: reason]. New tasks get new IDs; never renumber. -->

### T1: {{name}} [todo]

- Depends on: none
- Files: `{{path}}` (create), `{{path}}` (modify)
- Context: follow `{{pattern file}}`; uses Contracts › `{{Type}}`
- [ ] {{step}}
- [ ] {{step}}
- Verify: `{{command}}` → {{expected}}

## Progress Log

<!-- Kinds: done | discovery | deviation | needs-user | change -->
<!-- YYYY-MM-DD HH:MM · T1 done · evidence -->
<!-- YYYY-MM-DD HH:MM · T2 deviation · plan said X / code revealed Y / chose Z / revisit W -->
<!-- YYYY-MM-DD HH:MM · T2 needs-user · decision needed · default taken -->
<!-- YYYY-MM-DD HH:MM · change · summary · plan ADR-N | impl only -->
