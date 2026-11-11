# Writing CONTEXT.md

The canonical vocabulary for code, docs, and discussion. It defines terms only; how things are built lives in `docs/`. Template: `assets/templates/CONTEXT.template.md`.

## Shape

```markdown
# {{Project}}

One paragraph: what the system is for. This glossary is the canonical vocabulary for code, docs, and discussion.
It defines terms only; how things are built lives in [docs/](docs/).

## Language

### People and organisation

**Organization unit**:
A node in the company's organisation tree, such as a department.
_Avoid_: org unit, department, OU, group

**Membership**:
A user's placement in an organization unit.
```

Group terms by how people think about the domain (Product; People and organisation; Sign-in; Operations), not by the code layout.

## Rules

- **Define what it is and how it differs from its neighbours**, in one or two sentences. Say what it is not when people confuse the two: "Holding a role is not the same as having access."
- **`_Avoid_` lists words people actually say**: the vendor's term, the legacy term, another product's name for it. When an avoided word is itself a term, say so: `_Avoid_: group (an Avoid term of Organization unit)`.
- **Name by what people do or see**, not by the data behind it: an MFA method is `email` or `sms` (how the user verifies), never `phone` (what is stored).
- **One word, one meaning.** Two words for one thing: pick one, avoid the other. One word for two things: split it into two terms.
- **Code uses the term**: `organization_unit`, never `org_unit` or `dept`; identifiers, routes, tables, error codes, and UI copy alike.
- **The term comes first.** Add or rename it in `CONTEXT.md` before code uses it. A rename renames the code in the same change; a shipped API that keeps the old name gets a sentence in the entry.
- **Operational vocabulary belongs here too**: settings versus runtime config, audit record versus log, scheduled job versus task run.

## Finding the terms

1. Collect the nouns from the product discussion, the requirements, and existing code.
2. For each, ask: if an engineer named a table, a class, or a route after it, would a user recognise it?
3. Where two words describe one thing or one word describes two, settle it now; the first table to be named settles it otherwise.

## Policing

Search the code and docs for each avoided word after a rename, and in review:

```bash
rg -n -i -w 'org unit|org_unit|department' --glob '!CONTEXT.md'
```

A hit is either a bug or an entry that needs a sentence explaining why the word is legitimate there.
