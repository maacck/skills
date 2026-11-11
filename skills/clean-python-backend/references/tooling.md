# Tooling

The rules a tool can check are checked by a tool, locally on commit and again in CI. The configuration lives in `pyproject.toml` (start from `assets/pyproject.fragment.toml`); every line that deviates from a default says why in a trailing comment.

## What each tool enforces

| Tool                     | Enforces                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| ruff format              | Formatting, line length 120. Nobody hand-formats against it.                                   |
| ruff `E W F I B C4 UP`   | Errors, imports sorted, bugbear, comprehensions, modern syntax                                 |
| ruff `D` (Google)        | A docstring on every public module, class, and function, in Google style                       |
| ruff `DOC201 … DOC501`   | `Returns`, `Yields`, and `Raises` sections match the code (preview rules, opted in one by one) |
| ruff `ANN401`            | No bare `Any` in a signature                                                                   |
| ruff `TID251`            | The core never imports optional plugins                                                        |
| mypy `strict` + pydantic | Every parameter and return annotated, tests included; Pydantic constructors type-checked       |
| pytest                   | Behaviour, plus the contract tests (`references/testing.md`)                                   |
| `uv sync --locked` in CI | `uv.lock` matches `pyproject.toml`                                                             |

`DOC502` (a `Raises` entry the function body does not raise) stays off: `Raises:` deliberately lists what callees raise, because that is what callers handle.

## Typing rules a checker cannot fully express

- `# type: ignore[code]` carries the specific code and a reason the type system cannot express: `# type: ignore[method-assign]  # httpx's request() calls self.send`.
- Prefer a `TYPE_CHECKING`-only declaration when a framework adds attributes at runtime (`__table__` on a mixin).
- `typing.cast` meets the same bar.
- `Any` only nested inside a container of untyped data: `dict[str, Any]` for JSON.
- Third-party packages without type information are listed in one `[[tool.mypy.overrides]]` block with a comment.

## Pre-commit

Hooks run the tool versions the project already installed, so there is one version of each tool:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ruff-check
        name: Ruff lint
        entry: uv run --locked ruff check --fix --force-exclude
        language: system
        types_or: [python, pyi]
      - id: ruff-format
        name: Ruff format
        entry: uv run --locked ruff format --force-exclude
        language: system
        types_or: [python, pyi]
```

Tests and mypy stay out of the commit hook; they run in the full check.

## One check line

The same line appears in `AGENTS.md` ("Done means"), `CONTRIBUTING.md`, the `Makefile`, and CI:

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```

```makefile
.DEFAULT_GOAL := help

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

check: ## Everything CI runs
	uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest

revision: .env ## New migration from model changes: make revision m="<change>"
	@test -n "$(m)" || { echo 'usage: make revision m="<change>"'; exit 1; }
	uv run --env-file .env bedrock db revision {{pkg}} -m "$(m)"
```

## CI

- **On pull requests and pushes to main**, filtered to backend paths: lint, format, types (`uv sync --locked` first) in one job; tests in another, with the database and Redis as service containers using the same images and credentials as `docker-compose.yml`.
- **Before a release** (a pushed `v*` tag or a manual run): build the production image, then import the API, the worker, and every plugin inside it with placeholder settings. The image installs without the dev group, so a runtime dependency declared only there builds fine and fails at startup; this catches it.
- **Dependency audit before a release only** (`uv audit --no-dev --locked`): a newly published advisory should not turn unrelated pull requests red.
- Pin actions by commit SHA with the version in a comment; `permissions: contents: read`; cancel superseded pull request runs, never main or tag runs.

## Dependencies

- The standard library and existing dependencies come first. A new dependency states why in the pull request.
- An upper bound needs a comment naming what breaks: `"authlib>=1.9.5,<1.10",  # sso/ subclasses Authlib internals; re-run the SSO tests before raising the bound`.
- Dev-only tools go in `[dependency-groups] dev`; optional runtime features in their own group.
