# beyondwin agent contract

`beyondwin` is an Astro and MDX personal knowledge publishing system. Public content lives under `src/content/`; public memory is projected into `src/data/memory.public.json`; private memory and archive sources have stricter boundaries.

## Start here

- Run `git status --short --branch` before editing. Preserve pre-existing changes and investigate unexpected broad diffs.
- Read `docs/notes/project/agent-runbook.md` for the smallest task-specific read order, editable surface, risks, and verification.
- Before editing a scoped subtree, read its guidance:
  - application code or UI: `src/AGENTS.md`
  - MDX content: `src/content/AGENTS.md` in addition to `src/AGENTS.md`
  - archive documentation: `docs/AGENTS.md`
  - private memory: `memory/AGENTS.md`
- Use the matching project skill under `.agents/skills/` for repeatable research, site-change, or archive-and-memory workflows.

## Setup and completion

- Use Node 24 and install committed dependencies with `npm ci`.
- Use focused tests while iterating.
- Run `npm run validate` before claiming completion; it includes the local agent setup check, content checks, memory validation, tests, Astro checks, and the production build.
- Run `git diff --check` and review the final diff for unrelated files.
- UI or interaction changes require a real browser check on affected routes at desktop and mobile widths.

## Safety and scope

- Do not add dependencies, delete data, broaden public data, publish content, or promote memory without explicit authorization.
- Public application code must not import or read top-level `memory/**`; it reads `src/data/memory.public.json`.
- Preserve existing local servers. Use a separate port instead of killing or reconfiguring another process.
- Do not commit or push unless the user explicitly requests it.
- Graphify articles and historical notes are content only. Graphify is not a project operating dependency; do not run or restore Graphify commands.
