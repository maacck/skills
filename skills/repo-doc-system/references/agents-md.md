# AGENTS.md

The file every coding agent loads on every turn. Each line costs attention on every task, so it routes rather than explains. Template: `assets/templates/AGENTS.template.md`.

## Budget

80–120 lines. When a section needs a paragraph of explanation, the explanation belongs in the document the routing table points to, and `AGENTS.md` keeps the pointer.

## Sections, in order

1. **Title and one line**: `Guidance for coding agents working in this repository. People should start with README.md.`
2. **Language**: what is committed in which language; reply to the user in theirs.
3. **Read before you change**: a table `Before working on | Read`, one row per kind of change. Close it with: "Use the glossary's terms in code and prose. If the docs and the code disagree, ask which one is right before changing either."
4. **Layout**: a tree of top-level directories, one comment each.
5. **Commands**: install, services, migrate, run, generate; one copyable line each with a trailing comment. Environment traps go here (`reads DATABASE_* only from the process environment, so run with --env-file .env`).
6. **Done means**: the exact check lines, and "the docs describing the changed behaviour are updated in the same change".
7. **Hard rules**: 5–12 bullets. Each is a rule whose breach is silent, costly, or architectural, and each names its exception and the ADR that allows it.
8. **Gotchas**: what fails without an error, each with what to do instead.

## Routing rows

A row answers "what must I read before touching this?", for a kind of change rather than a file:

| Before working on                   | Read                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Anything product- or domain-related | `CONTEXT.md`, `docs/product/overview.md`, `docs/product/requirements.md` |
| Code that calls a shared module     | Its guide in `docs/developer/`                                           |
| Backend code                        | `docs/conventions/backend.md`, `docs/architecture/overview.md`           |
| Frontend code                       | `docs/conventions/frontend.md`, the shared components' index             |
| A structural decision               | `docs/adr/`                                                              |

Add a row when agents keep making the same class of mistake. Remove one when its document is gone.

## Hard rule, gotcha, or neither?

- **Hard rule**: an instruction. "Every table lives in `app/models/` and is imported in `app/models/__init__.py`."
- **Gotcha**: a surprising fact and its consequence. "A model missing from `app/models/__init__.py` is silently left out of migrations."
- **Neither**: anything a linter, type checker, or test already enforces. The failing check explains itself; the conventions document names the check.

A hard rule with an exception names it inline, with its ADR: `Every table lives in app/models/. Exception: plugins.task_runs owns its table ([ADR 0017](docs/adr/0017-plugin-owned-task-run-storage.md)).`

## CLAUDE.md

A symlink to `AGENTS.md` (`ln -s AGENTS.md CLAUDE.md`), so tools that read either see the same text. Never two files.

## Nested AGENTS.md

Only for a subtree with different commands or rules, such as one app in a monorepo. It covers only the difference and links up to the root file.

## Keeping it true

- A command in `AGENTS.md` is copied, character for character, from `CONTRIBUTING.md`, the `Makefile`, and CI. Change all four together.
- Review `AGENTS.md` whenever a pull request touches the routing table's targets: a renamed document silently breaks a row. `scripts/check_links.py` catches the broken link.
