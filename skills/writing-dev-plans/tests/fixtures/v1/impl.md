# Demo · Implementation

- Status: in-progress
- Date: 2026-11-10

## Contracts

```js
const example = "{{x}}";
### T9: in code [todo]
```
<!-- A multiline comment
### T8: hidden [todo]
-->

## Milestones

### M1: First milestone

- Tasks: T1, T2
- Verify: `node --test` → pass

## Tasks

### T1: First task [done]

- Depends on: none
- Files: `first.mjs` (create)
- [x] Finish the first task.
- Verify: `node --test` → pass

### T2: Second task [doing]

- Depends on: T1
- Files: `second.mjs` (create)
- [ ] Finish the second task.
- Verify: `node --test` → pass

### T3: Third task [blocked: waiting for API key]

- Depends on: T1, T2
- Files: `third.mjs` (create)
- [ ] Finish the third task.
- Verify: `node --test` → pass

## Progress Log

2026-11-10 10:00 · T1 done · completed
- 2026-11-10 10:01 · T2 needs-user · decision needed
2026-11-10 10:02 · change · clarified scope
