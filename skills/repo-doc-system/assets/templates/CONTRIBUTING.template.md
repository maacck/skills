# Contributing to {{Project}}

This guide covers setting up and getting a change merged. How code should look is in the [backend conventions](docs/conventions/backend.md).

## Language

Everything in the repository is written in English: code, comments, docs, commit messages, pull requests, and issues. Planning may happen elsewhere and in other languages, but a decision counts only once it is recorded here: product scope in [docs/product](docs/product/overview.md), structure in [docs/architecture](docs/architecture/overview.md), and rationale in [docs/adr](docs/adr/).

## Prerequisites

- {{Runtime and package manager, with versions}}
- {{Docker with Compose, for the development services}}

## Setup

```bash
{{install}}
{{services}}
{{migrate}}
{{run}}
```

{{Environment traps, e.g. which commands need --env-file .env and why.}}

## Making a change

1. Branch from the default branch.
2. Read the docs for the area you are changing. [AGENTS.md](AGENTS.md#read-before-you-change) lists which.
3. Keep the change focused. Align the docs in the same change: see [Which docs a change moves](#which-docs-a-change-moves).
4. If the change makes a decision that is hard to reverse, surprising without context, and the result of a real trade-off, add a decision record in [docs/adr](docs/adr/) with the next number. A paragraph is enough.
5. Run the checks.
6. Open a pull request.

## Which docs a change moves

Every change ends with this check. Most changes move no document; the pull request then says `Docs: none needed` and why.

1. List what the change touched: names (domain terms, public functions, routes, error codes, commands), modules added, moved, or removed, settings, migrations, dependencies, and behaviour a user or caller can observe.
2. Find every document that states those facts: follow each touched package's `Usage: docs/developer/<module>.md.` pointer, and search the docs for each changed or removed name, old names included: `rg -n -w '<name>' docs AGENTS.md README.md CONTRIBUTING.md CONTEXT.md`.
3. Update each statement that is no longer true, and give each new fact its home:

| Change                                                | Update                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New or renamed domain concept                         | [CONTEXT.md](CONTEXT.md) first, then the code                                               |
| Something renamed or removed                          | Every mention of the old name                                                               |
| Shared module's public API                            | Its guide in [docs/developer/](docs/developer/README.md); a new module also its index entry |
| Behaviour a user or caller can observe                | The guide that describes it; [requirements](docs/product/requirements.md) if one moved      |
| New module, dependency edge, extension point, or flow | [Architecture overview](docs/architecture/overview.md), with its status marker              |
| Hard-to-reverse decision                              | A new record in [docs/adr](docs/adr/)                                                       |
| New coding rule                                       | The conventions document of its area                                                        |
| Something found to fail silently                      | The guide's Pitfalls, or the Gotchas in [AGENTS.md](AGENTS.md)                              |
| New environment variable                              | Every `.env.example`, the architecture configuration table, the pull request's deploy notes |
| New or changed command                                | `AGENTS.md`, this file, the `Makefile`, and CI, identically                                 |

## Checks

```bash
{{check line, identical to AGENTS.md, the Makefile, and CI}}
```

To fix formatting: `{{format command}}`.

{{Which CI workflow runs the checks, on which paths and events.}}

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>
```

- **type:** `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, or `chore`.
- **scope:** a domain ({{domains}}), or `docs`. Leave it out when a change cuts across areas.
- **summary:** imperative and lowercase, without a trailing period.
- **body:** why the change is needed, when that isn't obvious.
- **breaking changes:** add `!` before the colon and a `BREAKING CHANGE:` footer.

## Pull requests

- The title follows the commit message format.
- The description says what changes, why, and how you verified it, and links the issue if there is one. The [template](.github/pull_request_template.md) asks for these, plus deploy notes for the release.
- Every check passes and the affected docs are updated.
