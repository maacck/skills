# Errors

One base class, one module per domain, one response body. The class carries everything: its message, its HTTP status, and the code the frontend translates. There is no mapping table to keep in step.

## The base exception

```python
# {{pkg}}/exc.py
"""The base of every {{pkg}} exception: an HTTP status and a message template."""

from typing import ClassVar

from bedrock.exc import BedrockExc  # without bedrock-py: Exception


class AppError(BedrockExc):
    """Base class for {{pkg}} exceptions; each domain's base exception subclasses it.

    ``detail`` is a ``str.format`` template filled from the keyword arguments given when raising; a positional
    message replaces it outright. ``status_code`` is the HTTP status the API answers with; ``None`` keeps the
    error internal: the client gets a generic 500 and never sees ``detail``. ``code`` is the stable key the
    frontend translates (``<domain>.<name>``); every class with a ``status_code`` needs one, and a code never
    changes once shipped, even if the class is renamed.

    Attributes:
        params: The keyword arguments the message was formatted with; client-facing errors return them.
    """

    code: ClassVar[str | None] = None
    detail: str = "{{pkg}} operation failed."
    status_code: ClassVar[int | None] = None

    def __init_subclass__(cls, **kwargs: object) -> None:
        """Refuse a client-facing exception class without a code, at import time.

        Raises:
            TypeError: The class has a ``status_code`` but no ``code``.
        """
        super().__init_subclass__(**kwargs)
        if cls.status_code is not None and cls.code is None:
            raise TypeError(f"{cls.__qualname__} sets status_code but no code; the frontend needs one to translate it.")

    def __init__(self, msg: str | None = None, /, **params: object) -> None:
        """Format the message from the class template, unless one is given.

        Args:
            msg: A message replacing the template.
            **params: Values for the template's ``{placeholders}``.
        """
        self.params = params
        super().__init__(msg if msg is not None else self.detail.format(**params))
```

## A domain's exceptions

```python
# {{pkg}}/directory/exc.py
"""Exceptions raised by the directory domain."""

from {{pkg}}.exc import AppError


class DirectoryError(AppError):
    """Base class for directory errors."""

    detail: str = "Directory operation failed."


class UserNotFound(DirectoryError):
    """No user has the given id."""

    code = "directory.user_not_found"
    detail: str = "User not found."
    status_code = 404


class DirectoryConflict(DirectoryError):
    """The record changed since the caller read it."""

    code = "directory.conflict"
    detail: str = "The record was changed by someone else; reload and retry."
    status_code = 409


class ProviderApiError(DirectoryError):
    """The directory provider refused or failed a request."""

    code = "directory.provider_api_error"
    detail: str = "The directory provider answered with error {error_code}."
    status_code = 502
```

Raise with keyword arguments; they fill the template and reach the client as `params`, for translation:

```python
raise ProviderApiError(error_code=99991663)  # "The directory provider answered with error 99991663."
```

- The class docstring says when it is raised; the caller's docstring lists it under `Raises:`.
- Name exceptions after what happened (`UserNotFound`, `UsernameTaken`), not after the status.
- Never put a secret, token, or password into the params of a client-facing exception.
- Subclasses inherit `status_code`; a family of 404s may share one base.

## The error body

Every failure, from a domain, the router, validation, or a crash, answers `{"code", "detail", "params"}`.

```python
# {{pkg}}/api/errors.py
SERVER_ERROR = {"code": "server.error", "detail": "The service failed to answer.", "params": {}}


def error_body(exc: AppError) -> dict[str, Any]:
    """Return the JSON body every client-facing error is answered with."""
    return {"code": exc.code, "detail": exc.detail, "params": to_jsonable_python(exc.params)}


async def app_error_handler(request: Request, exc: Exception) -> Response:
    """Answer with the exception's ``status_code``; errors without one are re-raised and become a generic 500."""
    if not isinstance(exc, AppError) or exc.status_code is None:
        raise exc
    return JSONResponse(error_body(exc), status_code=exc.status_code)


async def validation_error_handler(request: Request, exc: Exception) -> Response:
    """Answer a validation failure, a service's or the request's own, without the submitted values."""
    if isinstance(exc, ValidationError):
        errors: list[Any] = exc.errors(include_url=False, include_input=False)
    elif isinstance(exc, RequestValidationError):
        # A body field may be a password; never send it back.
        errors = [{k: v for k, v in error.items() if k != "input"} for error in exc.errors()]
    else:
        raise exc
    body = {"code": "validation_error", "detail": "Validation failed.", "params": {"errors": errors}}
    return JSONResponse(to_jsonable_python(body, fallback=str), status_code=422)


async def server_error_handler(request: Request, exc: Exception) -> Response:
    """Answer an unexpected error with a generic 500 that never shows its cause."""
    return JSONResponse(SERVER_ERROR, status_code=500)
```

Refusals by the HTTP layer itself get codes too, defined as `AppError` subclasses next to the handlers: `request.not_found` (404), `request.method_not_allowed` (405), `request.refused` (any other), `request.rate_limited` (429), `request.invalid_precondition` (400).

Register the handlers for `AppError`, `HTTPException`, `ValidationError`, `RequestValidationError`, and `Exception`. Document the body in OpenAPI once, for every route:

```python
class ErrorBody(BaseModel):
    """The body of every client-facing error."""

    code: str
    detail: str
    params: dict[str, Any]


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorBody, "description": "The request failed validation."},  # replaces FastAPI's own 422 model
    "4XX": {"model": ErrorBody, "description": "The request was refused."},
    "5XX": {"model": ErrorBody, "description": "The service failed to answer."},
}

app = FastAPI(responses=ERROR_RESPONSES, generate_unique_id_function=lambda route: route.name)
```

## Rules

- Malformed input is Pydantic's job: let `ValidationError` propagate; it answers 422.
- Catch an exception only to translate it into the domain's own (`except IntegrityError: raise UsernameTaken() from exc`) or to record a failure before re-raising. Never to hide it.
- A refusal that must not reveal its reason (sign-in) raises one generic exception and audits the real reason first.
