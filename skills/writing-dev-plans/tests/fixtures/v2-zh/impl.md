---
skill: writing-dev-plans
format: 2
---
# Demo · Implementation

- Status: in-progress
- Execution: inline
- Date: 2026-11-10

## 契约

```js
const example = "{{x}}";
### T9: in code [todo]
```
<!-- A multiline comment
### T8: hidden [todo]
-->

## 里程碑

### M1: First milestone

- Tasks: T1, T2
- Verify: `node --test` → pass

## 任务

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

## 进度日志

2026-11-10 10:00 · T1 done · completed
- 2026-11-10 10:01 · T2 needs-user · decision needed
2026-11-10 10:02 · change · clarified scope
