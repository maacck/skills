# Product and architecture documents

Three documents answer "what are we building, exactly, and in what shape". Templates: `assets/templates/docs/product/` and `assets/templates/docs/architecture/overview.md`.

## docs/product/overview.md

The canonical scope. Drafting may happen in chat, tickets, or other languages; a decision counts once it is recorded here.

1. **Status line**: `Status: V1 scope agreed on <date>.` plus pointers to `requirements.md` and `CONTEXT.md`.
2. **What it is**: one paragraph, then one sentence on what it is not.
3. **Problems it solves**: numbered, from the users' side.
4. **Users and success criteria**: table `Persona | Needs | Success looks like`. Success criteria are observable ("Deactivation ends the user's sessions immediately").
5. **Scope**: bold area names, one line each.
6. **Later** and **Out of scope**: so nobody re-proposes them as new.
7. **Decisions**: product choices with the date and the reason, one line each. Technical decisions go to ADRs.
8. **Open questions**: link to the requirements' list.

## docs/product/requirements.md

Scope turned into requirements that can be built and accepted.

- **IDs**: `AREA-n` (`ROLE-1`, `SIGN-6`). Issues, pull requests, tests, and code comments cite them; an ID never changes meaning. A removed requirement keeps its ID, struck through or marked removed.
- **Placeholders are marked** `_(proposed)_` and settled in the plan for the work that implements them; values without the mark follow a recorded decision.
- **Each section ends with acceptance**: `Acceptance: an administrator's request to promote an administrator returns "forbidden" and writes nothing; the same request by the Owner succeeds and is audited.`
- **Open questions** close the document, each naming the requirement it affects.

## docs/architecture/overview.md

The current shape of the system and its rules of composition. Rationale lives in ADRs, coding rules in conventions, module APIs in guides; this document links to all three.

Open with the status legend: **Implemented** exists in the code today; **Planned** is agreed but not built; **Open** is undecided. Every module, flow, and rule carries one.

| Section               | Holds                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| System context        | A mermaid diagram: people, the system's parts, external systems                                    |
| Technology            | Table `Concern \| Choice`, with versions where they constrain                                      |
| Repository layout     | A tree, one comment per directory                                                                  |
| Modules               | Table `Domain \| Responsibility \| Status`; plugins or optional modules in a second table          |
| Dependency rules      | Numbered, each saying whether a tool enforces it; a mermaid graph of allowed edges                 |
| Runtime composition   | Numbered startup order: entry point, module loading, middleware order, error mapping, CLI, workers |
| Extension points      | What can be added without touching the core, with the ADR that set it                              |
| Key flows             | Table `Flow \| Outline \| Status`, each linking to its guide                                       |
| Data                  | Where tables live, shared base classes, time and versioning rules, with their ADRs                 |
| Configuration         | Table `Layer \| Holds \| Lives in \| Changed by`: deployment settings versus runtime config        |
| Events and background | Signals, outbox, schedules, queues                                                                 |
| Deployment and state  | What runs where, what each store holds, what losing it costs                                       |
| Open questions        | Undecided structure; an answer becomes an ADR and a status change                                  |

Keep it current: a pull request adding a module, an edge between domains, a flow, or a configuration layer updates this document. A dependency graph that lags the code teaches agents the wrong edges.
