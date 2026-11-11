# Developer guides and conventions

Two kinds of documents for people writing code: conventions say how all code is written; developer guides say how to use one shared module. Templates: `assets/templates/docs/developer/`.

## Which is which

| Question                                               | Document                       |
| ------------------------------------------------------ | ------------------------------ |
| Where does this kind of code go? How is it named?      | `docs/conventions/<area>.md`   |
| How do I call the runtime config / audit / events API? | `docs/developer/<module>.md`   |
| Why is it built this way?                              | `docs/adr/`                    |
| What must the product do?                              | `docs/product/requirements.md` |

`docs/developer/README.md` states this split at its top ("Here" / "Not here"), so a reader who lands there is sent on.

## Developer guides

A module gets a guide when other domains or plugins call it: runtime config, audit, call context, events, a domain whose service others use. One file per module, named after it (`runtime_config` → `runtime-config.md`), listed in the index table.

Six sections, in order:

1. **What it is for**: one paragraph, plus when not to use it and what to use instead.
2. **Quick start**: the smallest working example, imports included, copyable.
3. **API**: every public function, class, signal, and exception; a table `Function | Returns | Raises` reads fastest. Name the exceptions callers must handle.
4. **Recipes**: the common tasks as copyable code, each titled by the task ("Edit a section across an HTTP round trip").
5. **Pitfalls**: what goes wrong silently. This section is the reason guides exist.
6. **Testing**: how to exercise code that uses the module, with the fixtures to use.

### Finding the pitfalls

Ask, for the module:

- What can a caller do that raises nothing and is wrong? (Renaming a field drops its stored value; a section whose module is never imported is never registered.)
- What is cached, and for how long can it be stale?
- What happens inside the caller's transaction, and what outside it?
- What does tightening validation do to data already stored?
- What must never be stored here (secrets)?

Each pitfall is one bullet: the bold symptom, then the fix.

### The chain into a guide

- The module's `__init__.py` docstring ends with `Usage: docs/developer/<module>.md.`; its main service module repeats it.
- The index table in `docs/developer/README.md` lists the module.
- Changing a shared module's public API updates its guide in the same pull request; the pull request template asks.

## Conventions documents

One per area (`backend.md`, `frontend.md`). Open with the role sentence and pointers to the architecture overview, the ADRs, and `CONTEXT.md`. Then:

1. **Where code goes**: table `What | Where`. Close with "Create a file only when it has content."
2. **One section per concern**: layers, services, exceptions, models and migrations, configuration, events, plugins, style, typing, docstrings, testing.
3. **Each rule names what enforces it** (a ruff rule, a test, review) and links the ADR behind it. A rule enforced by nothing but review says so; one a tool could check is a candidate for the tool.
4. **Bold the rule, then the reason**: `**Services commit.** … so a forgotten commit is a silently lost write.`
5. **Examples are real code from the repository**, short, and current.

A rule only takes effect once it is written here. Agents and reviewers cite it by section anchor.
