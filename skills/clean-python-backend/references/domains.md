# Domains and their boundaries

The core is one package with one migration branch; its domains are plain sub-packages. Boundaries are a convention plus a test, which is cheaper than one deployable unit per domain and stricter than nothing.

## Finding the domains

Draw a line between two concerns when any of these holds:

- They **change at different rates** or for different stakeholders (the organisation tree versus the sign-in methods).
- They **fail differently** (a directory sync times out; a password check must answer in milliseconds).
- They are **enabled independently** (Feishu login without Feishu sync).
- One is a **policy over the other** (who may reach an application is `access`; what an application is, is `application`).

Keep them together when every change touches both. A domain per table is too fine; a domain per team is usually too coarse.

Typical shapes, as an example of granularity:

| Domain           | Holds                                                        |
| ---------------- | ------------------------------------------------------------ |
| `directory`      | Who exists: users, organization units, memberships, roles    |
| `identity`       | How they prove it: passwords, MFA, sessions, external logins |
| `application`    | What an application is: registration, credentials, settings  |
| `access`         | Who may reach which application                              |
| `audit`          | Append-only security records                                 |
| `context`        | Who is acting in the current call, from where                |
| `runtime_config` | Policy administrators edit while the system runs             |

## Dependency direction

- Draw the allowed edges in `docs/architecture/overview.md` as a mermaid graph, and list them in `tests/test_architecture.py` (`references/testing.md`). The test is the enforcement; the graph is the explanation. Change both in the same pull request.
- A few modules sit below every domain and may be imported by all: `models`, `context`, `audit`, `utils`, `exc`, `settings`. Keep that list short; each entry must depend on no domain.
- `api` sits above every domain and nothing imports it.
- When a new edge would close a cycle, one of three things is true: the shared piece belongs in a lower module, the call should be a signal, or the two domains are one.

## Reading another domain

Call its read functions; never `select()` its models.

```python
# application/service.py: counts for the admin list
from {{pkg}}.access import service as access

assigned = access.assignment_counts(application_ids)  # access owns its tables and their rules
```

Selecting `AccessUserAssignment` directly would skip whatever `access` adds later (a soft delete, a scope rule) and couples the two schemas. When a page needs data from many domains, the route calls each domain's function and assembles the response entity; if that assembly grows rules, it becomes a function of the domain the page is about.

Sharing a foreign key is fine: `access_assignment.user_id` references `user.id`. Loading through it across domains is not.

## Changing another domain

- **The caller needs the result, or must fail if it fails**: call the other domain's service function.
- **The other domain reacts to a fact**, and the sender must not know who listens: send a named signal inside the writing transaction; the receiver does its writes in the same transaction, and raising rolls back both.

```python
# directory/service.py
user_deactivated = NamedSignal("directory.user_deactivated")  # user_id, reason

# at startup: bedrock-py's bootstrap.py, or the FastAPI lifespan
directory.user_deactivated.connect(sessions.end_all_for_user)
```

Connect receivers at startup, so the sender's module never imports the receiver.

## Authorization

Permission checks that many domains need ("may this actor administer applications?") live in a module below the domains, such as `authz`, taking the action and the target and reading the actor from the call context. A domain-specific rule (only the Owner may demote an administrator) stays in its domain but calls the shared check first.

Refusals are audited where they are decided, then raised as the domain's `Forbidden`.

## When a domain grows

Split by sub-responsibility, not by layer, once a file passes ~400 lines or holds more than one aggregate:

```
identity/
  __init__.py      "Sign-in, credentials, and sessions. Usage: docs/developer/identity.md."
  signin.py        The sign-in pipeline
  accounts.py      Account lifecycle across credentials
  sessions.py      Session storage, devices, revocation
  passwords.py     Hashing, policy, lockout
  mfa.py           TOTP and recovery codes
  passkeys.py      WebAuthn
  exc.py           IdentityError and subclasses
  policies.py      Runtime config sections the domain owns
```

Never split into `services/`, `repositories/`, `schemas/` sub-packages: a reader looking for "how sessions end" opens `sessions.py`, not three folders.

A file that other domains import keeps its name as the public entry (`service.py` or the topic file); sibling files import each other freely within the domain.

## Optional modules (plugins)

An integration enabled per deployment lives in `plugins/<name>/`, depends on the core, and is enabled by a setting. The core never imports `plugins`: ruff's `TID251` bans it.

```toml
[tool.ruff.lint.flake8-tidy-imports.banned-api]
"plugins".msg = "{{pkg}} must not import plugins; enable them through settings."

[tool.ruff.lint.per-file-ignores]
"plugins/**" = ["TID251"]
```

A plugin registers its provider types, policy sections, routes, and tasks from its own startup hook, reads its secrets from its own settings prefix, and imports only the core's public modules. Extension points are protocols or base classes defined in the core, with registries the plugin adds to; record each in an ADR.
