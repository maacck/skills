# Backend conventions

How backend code is organised and written. The overall shape is in the [architecture overview](../architecture/overview.md); the reasons for the larger rules are in the [decision records](../adr/). Use the terms from [CONTEXT.md](../../CONTEXT.md) in names and prose.

## Where code goes

<!-- Describe this repository's real layout: replace each default path with the project's own, delete rows for code the project does not have, and add a row when a new kind of code appears. -->

| What                                                          | Where                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A domain's business rules                                     | `{{pkg}}/<domain>/service.py`, or one file per topic                                                                  |
| A domain's input and output shapes                            | `{{pkg}}/<domain>/entities.py` (Pydantic)                                                                             |
| A domain's exceptions                                         | `{{pkg}}/<domain>/exc.py`                                                                                             |
| Tables                                                        | {{`{{pkg}}/<domain>/models.py`or`{{pkg}}/models/<domain>.py`, as ADR NNNN decided}}, all imported by `{{pkg}}/models` |
| Migrations                                                    | `{{pkg}}/migrations/` (generated)                                                                                     |
| HTTP routes                                                   | `{{pkg}}/api/routers/<area>.py`, included by `{{pkg}}/api/app.py`                                                     |
| Entry points: startup hooks, CLI commands, workers            | {{Where this project keeps them}}                                                                                     |
| Code every domain may use: call context, audit, search, retry | {{Shared modules below the domains, e.g. `{{pkg}}/context/`, `{{pkg}}/utils/`}}                                       |
| Deployment settings                                           | `{{pkg}}/settings.py`                                                                                                 |
| Tests                                                         | `tests/test_<domain>.py`                                                                                              |

Name any other file in a domain after what it holds (`policies.py`, `sessions.py`). Create a file only when it has content. Split a file by sub-responsibility once it passes about 400 lines.

## Domains

- Domains are plain sub-packages of `{{pkg}}`. Their allowed dependencies are drawn in the [architecture overview](../architecture/overview.md#dependency-rules) and enforced by `tests/test_architecture.py`.
- A domain reads another domain through its functions, never by selecting its tables, and changes it through its service or a signal it listens to.
- Permission checks that several domains share live in {{a module below every domain, e.g. `{{pkg}}/authz.py`}}.
- A domain other code calls has a guide in [docs/developer/](../developer/README.md); its `__init__.py` docstring ends with `Usage: docs/developer/<domain>.md.`

## Layers

- `api` calls services; services use models. Route handlers parse input into entities and call a service; exceptions become HTTP responses through their `status_code` (see [Exceptions](#exceptions)). They never touch the session or models.
- Name every route handler `<action>_<resource>`, unique across the whole API: `search_users`, `get_application`, `set_user_role`. The name is the operation id and the generated client's function name. Paged lists are `search_*`, plain lists `list_*`. The action is one of the verbs in `tests/test_api_openapi.py`.
- Domain packages never import FastAPI or accept `Request`/`Response`.
- Services work in `db.session`, which the caller binds: the request middleware for HTTP, `db.session_scope()` for CLI commands, workers, startup code, and tests.
- **Services commit.** A service that writes calls `db.session.commit()` when its unit of work is complete. The HTTP middleware never commits; it rolls back whatever is left uncommitted when the request ends, so a forgotten commit is a silently lost write.

## Services

- Module-level, synchronous functions. Add an `a`-prefixed async variant only when a real caller needs one.
- Import the module and call through it: `from {{pkg}}.directory import service as directory`, then `directory.create_user(...)`.
- Who is acting is never an argument: services read it from `{{pkg}}.context` ([call context guide](../developer/context.md)). Options are keyword-only: `update(key, data, *, expected_version)`.
- Return entities or plain values. ORM objects do not leave the domain, and do not enter it either: services take ids and load rows themselves, with the row locks their rules need.
- **Lists that can grow are paged, searched, filtered, and sorted; never return them whole.** The service takes a `ListQuery` and returns `Page[Entry]` through `{{pkg}}.utils.search.search`. The model declares what may be searched and filtered (`__searchable_columns__`, `__filterable_fields__`), never a secret, hash, or credential column. The route takes `ListQueryParams` (`q`, `filter`, `sort_key`, `sort_dir`, `page`, `limit`). A plain list is for collections bounded by design; append-only logs page by cursor.
- Every request to an external provider goes through a client wrapped by a `RetryPolicy` (`{{pkg}}.utils.retry`): never a hand-written retry loop, never a bare client. Wrap the client, not its transport: a client given a transport ignores `HTTPS_PROXY`.
- Document every service with a Google-style docstring (see [Docstrings](#docstrings)).

## Exceptions

- Each domain has an `exc.py` with one base exception subclassing `{{pkg}}.exc.AppError`, and specific subclasses of it.
- Every exception class sets `detail`: its message, as a `str.format` template. Raise with keyword arguments to fill it, or with a positional message to replace it.
- Set `status_code` on exceptions a client should see; subclasses inherit it. Without one, the API answers a generic 500 and never shows `detail`.
- A client-facing exception also sets `code`, the key the frontend translates: `<domain>.<name>`, such as `directory.user_not_found`. Defining one without it fails at import. Never change a shipped code, even when renaming the class.
- Error responses are `{"code", "detail", "params"}`. Never put secrets in the params of a client-facing exception.
- Malformed input is Pydantic's job (`ValidationError`); don't wrap it. Validation answers 422 `validation_error` with Pydantic's details in `params.errors` and never the submitted values.

## Models and migrations

- Inherit `AppModel` (UUID `id`, `created_at`, `updated_at`). Put mixins first: `class Foo(VersionMixin, AppModel)`.
- Call a record's human-readable label `name`.
- Import every model class in the registry, `{{pkg}}.models`; `tests/test_models.py` fails when one is missing. {{With tables in the domains: no domain imports `{{pkg}}.models`or another domain's`models.py`; `tests/test_architecture.py` enforces it.}}
- **Relationships are declared on the model and loaded where a query needs them**: `relationship(..., lazy="raise")`, loaded with `selectinload` for a collection and `joinedload` for a single row. Never lazy-load.
- **The schema holds types and integrity only** ([ADR](../adr/)): primary keys, `NOT NULL`, unique constraints, foreign keys, indexes, in generic SQLAlchemy types. Allowed values, formats, and ranges are validated by the entities and services that write the table.
- **Time is UTC**: annotate columns as `Mapped[datetime]`, never `DateTime(...)`; get the time from `utcnow()`, never `datetime.now()` or `datetime.utcnow()`; request entities use `pydantic.AwareDatetime`.
- **Optimistic locking**: add `VersionMixin` to tables people edit concurrently. A service that edits across an HTTP round trip takes `expected_version: str | None = None` and raises the domain's conflict exception on mismatch. Responses carry `version` in the body; writes take it from `If-Match` (`IfMatch` dependency). Write through the ORM: core `update()` statements bypass the check. A model that defines `__mapper_args__` must merge `VersionMixin`'s.
- **Migrations**: `{{revision command}}`. Read every generated migration before committing it; replace the custom datetime type autogenerate writes with `sa.DateTime(timezone=True)`. Never edit a migration that has been applied to a shared database. Migrations are excluded from ruff and mypy.

## Settings

- Settings are deployment facts read from the environment: a `pydantic-settings` class with one `env_prefix` (`{{PREFIX}}_`). Secrets live only in settings.
- A new variable goes into every `.env.example` in the same change.

## Events

- A domain event is a module-level `NamedSignal("<domain>.<event>")` defined next to the code that sends it.
- Send it inside the writing transaction, before the commit. Document its keyword payload in a comment where it is defined. Connect receivers at startup ({{where: the startup hook or lifespan}}), so the sender never imports the receiver.

## Python style

- Python {{version}}. Use PEP 695 generics: `def first[T](items: Sequence[T]) -> T`.
- Ruff formats and lints, line length 120. Don't hand-format against it.
- Identifiers, comments, docstrings, and log messages are in English.
- Comments explain why, not what, and cite requirement IDs and ADRs where a rule comes from one.
- Prefer the standard library and existing dependencies. A new dependency needs a reason in the pull request.

## Static typing

mypy runs in `strict` mode with the Pydantic plugin over `{{pkg}}` and `tests` (migrations excluded): `uv run mypy`.

- Annotate every parameter and return value, tests included.
- No bare `Any` in a signature (ruff `ANN401`); `Any` only nested in a container of untyped data such as JSON.
- `# type: ignore[code]` needs the specific code and a reason the type system cannot express. `typing.cast` meets the same bar.

## Docstrings

Every module, class, function, and method outside `tests/` has a Google-style docstring. Ruff enforces the format (`D`, Google convention) and that `Returns`, `Yields`, and `Raises` match the code (`DOC`). Private helpers may omit theirs when the name says it all.

- The first line is one sentence, in the imperative for functions ("Return the ...").
- `Args:` lists every parameter; reviewers check it, since ruff cannot.
- `Returns:` (or `Yields:`) whenever the function returns something other than `None`.
- `Raises:` lists every exception a caller can see, including ones raised by functions it calls.
- Classes with public fields list them under `Attributes:`.
- Don't repeat the type annotations in prose.

## Testing

- `uv run pytest` against a database built by the real migrations, every test in a rolled-back transaction. Don't mock the database or services, and don't call `create_all`.
- Test behaviour through a domain's public functions. Name each test after the behaviour it proves.
- Each test should fail for a bug a user could notice. Don't test wiring, forwarding, or default values for their own sake.
- Every test runs in a `system` call context; nest `context.scope(...)` to act as someone else.
- External providers are faked; tests never call the network.
- Contract tests: `tests/test_models.py` (models registered, UTC, versions), `tests/test_api_openapi.py` (operation ids, documented errors), `tests/test_architecture.py` (domain dependencies).
