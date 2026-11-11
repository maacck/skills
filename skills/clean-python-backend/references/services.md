# Services, context, and the code around them

Copy these shapes; replace `{{pkg}}` with the package name. With bedrock-py, `db.session`, `db.session_scope()`, `BedrockModel`, `BedrockExc`, `NamedSignal`, and `search_filter_sort_paginate` come from the framework (see the `bedrock` skill); without it, see [Without bedrock-py](#without-bedrock-py).

## A service module

```python
"""Applications: registration, display metadata, and client secrets.

Every write checks that the acting user may administer applications, audits the change, and commits, in the
caller's bound session. Who is acting comes from ``{{pkg}}.context``. Usage: docs/developer/application.md.
"""

import uuid

from bedrock.database import db
from bedrock.signal import NamedSignal
from sqlalchemy.orm.exc import StaleDataError

from {{pkg}} import audit, authz
from {{pkg}}.models import Application
from {{pkg}}.utils.search import ListQuery, Page, search

from .entities import ApplicationCreate, ApplicationEntry, ApplicationUpdate
from .exc import ApplicationConflict, ApplicationNotFound

# Sent inside the writing transaction, after the flush and before the commit, only when the status really
# changed; the sender is the Application model. Keyword arguments: application_id, before, after.
status_changed = NamedSignal("application.status_changed")

CREATED = "application/created"  # audit event names
UPDATED = "application/updated"


def _load(application_id: uuid.UUID, *, lock: bool = False) -> Application:
    app = db.session.get(Application, application_id, with_for_update=lock)
    if app is None:
        raise ApplicationNotFound()
    return app


def _entry(app: Application) -> ApplicationEntry:
    return ApplicationEntry.model_validate(app, from_attributes=True)


def _commit(app: Application) -> ApplicationEntry:
    try:
        db.session.flush()
    except StaleDataError as exc:  # another writer changed the row since it was loaded
        raise ApplicationConflict() from exc
    entry = _entry(app)
    db.session.commit()
    return entry


def create(data: ApplicationCreate) -> ApplicationEntry:
    """Register an application.

    Args:
        data: The application's display fields and access scope.

    Returns:
        The created application.

    Raises:
        Forbidden: Unless the acting user may administer applications.
    """
    authz.require("manage_applications")
    app = Application(name=data.name, url=data.url, status="active")
    db.session.add(app)
    db.session.flush()  # assigns defaults the audit record reads
    audit.record(CREATED, application_id=app.id, details={"name": app.name})
    return _commit(app)


def update(application_id: uuid.UUID, data: ApplicationUpdate, *, expected_version: str | None = None) -> ApplicationEntry:
    """Replace an application's display fields.

    Args:
        application_id: The application's id.
        data: The new display fields, replacing the old ones whole.
        expected_version: The version the caller last read, or ``None`` to skip the check.

    Returns:
        The updated application.

    Raises:
        Forbidden: Unless the acting user may administer applications.
        ApplicationNotFound: If no application has this id.
        ApplicationConflict: If the application changed since ``expected_version`` was read.
    """
    authz.require("manage_applications")
    app = _load(application_id, lock=True)
    if expected_version is not None and app.version != expected_version:
        raise ApplicationConflict()
    app.name, app.url = data.name, data.url
    audit.record(UPDATED, application_id=app.id, details=data.model_dump())
    return _commit(app)


def search_applications(query: ListQuery) -> Page[ApplicationEntry]:
    """Return one page of applications.

    Args:
        query: Search over the model's searchable columns; filter and sort on its filterable fields.

    Returns:
        The page.

    Raises:
        InvalidListQuery: If the filter or sort is not allowed.
    """
    return search(Application, query, entry=_entry, default_sort="name")
```

What to notice:

- The module docstring says what the domain does, how its writes behave, and where the guide is.
- Private helpers (`_load`, `_entry`, `_commit`) carry the repetition; public functions read as the rule they implement.
- The actor is never a parameter; `authz.require` and `audit.record` read it from the call context.
- `Raises:` lists `Forbidden` even though `authz` raises it: callers handle what they can see.

## Entities

```python
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl


class ApplicationCreate(BaseModel):
    """An application to register.

    Attributes:
        name: Shown on the Launchpad.
        url: Where the Launchpad sends the user.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    url: HttpUrl


class ApplicationEntry(BaseModel):
    """An application as callers see it; never its secret digest."""

    id: uuid.UUID
    name: str
    url: str
    status: Literal["active", "disabled"]
    created_at: AwareDatetime
    version: str
```

Input entities validate everything the schema does not (ranges, formats, cross-field rules in a `model_validator`). Output entities name exactly what callers may see.

## The call context

Who is acting, through which session, and from where, as a frozen snapshot in a `ContextVar`. The HTTP middleware opens a scope per request; workers and CLI commands open their own; tests run in a `system` scope.

```python
# context/entities.py
class Actor(BaseModel):
    """Who is acting.

    Attributes:
        kind: ``user`` once signed in; ``anonymous`` before; ``system`` for jobs; ``cli`` for maintenance commands.
        user_id: Set exactly when ``kind`` is ``user``.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: Literal["user", "anonymous", "system", "cli"]
    user_id: uuid.UUID | None = None


class CallContext(BaseModel):
    """Everything known about the current call.

    Attributes:
        actor: Who is acting.
        correlation_id: Shared by every record one call produces, including the tasks it enqueues.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    actor: Actor
    correlation_id: str = Field(default_factory=lambda: uuid.uuid4().hex)


# context/scope.py
class _Scope:
    __slots__ = ("ctx",)

    def __init__(self, ctx: CallContext) -> None:
        self.ctx = ctx


# Holds a mutable scope, not the snapshot: FastAPI runs sync dependencies in a thread pool against a copy of the
# contextvars, so a set() there would be invisible to the route; mutating the shared scope object is not.
_current: ContextVar[_Scope | None] = ContextVar("{{pkg}}_context", default=None)


@contextmanager
def scope(ctx: CallContext) -> Iterator[CallContext]:
    """Make ``ctx`` the current context until the block exits; scopes nest."""
    token = _current.set(_Scope(ctx))
    try:
        yield ctx
    finally:
        _current.reset(token)


def current() -> CallContext:
    """Return the current context.

    Raises:
        NoContext: Outside any scope.
    """
    s = _current.get()
    if s is None:
        raise NoContext()
    return s.ctx


def authenticate(actor: Actor) -> CallContext:
    """Replace who is acting in the current scope, after sign-in; visible to the rest of the call."""
    s = _current.get()
    if s is None:
        raise NoContext()
    s.ctx = s.ctx.model_copy(update={"actor": actor})
    return s.ctx
```

Propagate the context into background tasks by serialising it into the task's headers and opening a scope from it in the worker, so audit records of the task carry the same `correlation_id`.

## Paged lists

One request shape, one answer shape, for every list that grows with use.

```python
# utils/search.py
MAX_LIMIT = 200


class InvalidListQuery(AppError):
    """The filter or sort names something the list does not allow, or a value of the wrong type."""

    code = "list.invalid_query"
    detail: str = "The search, filter, or sort is not valid: {reason}"
    status_code = 400


class ListQuery(BaseModel):
    """One page of a list: search text, a filter, an order, and the page."""

    q: str | None = None
    filter: dict[str, Any] | list[dict[str, Any]] | None = None
    sort_key: str | None = None
    sort_dir: Literal["asc", "desc"] = "asc"
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=MAX_LIMIT)


class Page[T](BaseModel):
    """One page of a list and the number of items matching across all pages."""

    items: list[T]
    total: int
    page: int
    limit: int


def search[M: BedrockModel, T: BaseModel](
    model: type[M],
    query: ListQuery,
    *,
    entry: Callable[[M], T],
    default_sort: str,
    where: list[ColumnElement[bool]] | None = None,
    options: list[Any] | None = None,
) -> Page[T]:
    """Run ``query`` over ``model``, restricted by ``where``, and return the page as entries.

    Raises:
        InvalidListQuery: If the filter or sort names a field the model does not allow, or a value of the wrong type.
    """
    sort = [(query.sort_key or default_sort, query.sort_dir), ("id", "asc")]  # ties broken by id: stable pages
    try:
        with db.session.begin_nested():  # a type error aborts the statement; keep the caller's transaction usable
            result = search_filter_sort_paginate(
                db_session=db.session,
                model=model,
                q=query.q,
                filter_specs=query.filter,
                sort_key=sort,
                page=query.page,
                limit=query.limit,
                sqla_filters=where,
                options=options,
            )
    except (FilterError, InvalidQueryLimitError) as exc:
        raise InvalidListQuery(reason=str(exc)) from exc
    except DataError as exc:  # never echo the database's message: it quotes the SQL
        raise InvalidListQuery(reason="a value does not match its field's type.") from exc
    return Page[T](items=[entry(r) for r in result["items"]], total=result["total"], page=query.page, limit=query.limit)
```

The model declares what may be searched and filtered; anything else a request names is refused. Never list a secret, hash, or credential column.

```python
class Application(VersionMixin, AppModel):
    # What admin lists may search, filter, and sort on (utils.search); never a secret digest.
    __searchable_columns__ = ["name", "description", "url"]
    __filterable_fields__ = ["name", "url", "status", "created_at"]
```

The route reads the query string once, in a dependency: `q`, `filter` (filter JSON), `sort_key`, `sort_dir`, `page`, `limit`.

```python
def list_query(
    q: str | None = None,
    filter_: Annotated[str | None, Query(alias="filter")] = None,
    sort_key: str | None = None,
    sort_dir: Literal["asc", "desc"] = "asc",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 50,
) -> ListQuery:
    """Read a list request's query string.

    Raises:
        InvalidListQuery: If ``filter`` is not a JSON object or array.
    """
    spec = None
    if filter_:
        try:
            spec = json.loads(filter_)
        except ValueError as exc:
            raise InvalidListQuery(reason="filter is not JSON.") from exc
        if not isinstance(spec, dict | list):
            raise InvalidListQuery(reason="filter must be a JSON object or array.")
    return ListQuery(q=q or None, filter=spec, sort_key=sort_key, sort_dir=sort_dir, page=page, limit=limit)


ListQueryParams = Annotated[ListQuery, Depends(list_query)]
```

## Outbound HTTP

Every request to an external provider goes through a client wrapped by a `RetryPolicy` (on tenacity). The policy replaces the client's `send`, so requests a library makes through the client are retried too. Wrap the client, not its transport: a client given a transport ignores `HTTPS_PROXY`.

```python
@dataclass(frozen=True)
class RetryPolicy:
    """How long and on what to retry one provider's requests.

    Attributes:
        attempts: The most requests per call, the first included.
        budget: Seconds after the first request past which no retry starts.
        retry_on: Which responses are retried: 429 only for writes and requests a person waits on; 429 and 5xx for reads.
    """

    attempts: int
    budget: float
    retry_on: Callable[[httpx.Response], bool] = lambda r: r.status_code == 429
    max_wait: float = 10
    sleep: Callable[[float], None] = time.sleep

    def wrap[C: httpx.Client](self, client: C) -> C:
        """Make every request ``client`` sends follow this policy."""
        send = client.send

        def retried(request: httpx.Request, **kwargs: Any) -> httpx.Response:  # noqa: ANN401  httpx's own kwargs
            return self._retrying()(send, request, **kwargs)

        client.send = retried  # type: ignore[method-assign]  # httpx's request() calls self.send
        return client

    def _retrying(self) -> Retrying:
        return Retrying(
            stop=stop_after_attempt(self.attempts) | stop_before_delay(self.budget),
            wait=self._wait,
            retry=retry_if_exception_type(TRANSIENT) | retry_if_result(self.retry_on),
            retry_error_callback=lambda state: state.outcome.result() if state.outcome else None,
            sleep=self.sleep,
        )

    def _wait(self, state: RetryCallState) -> float:
        outcome = state.outcome
        if outcome is not None and not outcome.failed:
            try:  # the wait the provider asks for, if it says
                return min(max(float(outcome.result().headers["retry-after"]), 0), self.max_wait)
            except (KeyError, ValueError):
                pass
        return wait_exponential_jitter(multiplier=0.5, max=self.max_wait, jitter=0.5)(state)


TRANSIENT = (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)
```

A refused credential or a missing permission is never retried: asking again does not change the answer. When the budget runs out, the caller gets the last response or error, exactly as without retries.

## Conditional writes over HTTP

A resource's `version` travels in the response body. A write sends it back as `If-Match: "<version>"`; a route turns the header into the service's `expected_version`. Without the header, the write is unconditional.

```python
_STRONG_TAG = re.compile(r'"([^"]+)"')


def if_match(if_match: Annotated[str | None, Header()] = None) -> str | None:
    """Return the version named by ``If-Match``, or ``None`` for an unconditional write.

    Raises:
        InvalidPrecondition: If the header is not ``*`` or one strong entity tag.
    """
    if if_match is None or if_match.strip() == "*":
        return None
    match = _STRONG_TAG.fullmatch(if_match.strip())
    if match is None:
        raise InvalidPrecondition()
    return match.group(1)


IfMatch = Annotated[str | None, Depends(if_match)]
```

Routes never put `version` in a request body or the query string.

## A route

```python
router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("")
def search_applications(query: ListQueryParams) -> Page[ApplicationEntry]:
    """Search, filter, sort, and page applications.

    Returns:
        A page of matching applications.
    """
    return applications.search_applications(query)


@router.put("/{application_id}")
def update_application(
    application_id: uuid.UUID, body: ApplicationUpdate, expected_version: IfMatch
) -> ApplicationEntry:
    """Replace an application's display fields.

    Returns:
        The updated application.
    """
    return applications.update(application_id, body, expected_version=expected_version)
```

The handler name is the operation id and the generated client's function name (`searchApplications`), so it is unique across the API and starts with a verb from the list the OpenAPI test allows. The handler's docstring is the operation's description.

## Without bedrock-py

Provide the same four things the services rely on, once, in `{{pkg}}/db.py` and `{{pkg}}/exc.py`:

```python
# db.py: a session bound per call, read by services, never passed to them
_bound: ContextVar[Session | None] = ContextVar("{{pkg}}_session", default=None)
SessionLocal = sessionmaker(create_engine(settings.DATABASE_URL), expire_on_commit=False)


def session() -> Session:
    """Return the session bound to the current call.

    Raises:
        RuntimeError: Outside ``session_scope``; bind one at the entry point.
    """
    bound = _bound.get()
    if bound is None:
        raise RuntimeError("No session bound; wrap the entry point in session_scope().")
    return bound


@contextmanager
def session_scope() -> Iterator[Session]:
    """Bind a new session for the block; whatever services left uncommitted is rolled back at the end."""
    s = SessionLocal()
    token = _bound.set(s)
    try:
        yield s
    finally:
        s.rollback()
        s.close()
        _bound.reset(token)
```

Bind it per request with a middleware (or a dependency with `yield`) that wraps the call in `session_scope()`. The rest maps one to one: a declarative base for `BedrockModel`, an `Exception` subclass for `BedrockExc`, blinker's `NamedSignal` for signals, and a `search` built on `select()` with `ilike` over the declared searchable columns, an allow-listed filter, `order_by`, `limit`, and `offset`.
