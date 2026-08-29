---
name: site-change
description: Use when beyondwin work involves React Router routes, loaders, components, CSS, interactions, memory UI, static delivery, or new content lanes; not for prose-only or archive-only edits.
---

# Site change

## Read first

Read `src/AGENTS.md`, `DESIGN.md`, `docs/notes/project/architecture-reference.md`, and the affected implementation and tests.

## Workflow

1. Map the affected `apps/site` route/loader, immutable release data, component, CSS, and existing unit/E2E tests.
2. Add or update a focused failing test for behavior changes and run it to prove RED.
3. Implement the smallest coherent change and run the focused test to prove GREEN.
4. Run `npm run agent:check` and `npm run validate`; never bypass release build/verify for a public route change.
5. Start or reuse an isolated dev server without disturbing an existing process.
6. Inspect affected routes at desktop and mobile widths.
7. Check console errors, keyboard focus, empty data, long titles, links, filters, menu containment/restore, no-JS anchors/forms, image failure, and changed interactions.
8. Review the final diff for unrelated files and generated output.

## Stop conditions

- Ask before adding dependencies, broadening scope into a redesign, deleting data, or expanding public memory.
- Do not kill or reconfigure an existing server.
- Do not invent `FORM_THOUGHT_SITE_ORIGIN`; use local build mode unless a production HTTPS origin is explicitly approved.
- Do not commit or push without explicit authorization.
