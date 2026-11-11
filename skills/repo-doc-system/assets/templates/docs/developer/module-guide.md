# {{Module}}

## What it is for

{{One paragraph: what the module does and who calls it.}}

Use {{the alternative}} instead for {{the cases this module is not for}}.

## Quick start

```python
{{The smallest working example, imports included.}}
```

## API

### `{{pkg}}.{{module}}.service`

All functions use the caller's bound database session; functions that write commit their own work.

| Function       | Returns   | Raises          |
| -------------- | --------- | --------------- |
| `{{fn(args)}}` | {{Value}} | `{{Exception}}` |

### `{{pkg}}.{{module}}.exc`

`{{ModuleError}}` is the base; {{subclasses}} subclass it.

## Recipes

**{{A common task}}**:

```python
{{Copyable code.}}
```

## Pitfalls

- **{{What goes wrong without an error}}**: {{what to do instead}}.

## Testing

{{The fixtures to use and a short example test.}}
