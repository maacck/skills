# Developer guides

How to use the project's shared modules: the ones any domain calls, such as {{examples}}. Written for developers and coding agents.

- **Here:** a module's public API, how to call it, worked examples, and the mistakes it does not catch for you.
- **Not here:** how to write code in general ([backend conventions](../conventions/backend.md)), why the module is built this way ([architecture](../architecture/overview.md), [ADRs](../adr/)), or what the product must do ([requirements](../product/requirements.md)).

Each module's `__init__.py` docstring says what the module is in one paragraph and points to its guide here. The guide is the only full description; when the public API changes, update the guide in the same pull request.

| Module          | Guide                       |
| --------------- | --------------------------- |
| `{{pkg}}.{{m}}` | [{{Module}}]({{module}}.md) |

## Writing a guide

One file per module, named after it (`runtime_config` → `runtime-config.md`), with these sections:

1. **What it is for**: one paragraph, plus when not to use it.
2. **Quick start**: the smallest working example, with imports.
3. **API**: every public function, class, and exception, with the exceptions callers must handle.
4. **Recipes**: the common tasks, as copyable code.
5. **Pitfalls**: what goes wrong silently.
6. **Testing**: how to exercise code that uses the module.

Start from [module-guide.md](module-guide.md).
