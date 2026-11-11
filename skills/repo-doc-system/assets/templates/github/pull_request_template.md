<!--
Title: Conventional Commits, like the commit messages, e.g. `feat(<scope>): <summary>`.
Delete any section or checklist line that does not apply.
-->

## What and why

<!-- What changes, and the reason. Link the issue: `Closes #123`. -->

## How it was verified

<!-- Commands run, scenarios exercised, and what you observed. CI checks alone are not enough for a behaviour change. -->

## Deploy notes

<!-- Anything the release needs beyond deploying the image: new or changed environment variables, migrations, runtime config to set, manual steps, breaking API changes. Write "None" if there is nothing. -->

## Checklist

CI runs lint, format, types, and tests. These it cannot check:

- [ ] Docs aligned in this pull request ([which docs a change moves](../CONTRIBUTING.md#which-docs-a-change-moves)): the documents updated are named above, or "Docs: none needed" with the reason.
- [ ] A hard-to-reverse decision made here has an ADR in `docs/adr/`.
- [ ] Every new migration was read by hand, and no migration already applied to a shared database was edited.
- [ ] A new environment variable is in every `.env.example`.
- [ ] A new dependency says why above.
- [ ] No secrets, tokens, or real personal data in code, tests, fixtures, or logs.
