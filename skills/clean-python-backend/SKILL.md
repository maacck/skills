---
name: clean-python-backend
description: Use when writing, reviewing, or restructuring a Python backend service (FastAPI, SQLAlchemy 2, Pydantic, optionally bedrock-py): splitting it into domains, adding services, entities, exceptions, models, migrations, routes, paged lists, outbound HTTP calls, or tests; or when service modules sprawl past a few hundred lines, routes touch the database, ORM objects leak across domains, domains query each other's tables, or errors, time zones, and concurrent edits are handled ad hoc.
---

# Clean Python backend

## Overview

A modular monolith whose domains are plain packages of module-level functions. It stays readable because of three things: the code speaks the domain's own words (`CONTEXT.md`), every kind of code has one obvious place, and the invariants live in base classes, lint rules, and contract tests rather than in anyone's memory.

**REQUIRED companion:** `repo-doc-system`, for the documents these rules point to. With bedrock-py, the `bedrock` skill documents the framework's API; this skill decides how to use it.

## When to use

- Starting a backend, or adding a domain, a service function, a route, a table, a list endpoint, an outbound integration, or tests.
- Reviewing backend code, or deciding where something goes.
- Symptoms: a `service.py` past ~400 lines; a route that queries the database; a function taking `session` or `current_user`; ORM objects returned to routes; one domain selecting another's tables; error responses shaped differently per endpoint; naive `datetime.now()`; lost updates between two editors; a hand-written retry loop.

Not for: scripts, notebooks, libraries without a database or an HTTP API. Async-first services keep every rule except "services are synchronous".

## Where code goes

Place code by what it is. The paths are defaults, not a layout to copy: an existing project keeps its own names wherever they already satisfy the rule, and a new one adds a place only when the first code for it arrives.

| Kind of code                                                                                      | Rule                                                                                                        | Default                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Business rules of one concept                                                                     | In the package of the domain that owns the concept, as module-level functions                               | `<domain>/service.py`; once the domain has several topics, one file per topic                       |
| A domain's input and output shapes                                                                | Next to its rules; the web layer reuses them rather than redefining them                                    | `<domain>/entities.py`                                                                              |
| A domain's errors                                                                                 | Next to its rules, subclassing the project's base exception                                                 | `<domain>/exc.py`                                                                                   |
| Tables                                                                                            | Owned by one domain; every model imported by one registry module, so migrations see it, which a test checks | Decided per project: see [Where tables live](#where-tables-live)                                    |
| HTTP                                                                                              | One package that nothing else imports; routes grouped by area of the API, which need not match the domains  | `api/`, with `api/routers/<area>.py` (one FastAPI `APIRouter` each)                                 |
| Entry points: app startup, CLI, workers                                                           | Thin and at the edge: bind the session and the call context, then call services                             | Where the framework expects them (bedrock-py: `bootstrap.py`, `commands.py`; FastAPI: the lifespan) |
| Code any domain may use: call context, audit, authorization, list search, retries, base exception | Below every domain, importing none of them                                                                  | `context/`, `audit/`, `authz.py`, `utils/`, `exc.py`                                                |
| Deployment settings                                                                               | One settings class per owner, each with its own environment prefix                                          | `settings.py`                                                                                       |
| Tests                                                                                             | Mirror the domains; contract tests guard the whole package                                                  | `tests/test_<domain>.py`, `tests/test_architecture.py`                                              |

A new service starts with no more than this, and grows by the rows above:

```
{{pkg}}/
  exc.py         The project's base exception
  settings.py    Deployment settings
  db.py          Base model, UTC type, version mixin; imports no table
  models.py      The registry: imports every table so migrations see them (a package if tables are central)
  api/           app.py, errors.py, routers/
  migrations/
  <domain>/      __init__.py, service.py, entities.py, exc.py, and its tables if they live in domains
tests/
```

Create a file only when it has content.

### Where tables live

Decide once per project, record it in an ADR, and state it in the conventions document. Both layouts keep one migration branch, the shared base classes in a module below every domain (`db.py`), and one registry module (`models`) that imports every table, which the model test checks. With bedrock-py, the registry must be the package's `models` module: BedRock migrates only the tables named there.

|                              | Tables in each domain (`<domain>/models.py`)                                                                                                                 | Tables in one package (`models/<domain>.py`)                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Table ownership              | Enforced: `models` is a registry above the domains that no domain imports, so one domain importing another's tables is an edge the architecture test rejects | A convention: `models` sits below every domain, so any domain can select any table unnoticed |
| Relationships across domains | String targets (`relationship("User")`) and foreign keys by table name, without importing the other domain                                                   | Direct class references                                                                      |
| Fits                         | Domains with few relationships across them, or that may become separate services                                                                             | Many relationships and joins across domains                                                  |
| In the architecture test     | `models` in `TOP`                                                                                                                                            | `models` in `SHARED`                                                                         |

When neither column clearly fits, put tables in their domains: it turns the most common boundary breach, one domain querying another's tables, into a failing test.

**Optional integrations** go in a `plugins/<name>/` package the core never imports, but only when a deployment can run without them. Otherwise they are a domain.

**In an existing project**, do not move files to match the defaults. Fix what breaks a rule (a route that queries the database, a domain that selects another's tables, a model the migrations cannot see) and keep the names that work.

## Domains

- **Split by reason to change.** Two concerns that change at different rates, fail differently, or are enabled independently are two domains: `directory` (who exists) and `identity` (how they prove it).
- **Name them with `CONTEXT.md` terms**, and the files, functions, tables, and error codes inside them too.
- **Dependencies point one way**, drawn in `docs/architecture/overview.md` and enforced by a test.
- **A domain reads another domain through that domain's functions**, never by selecting its tables. It changes another domain through that domain's service, or by sending a signal the other connects to.
- **Authorization that several domains need lives in its own module below them**, not inside one domain that the rest must then import.
- **Split a file by sub-responsibility once it passes ~400 lines.** For example, an `identity` domain becomes `signin.py`, `accounts.py`, `sessions.py`, `passwords.py`, `mfa.py`, `passkeys.py`; a `service.py` holding three aggregates is three files.

Details, signals versus calls, and optional plugin modules: `references/domains.md`.

## Layers

| Layer    | Does                                                                                        | Never                                                                     |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| HTTP     | Parse input into entities, map headers to keyword arguments, call services, return entities | Touch the session or models; hold business rules                          |
| Domain   | Load and lock rows, enforce rules and permissions, audit, send signals, commit              | Import the web framework, accept `Request`/`Response`, return ORM objects |
| Models   | Columns, keys, indexes, relationships, searchable and filterable declarations               | Validate values (entities and services do)                                |
| Entities | Validate shapes and values                                                                  | Reach the database                                                        |

## Services

- **Module-level synchronous functions.** Callers import the module and call through it: `from {{pkg}}.directory import service as directory`, then `directory.create_user(...)`. No service classes, repositories, or dependency injection for domain code. Add an `a`-prefixed async variant only when a real caller needs one.
- **Session and actor are ambient.** The entry point binds the session (request middleware; `session_scope()` in CLI commands, workers, and tests) and the call context; services read them. Never pass `session`, `request`, or `current_user`.
- **Options are keyword-only**: `update(key, data, *, expected_version=None)`.
- **Ids in, entities out.** Take ids, load the rows with the locks the rules need, return entities or plain values. ORM objects neither leave nor enter a domain.
- **Services commit.** A service that writes commits when its unit of work is complete. The request layer only rolls back what is left, so a forgotten commit is a lost write that still answers 200.
- **Lists that grow are searched, filtered, sorted, and paged** (`ListQuery` in, `Page[T]` out); collections bounded by design are plain lists; append-only logs page by cursor.
- **Outbound HTTP goes through a client wrapped by a retry policy**: never a hand-written retry loop, never a bare client.
- **Events are module-level named signals** defined next to their sender, sent inside the writing transaction before the commit, with the payload documented where they are defined.

Code for each, and how to provide the session and context without bedrock-py: `references/services.md`.

## Errors

- One base exception in `{{pkg}}/exc.py`; each domain's `exc.py` has one base subclass of it and specific subclasses of that.
- Every class sets `detail`, a `str.format` template filled from the keyword arguments it is raised with.
- A client-facing class sets `status_code` and `code` (`<domain>.<name>`, the key the frontend translates). Defining one without `code` fails at import. A shipped code never changes.
- Without `status_code`, the client gets a generic 500 and never sees `detail`.
- Every failure answers one body, `{"code", "detail", "params"}`; validation answers 422 without the submitted values.
- Malformed input is Pydantic's job; never wrap `ValidationError`.

Code: `references/errors.md`.

## Models and migrations

- One base: UUID `id`, `created_at`, `updated_at`. Mixins come first: `class Foo(VersionMixin, AppModel)`.
- **Time is aware UTC.** `Mapped[datetime]` maps to a type that refuses naive values; `utcnow()` is the only clock; request entities use `AwareDatetime`.
- **Concurrent edits use a version.** Responses carry it in the body; a write takes it from `If-Match` as `expected_version`; writes go through the ORM.
- **The schema holds types and integrity only**: keys, `NOT NULL`, unique constraints, foreign keys, indexes, in generic SQLAlchemy types. Allowed values live in entities and services.
- **Relationships are `lazy="raise"`** and loaded where a query needs them: `selectinload` for collections, `joinedload` for one row.
- Every model is imported by the registry module (`models`); a test fails otherwise. Read every generated migration; never edit one already applied to a shared database.

Code: `references/models.md`.

## Readability

- **Names**: route handlers are `<action>_<resource>`, unique across the API, since they become the generated client's function names; paged lists `search_*`, plain lists `list_*`; private helpers say what they do (`_load`, `_entry`, `_commit`).
- **Comments say why**, and cite requirement IDs and ADRs: `# APP-4: how long the replaced secret keeps working`.
- **Docstrings**: Google style on every module, class, and function outside `tests/`. `Raises:` lists every exception a caller can see, including ones raised by functions it calls; classes with public fields list them under `Attributes:`; types are not repeated in prose.
- **Typing**: mypy strict over the package and the tests; no bare `Any` in a signature; `# type: ignore[code]` only with the code and a reason; PEP 695 generics.
- **Few moving parts**: no wrapper, factory, base class, or option without a second user. The standard library and existing dependencies come first; a new dependency states why.

Tool configuration that enforces this: `references/tooling.md`, `assets/pyproject.fragment.toml`.

## Tests

- A real database built by the real migrations, one rolled-back transaction per test. Never mock the database or services.
- Test behaviour through a domain's public functions; name each test after the behaviour (`test_stale_version_is_rejected`). Each test fails for a bug a user could notice; wiring, forwarding, and defaults are not tested for their own sake.
- Contract tests guard the architecture: every model registered, naive time refused, stale version detected, operation ids named and unique, errors documented, domain imports along allowed edges.

Code: `references/testing.md`.

## The documents this code points to

- `docs/conventions/backend.md`: copy `assets/templates/docs/conventions/backend.md` and fill it in. It is the repository's own copy of these rules, for people and agents without this skill.
- `docs/developer/<domain>.md` for each module other domains call, with `Usage: docs/developer/<domain>.md.` in its `__init__.py` docstring.
- An ADR for each rule above that a newcomer would find surprising: UTC-only time, random versions for optimistic locking, portable schema with app-side validation, the modular monolith.

`repo-doc-system` gives their shape.

## Review checklist

- [ ] Each new name is a `CONTEXT.md` term.
- [ ] Routes only parse, call one or a few services, and return entities.
- [ ] No ORM object crosses a domain boundary; no domain selects another's tables.
- [ ] Writes commit in the service; reads do not commit.
- [ ] Every new exception sets `detail`; client-facing ones set `status_code` and `code`.
- [ ] Growing lists are paged; their models declare searchable and filterable fields, and no secret column among them.
- [ ] New datetime columns are `Mapped[datetime]`; times come from `utcnow()`.
- [ ] Concurrently edited tables have the version mixin, and their write routes take `If-Match`.
- [ ] New relationships are `lazy="raise"` and loaded with options in the queries that read them.
- [ ] The new migration was read by hand.
- [ ] Docstrings list `Args`, `Returns`, and every `Raises` a caller sees.
- [ ] No file grew past ~400 lines without a split.
- [ ] The docs alignment check ran (`repo-doc-system`, or the repository's "Which docs a change moves"): documents updated in the same change, or "none needed" with the reason.

## Red flags

| Thought                                     | Reality                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| "A quick query in the route is fine"        | The next rule (permission, audit, lock) lands in the route too; call a service          |
| "I'll pass the session down, it's explicit" | Every signature grows and every caller must thread it; bind it at the entry point       |
| "A `UserService` class is cleaner"          | It adds an instance nobody needs; a module already is a namespace                       |
| "Just join their table, it saves a call"    | Their invariants (soft delete, scope, permission) are now bypassed; call their function |
| "Returning the ORM row avoids a copy"       | Callers mutate it and it writes on the next flush; return an entity                     |
| "It's a small list, return all of it"       | It grows with the organisation; page it unless it is bounded by design                  |
| "A retry loop here is three lines"          | It retries what must not be retried and ignores `Retry-After`; wrap the client          |
| "This error can be a plain `ValueError`"    | The client gets a 500 with no code to translate; raise the domain's exception           |

## References

- `references/domains.md`: decomposition, dependency direction, cross-domain reads and writes, authorization placement, splitting files, plugins.
- `references/services.md`: a service module, the call context, the bound session, paged lists, retries, conditional writes, a route.
- `references/errors.md`: the base exception, domain exceptions, the error handlers.
- `references/models.md`: the base model, UTC type, version mixin, relationships, migration review.
- `references/testing.md`: the test database, rollback, and the contract tests.
- `references/tooling.md`: ruff, mypy, pytest, pre-commit, Makefile, CI.
