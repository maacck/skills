# Testing

Tests run against the real database, built by the real migrations, with every test's writes rolled back. They call services the way production does and assert what a user could notice. A handful of contract tests guard the architecture so nobody has to remember it.

## The test database

With bedrock-py, load its pytest plugin before `conftest.py` imports it (`addopts = ["-p", "bedrock.testing"]`), then:

```python
# tests/conftest.py
"""Shared fixtures: one database migrated to head per run, one rolled-back transaction per test."""

# The development database server from docker-compose.yml; any DATABASE_* variable already set overrides these.
_DEV_SERVER = {"DATABASE_TYPE": "postgresql", "DATABASE_HOST": "127.0.0.1", "DATABASE_PORT": "5432", ...}


@pytest.fixture(scope="session", autouse=True)
def app_database() -> Iterator[None]:
    """Boot the app against a new database built by the real migrations, then drop it.

    Running the migrations here, rather than ``create_all``, makes a broken migration fail the test run.
    """
    with isolated_runtime() as runtime:
        for name, value in _DEV_SERVER.items():
            os.environ.setdefault(name, value)
        os.environ["CACHE_BACKEND"] = "memory"  # never the developer's Redis
        name = f"{{pkg}}_test_{secrets.token_hex(4)}"
        server = create_engine(DbSettings(SCHEMA="postgres").SQLALCHEMY_DATABASE_URI, isolation_level="AUTOCOMMIT")
        try:
            with server.connect() as conn:
                conn.execute(text(f'CREATE DATABASE "{name}"'))
        except OperationalError as exc:
            pytest.exit(f"Cannot reach PostgreSQL; start it with `docker compose up -d`.\n{exc}", returncode=1)
        os.environ["DATABASE_SCHEMA"] = name
        try:
            runtime.registry.populate(["{{pkg}}"])
            MigrationsManager(registry=runtime.registry, database_url=DbSettings().SQLALCHEMY_DATABASE_URI).upgrade("{{pkg}}")
            yield
        finally:
            db.close()
            with server.connect() as conn:
                conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
            server.dispose()


@pytest.fixture(autouse=True)
def isolated_transaction(request: pytest.FixtureRequest) -> Iterator[None]:
    """Roll back every test's writes, including the ones services commit, and start with an empty cache.

    Tests marked ``real_commits`` skip the rollback and delete what they wrote.
    """
    cache.clear()  # the cache is not part of the rolled-back transaction
    if request.node.get_closest_marker("real_commits") is None:
        request.getfixturevalue("db_session")
    yield


@pytest.fixture(autouse=True)
def call_context() -> Iterator[CallContext]:
    """Run every test as the system; tests that need another actor nest their own ``context.scope``."""
    ctx = CallContext(actor=Actor(kind="system"), source=Source(channel="system", operation="test"))
    with context.scope(ctx):
        yield ctx
```

Without bedrock-py, the same three fixtures: create a database per run and run Alembic's `upgrade head` against it; per test, open a connection, begin a transaction, bind a session to it with `join_transaction_mode="create_savepoint"` (so services' commits become savepoints), and roll the outer transaction back afterwards; open a `system` call context.

## Writing tests

- **Call services inside `db.session_scope()`**, as production entry points do; the rollback fixture still undoes their commits.
- **Name each test after the behaviour it proves**: `test_stale_version_is_rejected`, `test_administrator_cannot_demote_an_administrator`.
- **Each test fails for a bug a user could notice.** Do not test wiring, forwarding, default values, or that a mock was called.
- **Never mock the database or services**, and never call `create_all` in tests. Fake only what crosses the network: provider types registered as fakes, HTTP stubbed at the client.
- **Check validation rules by constructing the entity**: `with pytest.raises(ValidationError): PasswordPolicy(min_length=4)`.
- **HTTP tests** use `TestClient(app)` without its context manager: the session fixture already booted the app, and entering the client would run the lifespan's shutdown.
- **Signals**: connect a receiver in the test and disconnect it in `finally`.
- **Acting as someone else**: nest `context.scope(...)` with that actor.
- Files are `tests/test_<domain>.py`; a domain with several topics may have `tests/test_<domain>_<topic>.py`.

## Contract tests

Each guards an invariant whose breach would be silent. Copy them into `tests/`.

### Every model is registered

Works for both table layouts: it imports every `models` module in the package, then checks that the registry names each mapped class.

```python
# tests/test_models.py
def test_every_model_is_registered() -> None:
    # Migrations see only tables whose classes the registry module {{pkg}}.models names.
    for info in pkgutil.walk_packages({{pkg}}.__path__, "{{pkg}}."):
        if "models" in info.name.split("."):  # models/<domain>.py, or <domain>/models.py
            importlib.import_module(info.name)
    registry = importlib.import_module("{{pkg}}.models")
    defined = {m.class_ for m in BedrockModel.registry.mappers if m.class_.__module__.startswith("{{pkg}}.")}
    registered = {v for v in vars(registry).values() if isinstance(v, type)}
    assert defined <= registered, f"import these in {{pkg}}.models: {defined - registered}"
```

### Time is UTC and versions catch concurrent writes

Probe tables on SQLite, the harshest dialect for the UTC invariant because it drops `tzinfo`:

```python
class UtcProbe(AppModel):
    __tablename__ = "test_utc_probe"

    at: Mapped[datetime]  # plain annotation: must still get UTCDateTime


class VersionedProbe(VersionMixin, AppModel):
    __tablename__ = "test_versioned_probe"

    name: Mapped[str]


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite://")
    tables = BedrockModel.metadata.tables
    BedrockModel.metadata.create_all(engine, tables=[tables["test_utc_probe"], tables["test_versioned_probe"]])
    with Session(engine) as s:
        yield s
    engine.dispose()


def test_datetimes_round_trip_as_aware_utc(session: Session) -> None:
    probe = UtcProbe(at=datetime(2026, 11, 9, 20, 0, tzinfo=timezone(timedelta(hours=8))))
    session.add(probe)
    session.commit()
    session.expire_all()
    loaded = session.get_one(UtcProbe, probe.id)
    assert loaded.at == datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    assert loaded.at.tzinfo is UTC


def test_naive_datetime_is_rejected(session: Session) -> None:
    session.add(UtcProbe(at=datetime(2026, 11, 9, 12, 0)))
    with pytest.raises(exc.StatementError, match="Naive datetime"):
        session.flush()


def test_version_changes_on_update_and_detects_concurrent_writes(session: Session) -> None:
    probe = VersionedProbe(name="a")
    session.add(probe)
    session.commit()
    first = probe.version
    probe.name = "b"
    session.commit()
    assert probe.version != first
    session.execute(text("UPDATE test_versioned_probe SET version = 'deadbeef'"))  # another writer
    probe.name = "c"
    with pytest.raises(StaleDataError):
        session.flush()
```

### The OpenAPI contract

The generated client names its functions after operation ids, so they must be unique, readable, and every operation must document its errors.

```python
# tests/test_api_openapi.py
"""The OpenAPI schema is the contract the frontend client generates from."""

# The verbs route handlers start with (`<action>_<resource>`); a new verb is a deliberate addition here.
ACTIONS = {
    "add", "assign", "complete", "create", "deactivate", "delete", "get", "list", "reactivate",
    "remove", "reset", "revoke", "rotate", "search", "set", "start", "trigger", "update", "verify",
}  # fmt: skip


def test_operation_ids_are_unique_and_errors_are_documented(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    operations = [(path, method, op) for path, item in schema["paths"].items() for method, op in item.items()]
    ids = Counter(op["operationId"] for _, _, op in operations)
    assert [i for i, n in ids.items() if n > 1] == []  # a repeated id makes the generated client drop a function
    assert [(p, m) for p, m, op in operations if "4XX" not in op["responses"]] == []


def test_operation_ids_name_an_action_on_a_resource(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    ids = [op["operationId"] for item in schema["paths"].values() for op in item.values()]
    malformed = [i for i in ids if not re.fullmatch(r"[a-z]+(_[a-z0-9]+)+", i) or i.split("_")[0] not in ACTIONS]
    assert malformed == []  # the client exposes these as function names: searchUsers, getApplication, ...
```

### Domains import along drawn edges

The dependency graph in `docs/architecture/overview.md`, as a test. A new package fails until it is placed; a new edge fails until it is drawn.

```python
# tests/test_architecture.py
"""Domains import each other only along the edges docs/architecture/overview.md draws."""

import ast
from pathlib import Path

PACKAGE = "{{pkg}}"
ROOT = Path(__file__).resolve().parents[1] / PACKAGE

# Each domain and the domains it may import; keep in step with the architecture overview's dependency graph.
ALLOWED: dict[str, set[str]] = {
    "access": {"application", "directory"},
    "application": set(),
    "directory": {"runtime_config"},
    "identity": {"directory", "runtime_config"},
    "runtime_config": set(),
}
# Modules below every domain, importable from all of them; none of them imports a domain.
# Add "models" here only when tables live in one package; with tables in the domains, it belongs in TOP.
SHARED = {"db", "utils", "exc", "settings", "audit", "authz", "context"}
# Modules above every domain, which no domain imports.
TOP = {"api", "migrations", "models"}


def _imported_modules(path: Path) -> list[str]:
    modules: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            modules += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            # Each imported name may be a module: `from pkg import audit`, `from pkg.access import models`.
            modules += [f"{node.module}.{alias.name}" for alias in node.names]
    return modules


def test_every_package_is_placed() -> None:
    packages = {p.name for p in ROOT.iterdir() if (p / "__init__.py").exists()}
    assert packages - ALLOWED.keys() - SHARED - TOP == set(), "add new packages to ALLOWED, SHARED, or TOP"


def test_domains_import_only_allowed_domains() -> None:
    edges = []
    for domain, allowed in ALLOWED.items():
        for path in sorted((ROOT / domain).rglob("*.py")):
            for module in _imported_modules(path):
                parts = module.split(".")
                if parts[0] != PACKAGE or len(parts) < 2 or parts[1] == domain:
                    continue
                where = f"{path.relative_to(ROOT.parent)}: {domain} -> {'.'.join(parts[1:3])}"
                if parts[1] not in {*SHARED, *allowed}:
                    edges.append(where)
                elif parts[1] in allowed and parts[2:3] == ["models"]:
                    edges.append(where + " (another domain's tables: call its functions)")
    assert edges == [], "an edge the architecture overview does not draw:\n" + "\n".join(edges)
```

Imports inside `if TYPE_CHECKING:` blocks count too: a type-only dependency is still a dependency of the code's meaning.

Shared modules must themselves import no domain. If one needs to (an audit record naming a user), it takes ids and leaves the lookups to the caller.
