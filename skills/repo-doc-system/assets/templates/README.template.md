# {{Project}}

{{One paragraph: what it is, who uses it, the value it brings.}}

> **Status:** {{early development / in production}}. The [product overview](docs/product/overview.md) describes its scope.

## Repository layout

```
{{pkg}}/             {{Core package}}
tests/               Backend tests
docs/                Product, architecture, conventions, developer guides, decision records
```

## Quick start

Requires {{runtimes and tools, with versions}}.

```bash
{{install}}
{{services}}
{{migrate}}
{{run}}                        # {{where it listens, and how to check it is up}}
```

## Deploying

{{What runs where, the order services start in, and the commands. Remove this section until there is a deployment.}}

## Documentation

| Document                                               | Covers                                             |
| ------------------------------------------------------ | -------------------------------------------------- |
| [Product overview](docs/product/overview.md)           | Scope, users, journeys, decisions                  |
| [Requirements](docs/product/requirements.md)           | Requirements, acceptance criteria                  |
| [CONTEXT.md](CONTEXT.md)                               | Domain glossary                                    |
| [Architecture overview](docs/architecture/overview.md) | Modules, dependencies, extension points, key flows |
| [Developer guides](docs/developer/README.md)           | How to use shared modules                          |
| [Backend conventions](docs/conventions/backend.md)     | How backend code is organised and written          |
| [Decision records](docs/adr/)                          | Why the major choices were made                    |
| [CONTRIBUTING.md](CONTRIBUTING.md)                     | Setup, checks, commit messages, pull requests      |

## License

{{License}}
