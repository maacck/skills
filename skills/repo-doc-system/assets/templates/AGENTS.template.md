# AGENTS.md

Guidance for coding agents working in this repository. People should start with [README.md](README.md).

## Language

- Everything committed is in English: code, comments, docstrings, docs, commit messages.
- Reply to the user in the language they write in.

## Read before you change

| Before working on                   | Read                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Anything product- or domain-related | [CONTEXT.md](CONTEXT.md), [docs/product/overview.md](docs/product/overview.md), [docs/product/requirements.md](docs/product/requirements.md) |
| Code that calls a shared module     | Its guide in [docs/developer/](docs/developer/README.md)                                                                                     |
| Backend code                        | [docs/conventions/backend.md](docs/conventions/backend.md), [docs/architecture/overview.md](docs/architecture/overview.md)                   |
| A structural decision               | [docs/adr/](docs/adr/)                                                                                                                       |

Use the glossary's terms in code and prose. If the docs and the code disagree, ask which one is right before changing either.

## Layout

```
{{pkg}}/             {{What the core package holds: api/, models/, migrations/, one package per domain}}
tests/               Backend tests
docs/                Product, architecture, conventions, developer guides, decision records
{{dir}}/             {{One line per further top-level directory}}
```

## Commands

```bash
{{install}}                    # install dependencies and Git hooks
{{services}}                   # development database and other services
{{migrate}}                    # create or upgrade the schema
{{revision}}                   # new migration from model changes
{{run}}                        # API on :8000
```

{{One sentence per environment trap, e.g. "BedRock reads DATABASE_* only from the process environment, never from .env: without --env-file .env, commands fall back to SQLite."}}

## Done means

These pass, and the docs are aligned with the change in the same change ([which docs a change moves](CONTRIBUTING.md#which-docs-a-change-moves)); say which were updated, or why none needed to be:

```bash
{{check line, identical to CONTRIBUTING.md, the Makefile, and CI}}
```

## Hard rules

- {{Dependency direction, e.g. "{{pkg}} never imports plugins; plugins are enabled through settings."}}
- {{Where tables live and how they are registered.}}
- {{Time handling, e.g. "Datetimes are aware UTC: Mapped[datetime] columns and utcnow()."}}
- {{Service shape, e.g. "Services are synchronous module-level functions that work in db.session, commit their own writes, and never import FastAPI."}}
- {{Where routes and exceptions live.}}
- {{Where secrets come from.}}
- Don't add a dependency without stating why.
- Commit messages follow Conventional Commits (see [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)).

## Gotchas

- {{Something that fails without an error, and what to do instead, e.g. "A model the `{{pkg}}.models` registry does not import is silently left out of migrations."}}
