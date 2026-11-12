---
skill: writing-dev-plans
format: 2
---
<!-- Skeleton, not a form: add, split, rename, reorder, or delete sections to fit the problem. Keep only the tracking formats fixed (frontmatter (skill, format), Status, ADR numbering/status, ## At a Glance). -->

# {{Title}} · Plan

- Status: draft <!-- draft | aligned | superseded -->
- Date: {{DATE}}
- Success check: {{observable end-to-end result proving the direction works}}
- Implementation: ./impl.md <!-- written after alignment -->

## At a Glance

<!-- Fixed heading. 3–5 bullets: decisions the user is most likely to change (with the alternative), the weakest part of the plan, what you need from the user. -->

- {{decision most likely to change}} — alternative: {{option}}
- Weakest part: {{…}}

## Context

{{Problem in 1–3 sentences, why now, current state with file references.}}

## Goals

- {{Observable outcome}}

## Acceptance Criteria

<!-- Key or ambiguous cases only; do not restate Goals, force a count, or enumerate every edge case.
     Use AC-1, AC-2, … for reference. Scenario = necessary preconditions + action; Expected result = observable behavior, not implementation.
     Keep undecided behavior in Open Questions until confirmed. -->

| ID | Scenario | Expected result |
|---|---|---|
| AC-1 | {{necessary preconditions and action}} | {{observable result}} |

## Non-goals

- {{Explicitly out of scope}}

## Constraints

- {{Compatibility, performance, dependencies, environments, deadlines}}

## Blindspots

<!-- From the blindspot pass. Kind: landmine | history | missing concept | convention | prior art. Delete if the area is well known. -->

| Finding | Kind | Why it bites | Lands in |
|---|---|---|---|
| {{finding, with file or commit reference}} | {{kind}} | {{what goes wrong if unknown}} | {{Constraint / Risk / ADR-N / Open Question}} |

## Options

### A: {{name}}

- Approach: {{how it works}}
- Pros: {{strengths}}
- Cons: {{costs, risks}}

### B: {{name}}

- Approach: {{how it works}}
- Pros: {{strengths}}
- Cons: {{costs, risks}}

## Decisions

### ADR-1: {{decision title}}

- Status: proposed <!-- proposed | accepted | superseded by ADR-N -->
- Context: {{forces at play}}
- Decision: {{what we do}}
- Consequences: {{what gets easier, what gets harder}}
- Rejected: {{alternative}} — {{why}}

## Architecture

<!-- Only if structure changes: components, boundaries, data flow. Mermaid allowed. Delete otherwise. -->

## Risks (pre-mortem)

| Risk | Impact | Mitigation |
|---|---|---|
| {{risk}} | {{impact}} | {{mitigation}} |

## Open Questions

<!-- Interview in rounds: ask only questions whose prerequisites are settled, highest blast radius first. On alignment, check each box and record the answer after it. -->

- [ ] {{Question only the user can answer}} — recommended: {{default}}; changes: {{what}}

## Assumptions

<!-- Low-impact questions not asked: the default adopted. Delete if none. -->

- {{Assumption}}

## Roadmap

1. {{Milestone}} — {{verifiable outcome}}
