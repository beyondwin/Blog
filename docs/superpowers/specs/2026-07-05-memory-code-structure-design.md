# Memory Code Structure Design

Date: 2026-07-05
Status: approved design
Scope: code quality and AI-oriented structure for the public memory surface

## Context

`beyondwin` already has a useful agent runbook and project documentation layer.
The current weakness is lower than documentation: the `/memory` implementation
has grown into large files whose responsibilities are hard for an agent to edit
confidently.

The main hotspots are:

- `src/lib/memoryData.ts`, which owns public memory types, normalization,
  lookup maps, graph model derivation, filter state, URL helpers, and
  article-memory matching in one file.
- `src/pages/memory.astro`, which owns server-side page payload assembly,
  graph/list/source markup, selected-node detail data, and a long inline client
  interaction script.

The existing public/private boundary is correct and must stay intact:

```text
memory/thoughts/*.md
memory/edges.jsonl
memory/sources.jsonl
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> /memory and article memory links
```

Public routes must continue to read only the generated public projection, not
`memory/**` directly.

## Goal

Refactor the memory code structure so future agents can understand and modify it
by responsibility instead of reading two large mixed-purpose files.

Success means:

- The public behavior of `/memory` and article memory links stays the same.
- Existing exported helper names remain importable through a compatibility
  surface.
- Memory logic is split into small modules with clear ownership.
- The Astro page focuses on rendering the shell and embedding a serializable
  payload.
- Browser interaction logic moves out of the page body or is isolated behind a
  clearly named workbench module.
- Tests prove behavior did not drift during the split.

## Non-Goals

This design does not add:

- new public memory features,
- new private thought schema fields,
- new graph layout behavior,
- RAG, embeddings, chat, or runtime data access,
- a web-based memory editor,
- a visual redesign of `/memory`,
- changes to public projection eligibility.

This is a structure and maintainability project. Product behavior should remain
stable unless a small adjustment is required to preserve existing behavior after
the split.

## Recommended Approach

Use a middle-strength refactor:

1. Split the domain logic by responsibility.
2. Keep behavior and public helper names compatible.
3. Reduce duplicated filter and URL-state rules where practical.
4. Move page payload construction out of the Astro page.
5. Isolate the browser workbench script from server-side rendering code.

This gives better AI comprehension without the regression risk of a full
rewrite. A docs-only improvement would not reduce the real editing complexity,
and a strong UI/CSS restructuring would broaden the blast radius beyond the
current goal.

## Architecture

Target module structure:

```text
src/lib/memory/
  publicData.ts      # MemoryPublicData, empty fallback, normalize, load public JSON
  lookup.ts          # source href resolution and lookup maps
  graphModel.ts      # graph nodes, edges, facets, layout metadata
  filters.ts         # lens/filter matching and deep-link URL helpers
  articleLinks.ts    # article -> memory linked/related matching
  pagePayload.ts     # /memory detail drawer and serializable payload assembly
  index.ts           # public re-export surface

src/lib/memoryData.ts
  # temporary compatibility re-export for existing imports

src/scripts/memoryWorkbench.ts
  # preferred browser interaction module if Astro bundling is straightforward
```

If Astro bundling makes `src/scripts/memoryWorkbench.ts` unnecessarily risky,
the implementation may use `public/scripts/memory-workbench.js` instead. The
implementation plan must choose one path before code changes begin and explain
the trade-off.

## Module Responsibilities

### `publicData.ts`

Owns the public projection shape and safe fallback behavior:

- `MemoryPublicData`
- `MemoryThought`
- `MemoryTopic`
- `MemorySource`
- `MemoryEdge`
- `emptyMemoryData`
- `normalizeMemoryData()`
- `loadPublicMemoryData()`

It must not read `memory/**`.

### `lookup.ts`

Owns source resolution and lookup maps:

- routeable source prefixes,
- `resolveMemorySourceHref()`,
- `buildMemoryLookup()`,
- resolved and unresolved source reference types.

If a source route contract changes, this is the primary file to inspect.

### `graphModel.ts`

Owns graph derivation:

- node and edge types,
- graph facets,
- deterministic graph positions,
- explicit and derived graph edges,
- `buildMemoryGraphModel()`.

The page should not know how to derive graph semantics from raw public memory
records.

### `filters.ts`

Owns graph filtering and deep links:

- filter state types,
- lens application,
- query/topic/source/type/edge matching,
- `filterMemoryGraphModel()`,
- `createMemoryFilterHref()`,
- `createMemoryNodeHref()`,
- `parseMemoryDeepLinkParams()`.

The client script may still do DOM-level filtering, but it should follow the
same names and state contract as this module.

### `articleLinks.ts`

Owns article footer matching:

- `ArticleMemoryLink`
- `ArticleMemoryLinks`
- direct source-path matching,
- tag/topic fallback matching,
- result ordering and cap,
- `findArticleMemoryLinks()`.

Article matching should not be mixed into graph rendering logic.

### `pagePayload.ts`

Owns serializable `/memory` page data:

- selected-node fallback label helpers,
- relationship labels,
- thought/topic/source detail records,
- fallback relationship rows,
- graph edge coordinate helpers if they remain server-rendered,
- `buildMemoryPagePayload()`.

`src/pages/memory.astro` should call this module and render the returned data.

### `memoryWorkbench`

Owns browser behavior:

- DOM element binding,
- UI state mutation,
- URL state read/write,
- selected detail rendering,
- reset behavior,
- tab switching,
- layout, labels, and density toggles.

It should not own public memory projection rules or private-memory access.

## Data Flow

The intended flow after the refactor is:

```text
src/data/memory.public.json
  -> loadPublicMemoryData()
  -> normalizeMemoryData()
  -> buildMemoryLookup()
  -> buildMemoryGraphModel()
  -> buildMemoryPagePayload()
  -> src/pages/memory.astro
  -> memoryWorkbench client script
```

Article pages use the same public data source but call `findArticleMemoryLinks()`
from `articleLinks.ts`.

## Compatibility

The first implementation must keep `src/lib/memoryData.ts` as a compatibility
module that re-exports the existing public helper names, including:

- `normalizeMemoryData`
- `emptyMemoryData`
- `resolveMemorySourceHref`
- `buildMemoryLookup`
- `buildMemoryGraphModel`
- `filterMemoryGraphModel`
- `createMemoryFilterHref`
- `createMemoryNodeHref`
- `parseMemoryDeepLinkParams`
- `findArticleMemoryLinks`
- `loadPublicMemoryData`

Existing imports can then migrate gradually. Once all imports use
`src/lib/memory/index.ts` or specific memory modules, a separate cleanup task
can remove the compatibility file.

The URL contract must remain stable:

```text
/memory/?node=...
/memory/?topic=...
/memory/?source=...
/memory/?lens=...
/memory/?q=...
/memory/?type=...
/memory/?edge=...
```

Unknown or stale URL values must continue to be ignored rather than throwing.

## Safety Boundaries

The refactor must preserve these boundaries:

- Public routes never import or parse `memory/**`.
- The only public memory input is `src/data/memory.public.json`.
- Missing or partial public JSON normalizes to a safe empty shape.
- Non-routeable sources remain visible as static source rows with `href: null`.
- Edges with unknown endpoints are skipped.
- Deep-link parameters that do not exist in the current graph are ignored.
- The static HTML remains readable if the browser workbench script fails.

Error handling should stay quiet in the UI and strict in tests.

## Testing Strategy

Start by extracting the existing `src/lib/memoryData.test.mjs` fixture into a
shared test helper. Then split behavior checks by responsibility.

Target test layout:

```text
src/lib/memory/publicData.test.mjs
src/lib/memory/lookup.test.mjs
src/lib/memory/graphModel.test.mjs
src/lib/memory/filters.test.mjs
src/lib/memory/articleLinks.test.mjs
src/lib/memory/pagePayload.test.mjs
src/lib/memoryData.test.mjs
```

`src/lib/memoryData.test.mjs` may shrink to compatibility re-export coverage
after the focused tests are in place.

Required verification for the implementation:

```bash
npm run test -- src/lib/memory
npm run test -- src/lib/memoryData.test.mjs
npm run validate
git diff --check
graphify update .
```

Because code files will change, `graphify update .` is part of closeout.
`graphify-out/` remains generated navigation and should not be treated as the
authored source of truth.

Manual browser checks:

```text
/memory/
/memory/?node=thought:<existing-slug>
/memory/?lens=sources
an article page with memory footer links
```

The checks should confirm that selected nodes, filters, reset behavior, article
links, and fallback list/source views still work.

## Acceptance Criteria

The implementation is complete when:

- `src/lib/memoryData.ts` no longer owns all memory behavior directly.
- Memory domain logic is split under `src/lib/memory/` by responsibility.
- `src/pages/memory.astro` no longer assembles detail payloads or owns the full
  client state machine inline.
- Existing public helper imports remain compatible.
- `/memory` deep links keep their existing meaning.
- Article memory footer links keep pointing to exact memory node URLs.
- Empty projection and stale URL states degrade gracefully.
- Focused module tests and repo-level validation pass.
- Project docs that describe memory architecture are updated if file
  responsibilities or commands change.

## Documentation Updates

The implementation should update documentation only where the file
responsibilities or commands changed:

- `docs/notes/project/architecture-reference.md`
- `docs/notes/project/agent-runbook.md`
- `docs/implementation/memory-second-brain.md`

Archive index files are not required unless a new curated note is added under
`docs/notes/`.
