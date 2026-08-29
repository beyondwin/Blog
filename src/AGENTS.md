# Application code guidance

These rules apply under `src/`. `src/content/AGENTS.md` adds stricter rules for MDX content.

## Read first

- Read `DESIGN.md` and `docs/notes/project/architecture-reference.md` before changing routes, layouts, components, styles, or interactions.
- Inspect the existing target and adjacent implementation before introducing a new abstraction.

## Implementation

- Preserve the React Router route/loader and `apps/site/src/ui` CSS patterns already used by the affected surface.
- Add or update a focused failing test before behavior-changing implementation.
- Keep changes scoped; a new content lane must update `packages/content` source schema, `packages/contracts` public schema, release builders, routes, helpers, validation, navigation, and project docs together.
- Preserve the reading-first hierarchy, visible keyboard focus, responsive text, and restrained visual system.
- Public code reads only `src/data/memory.public.json`, never top-level `memory/**`.
- Public routes consume a verified immutable release through `apps/site/app/release.server.ts`; do not parse MDX, media manifests, or private source paths in UI components.

## Verification

- Run focused tests, then `npm run validate`.
- For visible or interactive changes, inspect affected routes in a real browser at desktop and mobile widths.
- Check console errors, keyboard focus, empty data, long titles, links, filters, drawers, and other changed interactions.
- Do not stop or reconfigure an existing server; use a separate port when needed.
