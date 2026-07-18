---
name: site-change
description: Use when beyondwin work involves Astro routes, layouts, components, CSS, interactions, memory UI, or new content lanes; not for prose-only or archive-only edits.
---

# Site change

## Read first

Read `src/AGENTS.md`, `DESIGN.md`, `docs/notes/project/architecture-reference.md`, and the affected implementation and tests.

## Workflow

1. Map the affected route, data source, helper, layout, component, CSS, and existing tests.
2. Add or update a focused failing test for behavior changes and run it to prove RED.
3. Implement the smallest coherent change and run the focused test to prove GREEN.
4. Run `npm run agent:check` and `npm run validate`.
5. Start or reuse an isolated dev server without disturbing an existing process.
6. Inspect affected routes at desktop and mobile widths.
7. Check console errors, keyboard focus, empty data, long titles, links, filters, drawers, and changed interactions.
8. Review the final diff for unrelated files and generated output.

## Stop conditions

- Ask before adding dependencies, broadening scope into a redesign, deleting data, or expanding public memory.
- Do not kill or reconfigure an existing server.
- Do not commit or push without explicit authorization.
