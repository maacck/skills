# Plan Viewer

Use this guide as the orchestrator. The viewer is optional; Markdown remains the source of truth. Run commands from the target repository root, with `<skill-dir>` pointing to this skill and `<plan-dir>` to the single directory under `.plans/`.

## Ask Once at Each Point

1. When presenting the first `plan.md` draft, ask: “Generate visual HTML and view it in the browser?” If the conversation shortcut has no `plan.md`, ask when the first `impl.md` draft is ready instead. On acceptance, generate the corresponding visual document and open the Visual tab. If a plan visual was accepted, automatically generate visual-impl when the first impl draft is ready; do not ask again. Visual-impl is a snapshot of the implementation plan, not live progress.
2. Before execution, ask: “Open the progress page?” On acceptance, start or reuse the server and open the Progress tab.

Ask each question only once per session, including after a refusal. The user can request the viewer or visual generation at any time.

## Start or Reuse the Viewer

```bash
node <skill-dir>/scripts/plan-viewer.mjs --dir <plan-dir-name> --tab visual
node <skill-dir>/scripts/plan-viewer.mjs --dir <plan-dir-name> --tab progress
```

Use the directory name, not its path. The command starts or reuses the worktree's localhost server, opens the requested tab, and prints JSON containing `url`, `reused`, and `pid`. Omit `--dir` for the plan list; `--tab` also accepts `plan` or `impl`. Use `--no-open` to print the URL without opening a browser. `--port <port>` requests a port and `--idle-minutes <minutes>` changes the idle timeout (default 120). If the host reaps detached processes, run the same command with `--foreground` using the host's own background execution facility.

Before giving out a URL, confirm the instance in `.plans/.viewer.json` is alive: its PID must exist and `http://127.0.0.1:<port>/health` must return the same PID and repository root. Otherwise rerun the same viewer command; use the new URL it prints. The CLI performs this identity and health check when starting or reusing an instance.

## Generate a Visual

1. Initialize the desired source (`plan` or `impl`):

   ```bash
   node <skill-dir>/scripts/visual-status.mjs <plan-dir> --init plan
   ```

   Use `--init impl` for `impl.md`. Initialization writes a minimal file (manifest slot, required `data-src` list, path of `assets/visual-sample.html`); it requires the source and refuses to overwrite an existing visual file.
2. Dispatch a subagent in `full` mode using the prompt in `references/visual-guide.md`, with absolute paths to the guide, the reference sample, the corresponding Markdown, and the initialized HTML. The subagent designs the whole page; the Markdown is its only content source. Review the result with the guide's "Review checklist" (completeness section by section, fidelity of the detail views, working interaction, look); `data-src` coverage alone cannot prove that nothing inside a unit was dropped.
3. Stamp only after review:

   ```bash
   node <skill-dir>/scripts/visual-status.mjs <plan-dir> --stamp plan
   node <skill-dir>/scripts/visual-status.mjs <plan-dir>
   ```

   Use `--stamp impl` for the implementation visual. Stamping fails, and writes nothing, if any requested visual lacks `data-src` coverage or its source or manifest is missing. Never write hashes manually. Resolve errors and ensure the status command exits 0 before presenting the document.
4. Open the Visual tab with the viewer command above. The HTML can also be opened directly as a file.

## Synchronize Existing Visuals

Before presenting each gate, after a confirmed Changing Course, and when resuming in a new session, run:

```bash
node <skill-dir>/scripts/lint-plan.mjs <plan-dir>
node <skill-dir>/scripts/visual-status.mjs <plan-dir>
```

Clear lint errors. The lint command checks only that directory; `--as <N>` checks it as a particular format and `--json` outputs issues as JSON. A lint error exits 1; invalid usage exits 2. If Node is unavailable, disclose that and fall back to manual format checks; do not claim visual freshness without the status check.

For each visual when status exits 1, dispatch the `visual-guide.md` prompt in `sync` mode with its changed, added, and removed unit IDs. Have the subagent change only those units; resolve missing coverage and missing source or manifest errors as needed. Review fidelity, then run `--stamp plan` or `--stamp impl` for the updated visual and run the unqualified status command again. Repeat until it exits 0 before presenting a gate. `--stamp` alone targets all existing visuals; `--json` provides machine-readable status. Unknown `data-src` IDs are warnings and should be reviewed. Tracking-only status, checkbox, and progress-log changes do not make a visual stale.
