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

   Use `--init impl` for `impl.md`. Initialization writes a starting file: the manifest slot, the list of selectors that must be covered, the path of `assets/visual-sample.html`, and the generated block (shared kit and cited source). It requires the source and refuses to overwrite an existing visual file.
2. Dispatch a subagent in `full` mode using the prompt in `references/visual-guide.md`, with absolute paths to the guide, the reference sample, the corresponding Markdown, and the initialized HTML. The subagent designs the page and cites the Markdown with `data-src` selectors; it never copies source text. Review the result with the guide's "Review checklist" (completeness section by section, working interaction, look); coverage alone cannot prove that the summary layer stayed faithful.
3. Stamp only after review:

   ```bash
   node <skill-dir>/scripts/visual-status.mjs <plan-dir> --stamp plan
   node <skill-dir>/scripts/visual-status.mjs <plan-dir>
   ```

   Use `--stamp impl` for the implementation visual. Stamping fills the generated block: it inlines the current kit and stores the Markdown each `data-src` selector picks. It fails, and writes nothing, if a requested visual leaves source lines uncovered, has a selector that matches nothing or is ambiguous, has a duplicated kit block, or lacks its source or manifest. Never write hashes manually. Resolve errors and ensure the status command exits 0 before presenting the document.
4. Open the Visual tab with the viewer command above. The HTML can also be opened directly as a file.

## Synchronize Existing Visuals

Before presenting each gate, after a confirmed Changing Course, and when resuming in a new session, run:

```bash
node <skill-dir>/scripts/lint-plan.mjs <plan-dir>
node <skill-dir>/scripts/visual-status.mjs <plan-dir>
```

Clear lint errors. The lint command checks only that directory; `--as <N>` checks it as a particular format and `--json` outputs issues as JSON. A lint error exits 1; invalid usage exits 2. If Node is unavailable, disclose that and fall back to manual format checks; do not claim visual freshness without the status check.

For each visual when status exits 1, dispatch the `visual-guide.md` prompt in `sync` mode with its changed, added, and removed sections (listed as selectors). Have the subagent change only the summary elements for those sections; the cited source follows the Markdown on the next stamp. Resolve uncovered lines, broken selectors, and missing source or manifest errors as needed. Review fidelity, then run `--stamp plan` or `--stamp impl` for the updated visual and run the unqualified status command again. Repeat until it exits 0 before presenting a gate. `--stamp` alone targets all existing visuals; `--json` provides machine-readable status (`kit` reports `ok`, `linked`, `outdated`, `missing`, or `duplicate`; `--stamp` restores the kit). Tracking-only status, checkbox, and progress-log changes do not make a visual stale.
