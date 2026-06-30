# Memory Retrieval Design

Date: 2026-06-30
Status: approved design
Scope: `/memory` retrieval and source navigation

## Context

`beyondwin` already has a private-first memory pipeline:

```text
memory/thoughts/*.md
memory/edges.jsonl
memory/sources.jsonl
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/lib/memoryData.ts
  -> src/pages/memory.astro
```

The public projection currently contains thoughts, topics, edges, and sources,
but the `/memory` page still behaves more like a static display than a retrieval
tool. The page has tabs and search, but the selected thought detail is fixed to
the first projected thought, source navigation is handled directly in the page,
and search/filter behavior is not shared consistently across the Workbench,
Library, and Sources views.

The product direction is already documented in the memory content itself:
public memory should prioritize search, topics, evidence, and relationships over
decorative graph views.

## Goal

Turn `/memory` into a small but useful retrieval surface for public thoughts.
A reader should be able to search a claim, narrow by topic or source, select a
thought, inspect its related evidence and relationships, and move to the
underlying public article when a route exists.

Success means:

- Thought selection updates the detail panel instead of showing a fixed pinned
  entry.
- Search and filters apply consistently across relevant memory views.
- Topic and source filters make it clear why a thought is visible.
- Source cards link to internal public routes when possible.
- Non-routeable sources degrade to readable, non-clickable rows instead of dead
  `#` links.
- Empty and no-results states are explicit.
- Tests cover the data helpers that make source routing and lookup behavior
  reliable.

## Non-Goals

This design does not change:

- the private memory source format,
- the public projection eligibility rules,
- the static Astro deployment model,
- the article/review/analysis content schemas,
- runtime persistence, APIs, databases, or client-side graph libraries.

Graph visualization can be revisited later. This iteration focuses on retrieval
actions that help the reader find claims and evidence.

## Architecture

Keep the existing projection pipeline. Add a small normalization layer in
`src/lib/memoryData.ts` so the Astro page does not own path parsing, lookups, or
relationship safety checks.

Expected helper responsibilities:

- Normalize loaded projection data with existing fallbacks.
- Build lookup maps for thoughts, topics, sources, and edges.
- Resolve public source hrefs:
  - `src/content/articles/<slug>.mdx` -> `/articles/<slug>/`
  - `src/content/analysis/<slug>.mdx` -> `/analysis/<slug>/`
  - `src/content/ideas/<slug>.mdx` -> `/ideas/<slug>/`
  - `src/content/reviews/<slug>.mdx` -> `/reviews/<slug>/`
  - `src/content/travel/<slug>.mdx` -> `/travel/<slug>/`
  - external `url` values remain direct links
  - repo docs or implementation files without public routes return no href
- Resolve source IDs referenced by thoughts into source records when available.
- Resolve edges only when both endpoints are known public thoughts or topics.

`src/pages/memory.astro` should prepare render-ready data, then leave only
lightweight interactivity to the client script: tab switching, search text,
active topic, active source, selected thought, and filter reset.

## UI Behavior

The existing `Workbench`, `Library`, and `Sources` tabs remain.

### Workbench

Workbench is the default exploration surface.

- Left: topic filter list.
- Center: filtered thought rows.
- Right: selected thought detail.

Clicking a thought sets `selectedThoughtSlug`. The detail panel shows the claim,
body, memory type, topics, sources, and directly related relationships. If there
is no explicit selection, the first visible thought is selected. If no thought
matches the current filters, show a no-results state and a reset action.

### Library

Library groups thoughts by topic. It uses the same query, topic, and source
filters as Workbench. A thought card click updates the selected thought state so
returning to Workbench preserves the selection.

Empty topic groups are hidden when filters are active. If every group is empty,
show the shared no-results state.

### Sources

Sources starts from evidence instead of claims.

- Source cards show source kind, title, linked thought count, and route status.
- Routeable public content and external URLs are clickable.
- Non-routeable repo files render as static source rows with their path visible.
- Selecting a source applies `activeSourceId`, narrowing the visible thoughts.

The relationships block prioritizes relationships for the selected thought. If
there is no selected thought, it can show the strongest non-topic relationships
as a fallback.

## State Model

Client-side state should stay small:

- `query`: normalized search string.
- `selectedThoughtSlug`: current selected thought.
- `activeTopic`: selected topic label or slug.
- `activeSourceId`: selected source id.

Derived state should not be stored separately. Visible thoughts, visible topics,
visible sources, no-results state, and selected relationship lists can be derived
from projection data plus these four state values.

## Error Handling

The page must render safely when projection data is incomplete or empty.

- Empty projection: show the existing empty state.
- No search/filter results: show a no-results state with a filter reset action.
- Missing source record for a thought source id: show an unresolved source label
  in the detail panel and cover it with a helper test.
- Non-routeable source path: render text, not a dead link.
- Unknown edge endpoint: omit from the rendered relationship list.
- Invalid or missing generated date: show the existing unavailable message.

## Tests

Add focused tests where behavior is easiest to verify without browser
automation.

Primary target:

- `src/lib/memoryData.test.mjs`

Coverage:

- source href resolution for every public content collection,
- external URL passthrough,
- non-routeable repo path fallback,
- lookup construction for thoughts, topics, sources, and edges,
- unresolved thought source IDs,
- edge filtering for unknown endpoints.

Optional target if implementation touches projection shape:

- `scripts/memory.project.test.mjs`

Coverage:

- source IDs and source paths remain stable enough for UI lookup and routing.

Final verification:

```bash
npm run validate
graphify update .
git diff --check
```

Run `graphify update .` after implementation because code files will change.

## Acceptance Criteria

- `/memory` still builds as a static Astro page.
- Selecting a thought changes the detail panel.
- Query, topic, and source filters produce consistent visible thought sets.
- Source cards never emit dead `#` links.
- Internal content sources route to the correct public collection path.
- No-results and empty states are visible and understandable.
- Existing memory projection validation still passes.
- New helper tests cover source routing and relationship safety.

## Future Work

Possible later iterations:

- Add URL hash state for shareable topic, source, or thought selections.
- Add lightweight keyboard navigation for thought rows.
- Add visual relationship layout after retrieval behavior proves useful.
- Use Graphify as an authoring aid for new public memory seeds, while keeping
  curated memory files as the public source of truth.
