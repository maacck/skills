# Architecture overview

Status markers: **Implemented** exists in the code today; **Planned** is agreed but not built; **Open** is undecided. Product scope is in the [product overview](../product/overview.md), terms in [CONTEXT.md](../../CONTEXT.md), the reasons for major choices in the [decision records](../adr/), and how code is written in the [backend conventions](../conventions/backend.md).

## System context

```mermaid
flowchart LR
  user([{{Persona}}]) --> api[{{Project}} API]
  api --> db[(Database)]
  api <--> ext([{{External system}}])
```

## Technology

| Concern         | Choice                |
| --------------- | --------------------- |
| Backend runtime | {{Language, version}} |
| HTTP            | {{Framework}}         |
| Persistence     | {{ORM, migrations}}   |
| Database        | {{Database, version}} |
| Background work | {{Queue, broker}}     |
| Tooling         | {{Tools}}             |

## Repository layout

```
{{pkg}}/                 Core package
  api/                   HTTP app and every core route
  db.py                  Shared base classes: base model, UTC time type, version mixin
  models                 The registry importing every table; tables live {{in each domain / in models/<domain>.py}}
  migrations/            The single migration branch
  context/               Who is acting, from where: the per-call context
  <domain>/              {{domains}}
tests/                   Backend tests
docs/                    Product, architecture, conventions, decision records
```

## Modules

The core is one package; its domains are plain sub-packages ([ADR 0001](../adr/0001-{{slug}}.md)).

| Domain       | Responsibility | Status      |
| ------------ | -------------- | ----------- |
| `{{domain}}` | {{One line}}   | Implemented |

## Dependency rules

1. {{Optional modules depend on the core; the core never imports them. Enforced by a lint rule.}} **Implemented.**
2. HTTP lives in `{{pkg}}/api/`; domain packages never import the web framework.
3. Between domains, dependencies point one way. `tests/test_architecture.py` fails on an edge not drawn here:

```mermaid
flowchart TB
  api --> {{domain_a}} & {{domain_b}}
  {{domain_a}} --> {{domain_b}}
```

{{Which modules every domain may use: models, context, audit.}}

## Runtime composition

1. {{Entry point and module loading.}}
2. {{Startup validation.}}
3. {{Middleware, outermost first.}}
4. {{How exceptions become responses.}}
5. {{CLI commands and workers.}}

## Extension points

- {{What can be added without touching the core, and the ADR that set it.}}

## Key flows

| Flow     | Outline                                            | Status      |
| -------- | -------------------------------------------------- | ----------- |
| {{Flow}} | {{One line}} ([guide](../developer/{{module}}.md)) | Implemented |

## Data

- Tables live {{in each domain's `models.py` / in `{{pkg}}/models/`}} ([ADR NNNN](../adr/)); the `{{pkg}}.models` registry imports every one, so there is one migration branch.
- {{Time rule, with its ADR.}}
- {{Versioning rule, with its ADR.}}

## Configuration

| Layer          | Holds                     | Lives in                     | Changed by                |
| -------------- | ------------------------- | ---------------------------- | ------------------------- |
| Settings       | Deployment facts, secrets | Environment (`{{PREFIX}}_*`) | Operators, with a restart |
| Runtime config | {{Policy, if any}}        | {{Table}}                    | Administrators, live      |

## Deployment and state

{{What runs where; what each store holds; what losing it costs.}}

## Open questions

- {{Undecided structure.}}
