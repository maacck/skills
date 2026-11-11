# Architecture decision records

One file per decision that would otherwise be undone by the next person who finds it odd. Template: `assets/templates/docs/adr/NNNN-decision-title.md`.

## When to write one

All three hold:

1. **Hard to reverse**: data shape, storage location, protocol, module boundary, a dependency at the core.
2. **Surprising without context**: a newcomer would "fix" it.
3. **A real trade-off**: at least one serious alternative was rejected for a reason.

Not for: choices a linter enforces, defaults nobody would question, anything still undecided (mark it **Open** in the architecture overview instead).

## Shape

- **File**: `docs/adr/NNNN-<decision-as-a-phrase>.md`, the next number, the decision itself as the slug: `0002-utc-only-backend-time.md`, `0003-random-version-for-optimistic-locking.md`.
- **Title**: the decision, not the question: "Modular monolith with in-repo plugins".
- **Status line**: `Status: accepted (YYYY-MM-DD)`; later `accepted (…); revised (…)` or `superseded by [NNNN](NNNN-….md)`.
- **Body**: one or two paragraphs stating what was decided and the context that forced it; name the files and tools that implement or enforce it.
- **Considered options**: each rejected alternative in bold with why it lost.
- **Consequences**: the costs accepted, not only the benefits; what becomes harder; what to do if the decision is ever reversed.

A paragraph is often enough. An ADR longer than a page is usually a design document with a decision inside; record the decision, link the design.

## Changing a decision

- **Refined** without reversing (an implementation detail moved, a protocol was never built): add `## Revision: <what changed>` to the same file and append the date to the status line.
- **Reversed or replaced**: write a new ADR. Set the old one's status to `superseded by NNNN` and leave its text: it explains what the code used to do.

## Linking

- Conventions and the architecture overview link the ADR where they state the rule: `Time is UTC ([ADR 0002](../adr/0002-utc-only-backend-time.md))`.
- Code that looks wrong without the decision cites it in a docstring or comment: `See docs/adr/0003-random-version-for-optimistic-locking.md.`
- `AGENTS.md` hard rules that have an exception name the ADR that grants it.
- A pull request that makes such a decision adds the ADR; the pull request template asks.
