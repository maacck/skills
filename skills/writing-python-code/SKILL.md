---
name: writing-python-code
description: Use when writing, modifying, refactoring, or reviewing Python code — new modules, functions, classes, scripts, CLIs, utility/helper functions, or bug fixes in existing .py files — and when deciding on type hints, docstring style, inline comments, function size, where utilities belong, or which coding conventions take precedence in a project.
---

# Writing Python Code

## Overview

Personal Python conventions:

1. Every function is fully typed: all inputs and the output.
2. Every function has a Google-style docstring.
3. Complex logic is split into an orchestrating flow function plus small step functions.
4. Reuse before writing: search the project for an existing function first; generic helpers live in shared utils, not in business code.
5. Complex flows carry inline comments that mark the logic, so a reader can follow it in one pass.
6. **Project conventions win, rule by rule.** This skill only fills the gaps a project leaves open.

Rules hold under time pressure: "quick script", "demo", and "minimal bugfix" are not exemptions. Annotations and docstrings take seconds; untyped, undocumented 80-line functions cost hours later.

## 1. Project Conventions First

Before writing code, check:

| Source | Look for |
|---|---|
| `pyproject.toml`, `ruff.toml`, `setup.cfg`, `.flake8`, `tox.ini` | lint select/ignore, `pydocstyle.convention`, `max-complexity`, pylint limits, `target-version` |
| `[tool.mypy]`, `mypy.ini`, `[tool.pyright]`, `pyrightconfig.json` | strictness, `disallow_untyped_defs` |
| `requires-python` | which typing syntax is allowed (table below) |
| `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, style docs | written rules |
| `.pre-commit-config.yaml`, CI workflows | which checks actually run |
| Neighboring code in the same package | docstring style, typing style, helper placement, existing utils modules |

Resolve each rule separately:

- Project states a rule (config or docs) → follow it, even against this skill. E.g. `convention = "numpy"` → numpy docstrings; this skill's typing and decomposition rules still apply.
- No stated rule, but existing code is consistent (e.g. Sphinx `:param:` docstrings, `Optional[X]`) → match the existing code.
- No rule and no consistent existing style → this skill.
- Never convert existing code to this skill's style unless asked.

| Syntax | Minimum Python |
|---|---|
| `list[str]`, `dict[str, int]` | 3.9 |
| `X \| None`, `A \| B` | 3.10 |
| `typing.Self` | 3.11 (else `typing_extensions`) |
| `typing.override`, `type Alias = ...`, `def f[T]()` | 3.12 |

`from __future__ import annotations` makes the first two work earlier **inside annotations only** — not in runtime-evaluated types (Pydantic fields, `cast()`, type aliases, `isinstance`).

## 2. Type Hints

- Annotate every parameter and the return of every function and method: public, private, nested, and tests. Write `-> None` explicitly, including `__init__`. Leave `self`/`cls` bare.
- Be precise:
  - Inputs accept abstract types (`Iterable`, `Sequence`, `Mapping`); outputs return concrete types (`list`, `dict`).
  - Fixed choices: `Literal["summary", "detail"]` or an `Enum`, not `str`.
  - Structured data: `@dataclass`, `TypedDict`, `NamedTuple`, or Pydantic model — not `dict[str, Any]` or tuples of 3+ elements.
  - Callables `Callable[[Order], bool]`, generators `Iterator[Row]`, generic helpers `TypeVar`.
  - Optional values: `X | None = None`; never implicit Optional (`x: int = None`).
- `Any` only at genuinely dynamic boundaries (raw JSON, untyped libraries). Parse it into a typed structure immediately; use `object` when a value is only passed through.
- Annotate module constants, class attributes, and locals the checker cannot infer (`rows: list[Row] = []`).
- `# type: ignore` always carries an error code and a reason: `# type: ignore[import-untyped]  # no stubs`.

## 3. Google Docstrings

Every function and method gets one — public, private, nested, and tests. Exempt only: standard dunders with conventional behavior (`__repr__`, `__eq__`, `__hash__`, `__len__`) and `@overload` stubs.

```python
def apply_coupon(subtotal: Decimal, coupon: Coupon | None) -> Decimal:
    """Applies a coupon to an invoice subtotal, never going below zero.

    Percent coupons scale the subtotal; fixed coupons subtract their value.
    The result is clamped at zero so invoices are never negative.

    Args:
        subtotal: Net amount before discounts, in invoice currency.
        coupon: Coupon to apply; `None` returns `subtotal` unchanged.

    Returns:
        The discounted subtotal, at least zero.

    Raises:
        ValueError: If a percent coupon is outside 0-100.
    """
```

- Summary: one line ending in a period, says *what*, not *how*. Descriptive (`Applies…`) or imperative (`Apply…`), consistent within a file.
- Extended description (optional): why, invariants, side effects (IO, mutation, network), units.
- Sections in this order, only those that apply: `Args:`, `Returns:` or `Yields:`, `Raises:`, `Example:`, `Note:`.
- `Args:` names every parameter except `self`/`cls`; `*args:` and `**kwargs:` by those names.
- No types in the docstring — annotations are the single source. Describe meaning, units, valid range, what `None` means.
- `Returns:` states meaning including empty/`None` cases; tuples describe each element. Omit for `-> None`.
- `Raises:` lists exceptions callers are expected to handle, not every possible failure.
- Classes: summary + `Attributes:` for public attributes; `__init__` docstring carries `Args:`. Dataclasses and `TypedDict`: `Attributes:` only. Properties: attribute-style (`"""The invoice total in USD."""`).
- Tests: summary names the behavior under test; pytest fixture parameters need no `Args:`.

## 4. Orchestrator + Step Functions

Complex logic becomes one **orchestrator** (flow function) that reads as a sequence of named steps, plus **step functions** that each do one thing at one level of abstraction.

```python
def build_report(
    rows: Iterable[Mapping[str, str]], rates: Mapping[str, float], top: int
) -> Report:
    """..."""
    # Refunded and pending orders never count toward spend, so filter them
    # before validation: their bad amounts are not reported as rejected.
    paid_rows = [row for row in rows if row["status"] == "paid"]
    # Unconvertible rows are dropped but counted, so the report shows how
    # much input was ignored instead of silently shrinking totals.
    orders, rejected = _parse_orders(paid_rows, rates)
    totals = _total_by_customer(orders)
    # Rank on unrounded totals; rounding to cents is display-only.
    return {"top_customers": _rank(totals, top), "rejected": rejected}
```

Full module with steps, typed data, and IO at the edges: `example.py` in this skill directory.

Split when any holds:

| Signal | Extract |
|---|---|
| Body > ~30 lines (excluding docstring), or nesting depth > 2 | Steps |
| Several distinct phases in one body, or the summary needs "and" | One function per phase |
| IO (files, network, DB, print) mixed with computation | IO into edge functions; computation pure |
| Loop body longer than a few lines | `_handle_row(row)` |
| Condition that takes thought to read | Predicate `_is_billable(customer) -> bool` |
| Boolean/mode parameter switching between behaviors | Two functions, or a dispatch mapping |
| ruff `C901` > 10, `PLR0912` > 12 branches, `PLR0915` > 50 statements | Steps until under the limit |

Shape:

- Orchestrator: loads input, calls steps in order, passes typed data, returns or writes the result. Minimal branching of its own.
- Steps: pure where possible — inputs in, output out, no IO, no mutation of arguments.
- Data between steps: dataclass / `TypedDict`, not loose dicts or long tuples.
- Names say what: `parse_orders`, `convert_to_usd`, `rank_customers` — not `process`, `handle`, `do_stuff`.
- Private steps are `_`-prefixed, in the same module, below their orchestrator (top-down reading) unless the project orders differently.

Do not over-split:

- No helper that only forwards to one call or wraps a self-explanatory expression.
- Do not break a cohesive ≤15-line function apart to hit a count.
- Steps sharing much mutable state → group it in a dataclass or class instead of threading 6 parameters.

## 5. Reuse Before Writing Utilities

A utility is a function with no business knowledge: time and dates, string/path handling, chunking, retries, serialization, env/config access, ID generation, money rounding. Duplicated utilities drift apart — a bug gets fixed in one copy while the others keep it.

Before writing one:

1. **Search the project** by behavior, not only by name; the same need hides under different names. For "current UTC time": `utc_now`, `utcnow`, `datetime.now(`, `timezone.utc`. Check `utils/`, `common/`, `core/`, `helpers/`, `shared/`, `lib/` first.
2. **Found → import it.** Slightly different need → extend it backward-compatibly (new optional parameter) instead of writing a near-copy. If extending would change behavior for existing callers, write a separate function and say why.
3. **Not found → check the stdlib and installed dependencies** (`functools.cache`, `itertools.batched` on 3.12+, `pathlib`, `shlex`, an installed `tenacity` or `pendulum`). Never add a new dependency for a small helper without asking.
4. **Still nothing → decide where it lives:**

| The function is | Put it |
|---|---|
| Generic, likely needed elsewhere (`utc_now()`, `chunked()`, `to_cents()`) | Shared utils module: public name, typed, documented |
| Encoding a feature's business rule, however short | Private step in that feature's module |
| Unclear | Private in the feature module; promote to utils when a second caller appears |

```python
# <package>/utils/time.py
from datetime import datetime, timezone


def utc_now() -> datetime:
    """Returns the current time as a timezone-aware UTC datetime.

    Returns:
        Aware `datetime` with `tzinfo=timezone.utc`; never naive.
    """
    return datetime.now(timezone.utc)
```

Business code calls `utc_now()` instead of inlining `datetime.now(...)`: every caller gets aware UTC (`datetime.utcnow()` is naive and deprecated since 3.12), and tests patch one place.

- Use the project's existing utils module or package; match its layout and naming.
- None exists → create one inside the package, grouped by topic (`utils/time.py`, `utils/text.py`) rather than one ever-growing `utils.py`.
- Dependency direction: business code imports utils, never the reverse. A function that needs a business model is not a utility.
- Duplicates already in the project → use the most widely used one; report the duplication instead of consolidating unasked.

This is a thinking aid, not a mandate: weigh how likely reuse is, how stable the behavior is, and how the project is structured. A one-off two-liner does not justify a new utils module.

## 6. Inline Comments for Complex Flows

Docstrings say *what* a function does; inline comments walk the reader through *how a complex flow works and why*. A flow is complex when a reader cannot follow it in one pass: orchestrators with several phases, algorithms, non-trivial conditions, state transitions, accumulating loops, retries and fallbacks, concurrency, formulas.

| Where | Comment states |
|---|---|
| Each phase of an orchestrator or multi-step flow | What the phase achieves and what it guarantees to the next one |
| Order-dependent steps | Why this order (`# Credits before coupons: percent coupons scale the reduced subtotal.`) |
| Non-obvious condition or branch | The business rule or case it handles |
| Magic numbers, formulas, thresholds | Meaning, source, units (`# 0.8: 20% volume discount above 1000 units.`) |
| Loop with an accumulator or invariant | What holds after each iteration |
| Guards, early returns, edge cases | Which input triggers it and why skipping is correct |
| Workarounds, retries, fallbacks | What breaks without it; issue link when known |

```python
# Bad: restates the code
# filter paid rows
paid_rows = [row for row in rows if row["status"] == "paid"]

# Good: states the rule and its consequence
# Refunded and pending orders never count toward spend, so filter them
# before validation: their bad amounts are not reported as rejected.
paid_rows = [row for row in rows if row["status"] == "paid"]
```

- Block comment on its own line(s) above the code it explains; end-of-line comments only for short notes (units, a constant's meaning).
- Intent, rule, or reason — never a restatement (`# increment i`, `# loop over orders`).
- Density follows complexity: straightforward code gets none.
- Comments are not a substitute for splitting. A function needing comment headers to separate its phases gets split (section 4); its orchestrator then carries one comment per phase.
- Changing code means updating its comments in the same edit; a stale comment is worse than none.
- Language: match existing comments in the project; in a new codebase, English unless the user asks otherwise.

## 7. Editing Existing Code

| Code | Required |
|---|---|
| Function you create or rewrite | Full compliance |
| Function you modify | Add its missing annotations and docstring. Put new logic in a new typed, documented helper instead of growing the function — reusing existing utilities first (section 5); extracting the block you are changing is in scope. Comment complex logic you add or change. |
| Untouched functions and blocks | Leave as is; mention notable violations to the user instead of refactoring unasked |

"Minimal diff" means minimal behavior change, not skipping types, docstrings, or extraction on the code you touch. Extraction must not change outputs — confirm with the existing tests or a smoke run.

## Verify

1. Run the project's own lint and type checks (ruff, mypy, pyright, pre-commit) on changed files.
2. Where the project does not lint typing/docstrings/complexity, run this gap check on changed files (`uvx ruff` if ruff is not installed):

```bash
ruff check --select ANN,D,C901,PLR0912,PLR0915 --ignore D100,D104,D105 \
  --config 'lint.pydocstyle.convention = "google"' <changed files>
```

Drop the `--config` override when the project sets its own docstring convention; drop rule groups the project explicitly ignores. Findings in untouched code are reported, not fixed (section 7). Inline comments have no linter: reread each complex flow you wrote and check every phase, ordering, and magic number is explained.

In the final summary, list every utility you reused and every new shared utility you added (with its module), so the user can veto the placement.

## Red Flags

| Thought | Reality |
|---|---|
| "Quick script / demo, skip types and docstrings" | Rules apply to all code; they take seconds |
| "Private helper is obvious, no docstring" | Every function gets one, with `Args:` when it has parameters |
| "Minimal bugfix: add two branches inline" | New logic goes into a helper; touched function gets types and docstring |
| "I prefer Google; the project uses numpy" | Project wins |
| "While here, I'll restyle the whole file" | Only code you touch; report the rest |
| "`dict[str, Any]` is fine for now" | Define a `TypedDict` or dataclass |
| "It's one long function but it works" | Orchestrator + steps; long functions hide bugs |
| "The flow is self-explanatory" | The reader needs the why: phase purpose, ordering, business rules |
| "Comment every line to be safe" | Restating code is noise; comment intent and non-obvious logic only |
| "Faster to write my own than to search" | A search takes seconds; duplicates drift and bugs get fixed in one copy only |
| "Inline `datetime.now(timezone.utc)` in the service" | Common need → shared `utc_now()`: one place to change and to patch in tests |
| "It's short, so it goes in utils" | Business rules stay in their feature; utils hold business-free code |
