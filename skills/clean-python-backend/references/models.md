# Models and migrations

Tables live where the project decided (`SKILL.md`, "Where tables live"): in each domain's `models.py`, or in one `models/` package. Either way the base classes sit in a module below every domain (`{{pkg}}/db.py` below), one registry module (`{{pkg}}.models`) imports every table so autogenerate sees it, and the core keeps one migration branch.

## The base

```python
# {{pkg}}/db.py
"""Shared ORM base classes and the UTC-only time type.

Backend time is aware UTC everywhere; the frontend converts it for display.
See docs/adr/NNNN-utc-only-backend-time.md and docs/adr/NNNN-random-version-for-optimistic-locking.md.
"""


def utcnow() -> datetime:
    """Return the current time as an aware datetime in UTC."""
    return datetime.now(UTC)


def _new_version(_previous: str | None = None) -> str:
    return secrets.token_hex(4)


class UTCDateTime(TypeDecorator[datetime]):
    """A ``timestamptz`` column that only accepts aware datetimes and always returns aware UTC.

    The guarantee holds on every dialect, including SQLite, which does not store a time zone.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | str | None, dialect: Dialect) -> datetime | None:
        """Convert a value on its way to the database.

        Raises:
            ValueError: If ``value`` is naive, or a string that is not an ISO-8601 time.
        """
        if value is None:
            return None
        if isinstance(value, str):  # a list filter's value arrives from JSON as a string
            value = datetime.fromisoformat(value)
        if value.tzinfo is None:
            raise ValueError(f"Naive datetime {value!r}; use an aware datetime such as utcnow().")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Convert a value read from the database to aware UTC."""
        if value is None:
            return None
        # SQLite drops tzinfo; values were stored as UTC by process_bind_param.
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


# Every `Mapped[datetime]` column on the base's subclasses (core and plugins) maps to UTCDateTime.
BedrockModel.registry.update_type_annotation_map({datetime: UTCDateTime})


class AppModel(BedrockModel):
    """Base for {{pkg}} tables.

    Attributes:
        id: Random UUID primary key, assigned when the object is constructed.
        created_at: When the row was inserted (UTC).
        updated_at: When the row was last updated through the ORM (UTC).
    """

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class VersionMixin:
    """Optimistic locking through a random ``version`` that changes on every ORM insert and update.

    An update whose row changed since it was loaded raises ``StaleDataError``. Across an HTTP round trip, compare
    the client's version with the loaded row before writing. Core ``update()`` statements bypass the check. Use as
    ``class Foo(VersionMixin, AppModel)``; a model that sets its own ``__mapper_args__`` must merge these in.

    Attributes:
        version: 8 random hex characters.
    """

    if TYPE_CHECKING:
        __table__: ClassVar[FromClause]

    version: Mapped[str] = mapped_column(String(8), default=_new_version)

    @declared_attr.directive
    def __mapper_args__(cls) -> dict[str, object]:
        """Make SQLAlchemy check and regenerate ``version`` on every flush."""
        return {"version_id_col": cls.__table__.c.version, "version_id_generator": _new_version}
```

Without bedrock-py, `BedrockModel` is your `DeclarativeBase` subclass and `registry.update_type_annotation_map` becomes its `type_annotation_map = {datetime: UTCDateTime}`.

## A model

```python
class Application(VersionMixin, AppModel):
    """An entry on the Launchpad.

    Attributes:
        name: Shown on the Launchpad.
        status: ``active`` or ``disabled``; validated by the entities that write it.
        category: The category, loaded only where a query asks for it.
    """

    __tablename__ = "application"
    # What admin lists may search, filter, and sort on (utils.search); never a secret digest.
    __searchable_columns__ = ["name", "url"]
    __filterable_fields__ = ["name", "status", "created_at"]

    name: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(16), index=True)
    client_secret_hash: Mapped[str | None] = mapped_column(String(64))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("application_category.id"))

    category: Mapped[ApplicationCategory | None] = relationship(lazy="raise")
```

- **Mixins first**, then the base.
- **A record's human-readable label is `name`**, everywhere.
- **Allowed values are not in the schema** (no `CHECK`, no database enums): `status` is `String`, and the entity's `Literal["active", "disabled"]` validates it. Generic SQLAlchemy types only: no `JSONB`, `INET`, partial indexes, or other dialect options. The schema holds keys, `NOT NULL`, unique constraints, foreign keys, and indexes.
- **`Mapped[datetime]`, never `DateTime(...)`**; the annotation map applies the UTC type.
- Secrets are stored as digests or encrypted, and never appear in `__searchable_columns__` or `__filterable_fields__`.

## Relationships

Declare them on the model; load them where a query needs them; never lazy-load.

```python
class User(AppModel):
    organization_units: Mapped[list[OrganizationUnit]] = relationship(
        secondary="membership", viewonly=True, lazy="raise", order_by="OrganizationUnit.name"
    )
```

- `lazy="raise"`: reading an unloaded relationship raises, so a missing option fails the first test instead of becoming an N+1 query in production.
- `viewonly=True` when it goes through a link table that a service writes as its own model.
- With tables in the domains, a relationship to another domain's table names its class as a string (`relationship("User", lazy="raise")`) and its foreign key by table (`ForeignKey("user.id")`), so neither domain imports the other's models.
- Load with `selectinload` for a collection (one extra `IN` query per page; `joinedload` multiplies rows and breaks `LIMIT`) and `joinedload` for a single related row. Paged lists pass them to `search(..., options=[...])`.
- Do not hand-build `{id: [...]}` maps with a second query.

## Migrations

```bash
uv run --env-file .env bedrock db revision {{pkg}} -m "add applications"   # autogenerate from the models
```

Read every generated migration before committing it:

- [ ] Each table, column, index, and constraint is one you meant; nothing is dropped by accident.
- [ ] Datetime columns are `sa.DateTime(timezone=True)`. Autogenerate writes the custom type (`{{pkg}}.db.UTCDateTime(timezone=True)`) without importing it; replace each one. The test suite runs the migrations, so a missed one fails with `NameError`.
- [ ] New `NOT NULL` columns on existing tables have a server default or a data step.
- [ ] `downgrade()` reverses `upgrade()`.

Never edit a migration that has been applied to a shared database; add a new one. Migrations are generated code: exclude them from ruff and mypy.
