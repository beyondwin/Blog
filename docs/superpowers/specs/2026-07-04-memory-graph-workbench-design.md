# Memory Graph Workbench Design

## Status

Approved design on 2026-07-04.

## Context

`beyondwin` already has a private-first public memory pipeline:

```text
memory/thoughts/*.md
memory/edges.jsonl
memory/sources.jsonl
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/lib/memoryData.ts
  -> src/pages/memory.astro
```

The current `/memory/` page is a useful retrieval surface: it reads only
`src/data/memory.public.json`, supports search, topic/source filtering, selected
thought details, relationship labels, and source routing. It does not yet feel
like a high-quality second-brain product. It is still mostly a structured page
with cards and lists.

The reference quality target is a graph-first second-brain app: a dedicated
memory workspace with a filter rail, lens controls, node/edge type filters,
graph layout controls, clickable nodes, and a detail panel. The goal is not to
copy its visual system one-for-one. The goal is to reach the same product
quality bar while keeping `beyondwin`'s quiet paper journal design, static Astro
deployment, and public/private memory boundary.

Current public memory data is still small. At the time of this design the
projection contains 7 thoughts, 12 topics, 25 edges, and 7 sources. The first
implementation must therefore work well for a small graph and avoid pretending
that the corpus is denser than it is.

## Goal

Turn `/memory/` into a graph-first workbench for exploring public thoughts,
topics, sources, and relationships.

Success means:

- The first screen of `/memory/` feels like an intentional second-brain app, not
  a generic content page.
- Readers can search, filter, switch lenses, and select graph nodes without
  losing the public thought detail context.
- The graph shows thought, topic, and source relationships from the public
  projection.
- Selecting a node updates a clear detail drawer with claim, body, type, topics,
  relationships, and evidence sources.
- The page still reads only `src/data/memory.public.json`; it never imports
  `memory/**` from a public route.
- Empty, partial, or low-density projection data degrades gracefully.
- The implementation remains static and verifiable with the existing validation
  stack.

## Non-Goals

This iteration does not add:

- login or account state,
- "Ask Second Brain" chat,
- RAG, LLM calls, embeddings, or citation generation,
- database-backed memory,
- admin analytics or ask logs,
- live editing or public memory authoring UI,
- full 3D physics,
- changes to the private thought file contract,
- changes to public projection eligibility rules.

Ask/RAG/Auth should be a later project because it changes runtime architecture,
privacy risk, cost controls, rate limiting, and answer verification.

## Product Direction

The page should behave like a workspace:

```text
left rail: search, counts, lenses, topic/source/type filters
center: graph canvas with layout controls
right drawer: selected node detail and evidence
secondary: compact list/library/source views for fallback and accessibility
```

The left rail is for narrowing the graph. The center graph is the primary
exploration surface. The right drawer is the reading surface for the selected
node. This preserves the current retrieval value but makes spatial relationships
the first visual signal.

The design remains native to `beyondwin`:

- white background,
- black/graphite text,
- thin hairlines,
- restrained cyan-blue signal accent,
- no purple-blue gradients,
- no decorative blobs,
- no glass panel look,
- no oversized marketing hero.

## User Experience

### Entry

`/memory/` opens directly into the graph workbench. The current hero should be
reduced or folded into the left rail so the graph is visible in the first
viewport.

The rail shows:

- `Memory` / `Second Brain` title,
- thought/topic/edge/source counts,
- generated date,
- search input,
- lens controls,
- topic chips,
- source chips,
- memory type filters,
- edge type filters.

### Graph

The center stage renders a deterministic 2D graph from the public projection.
The initial implementation can use SVG or plain positioned HTML elements. It
does not need a heavy graph library if the graph remains small.

Node types:

- `thought`: public memory thought,
- `topic`: projected topic,
- `source`: public or routeable evidence source.

Edge types:

- explicit thought-to-thought edges from `memory.edges`,
- derived thought-to-topic edges from topic membership,
- derived thought-to-source edges from source references.

Graph controls:

- `Brain`: balanced default layout,
- `Cluster`: group by topic/source/type,
- `Timeline`: arrange by source date when available,
- `Reset`: restore default viewport and filters,
- `Labels`: show/hide labels,
- `Density`: compact/normal/wide spacing.

The first implementation may implement all controls with deterministic
precomputed positions and class toggles. It does not need continuous physics.

### Lenses

Lenses change which relationships are emphasized:

- `All`: show public thoughts, topics, sources, and main relationships.
- `Topics`: emphasize thought-topic clusters.
- `Sources`: emphasize source evidence and routeable content.
- `Theses`: emphasize thesis/topic structure where available.
- `External vs Mine`: emphasize origin/source distinction from public fields.

The lens state should not mutate the underlying projection. It only changes the
visible node set, edge set, labels, and counts.

### Detail Drawer

Clicking a graph node updates the right drawer.

For thought nodes, the drawer shows:

- Korean claim,
- English claim,
- body,
- memory type,
- origin,
- topics,
- theses when present,
- connected relationships,
- source links or static source rows.

For topic nodes, the drawer shows:

- topic label,
- thought count,
- connected thought list,
- prominent source distribution when available.

For source nodes, the drawer shows:

- source kind,
- title,
- path or URL,
- route status,
- linked thought count,
- linked thought list.

### Secondary Views

The current `Workbench`, `Library`, and `Sources` ideas should not disappear;
they should become secondary tabs or sections below/alongside the graph.

They serve three purposes:

- accessibility for users who do not want to navigate a graph,
- mobile fallback when the graph has limited room,
- precise list browsing for low-density or no-results states.

## Architecture

Keep the current projection pipeline. Add a graph view-model layer in
`src/lib/memoryData.ts` so `src/pages/memory.astro` does not own graph
normalization rules.

Expected data flow:

```text
src/data/memory.public.json
  -> loadPublicMemoryData()
  -> normalizeMemoryData()
  -> buildMemoryLookup()
  -> buildMemoryGraphModel()
  -> src/pages/memory.astro payload
  -> browser-side graph state and rendering
```

### File Responsibilities

| File | Responsibility |
| --- | --- |
| `src/lib/memoryData.ts` | Normalize memory data, resolve source hrefs, build lookups, derive graph nodes/edges/facets/layout metadata. |
| `src/lib/memoryData.test.mjs` | Verify graph model construction, safety fallbacks, source routing, filters, and low-data behavior. |
| `src/pages/memory.astro` | Render the static page shell, graph payload, rail, graph stage, detail drawer, and fallback views. |
| `src/styles/global.css` | Own visual styling for graph workbench, filters, nodes, edges, selected states, drawer, mobile fallback. |
| `scripts/memory/project.mjs` | Remains the projection writer. Only change it if the graph model exposes a missing public field that cannot be derived safely. |

## Graph View Model

Add a derived model shaped around rendering and interaction, not around private
memory files.

Add exported interfaces with these names unless the implementation plan records
a deliberate rename before code is written:

```ts
interface MemoryGraphModel {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  facets: MemoryGraphFacets;
  selectedFallback: string | null;
}

interface MemoryGraphNode {
  id: string;
  kind: 'thought' | 'topic' | 'source';
  label: string;
  sublabel?: string;
  weight: number;
  memoryType?: string;
  origin?: string;
  topicIds: string[];
  sourceIds: string[];
  href?: string | null;
  routeable?: boolean;
  date?: string;
  position: { x: number; y: number };
}

interface MemoryGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
  derived: boolean;
}

interface MemoryGraphFacets {
  lenses: Array<{ id: string; label: string; count: number }>;
  topics: Array<{ id: string; label: string; count: number }>;
  sources: Array<{ id: string; label: string; count: number; routeable: boolean }>;
  memoryTypes: Array<{ id: string; label: string; count: number }>;
  edgeTypes: Array<{ id: string; label: string; count: number }>;
}
```

The model should expose render-safe values only. It may expose public source
paths already present in `memory.public.json`, but it must not expose or read
private memory files.

## Client State

Client-side state should stay small:

- `query`,
- `activeLens`,
- `activeTopicIds`,
- `activeSourceIds`,
- `activeMemoryTypes`,
- `activeEdgeTypes`,
- `selectedNodeId`,
- `layoutMode`,
- `showLabels`,
- `density`.

Derived state should not be stored separately. Visible nodes, visible edges,
empty states, drawer content, and counts should be derived from the graph model
and the current state.

The implementation should avoid a large framework. Plain browser JavaScript is
consistent with the existing page and sufficient for this feature.

## Layout Strategy

The first implementation should use deterministic layout, not a complex physics
simulation.

Implementation rules:

- Thought nodes use existing stable positions when available.
- Topic nodes sit around the thought cluster based on topic order and count.
- Source nodes sit near linked thoughts or in a source band.
- `Cluster` mode groups thought nodes by the dominant topic.
- `Timeline` mode uses source dates when available and falls back to projection
  order.
- Density adjusts spacing multipliers, not font sizes.

This is enough for the current small graph and keeps the system predictable.
If public memory grows substantially, the same graph model can later drive a
force-directed layout library.

## Error Handling

The page must not fail when projection data is incomplete.

- Empty projection: show a calm empty state and keep navigation intact.
- No visible graph results: show a shared no-results state with reset.
- Unknown edge endpoint: omit that edge from the graph model.
- Missing source record: keep the thought visible and show unresolved source
  metadata in the drawer.
- Non-routeable source path: render static source text, not a dead link.
- Invalid or missing source date: omit timeline placement for that source and
  use projection order fallback.
- Large labels: wrap or truncate labels so nodes and drawer content do not
  overflow on mobile.
- Reduced motion: avoid motion-dependent comprehension and respect
  `prefers-reduced-motion`.

## Accessibility

The graph cannot be the only navigation path.

Requirements:

- Search and filters must be keyboard reachable.
- Graph nodes should be buttons or focusable elements with accessible labels.
- Detail drawer updates should be visible in normal document flow on mobile.
- Secondary list/library/source views must remain available for keyboard and
  small-screen users.
- Focus states must be visible.
- Text must not overlap graph controls or drawer content at desktop or mobile
  widths.

## Tests

Add focused tests to `src/lib/memoryData.test.mjs`.

Coverage:

- graph model includes thought, topic, and source nodes,
- explicit and derived edges are created with stable ids,
- unknown edge endpoints are excluded,
- source href resolution is preserved,
- routeable and non-routeable source facets are counted,
- memory type and edge type facets are counted,
- selected fallback is stable,
- empty memory returns an empty graph model,
- missing source records do not remove public thoughts,
- layout positions are bounded and stable,
- filter and lens visibility behavior for the graph model.

Browser smoke checks cover:

- desktop graph renders non-empty,
- mobile fallback remains usable,
- selecting a thought updates the drawer,
- filtering to no results shows reset,
- source links never point to `#`.

## Verification

Minimum implementation verification:

```bash
npm run test
npm run validate
graphify update .
git diff --check
```

Because code files will change, `graphify update .` is required. `graphify-out/`
is ignored in this repo, so freshness is command evidence rather than a tracked
artifact.

Visual verification should include at least:

- desktop `/memory/` first viewport,
- mobile `/memory/` first viewport,
- selected thought drawer,
- topic/source filter state,
- no-results state.

## Acceptance Criteria

- `/memory/` opens with a graph-first workbench layout.
- The graph renders thought, topic, and source nodes from
  `src/data/memory.public.json`.
- Lens, search, topic, source, memory type, and edge type controls update the
  visible graph or its emphasis.
- Clicking a node updates a right-side or mobile detail drawer.
- Source links route to public content when possible and render static rows
  otherwise.
- Secondary list/library/source browsing remains available.
- The public route does not import or parse `memory/**`.
- Empty and no-results states are explicit and recoverable.
- Unit tests cover the graph model and safety fallbacks.
- `npm run validate`, `graphify update .`, and `git diff --check` pass after
  implementation.

## Future Work

Later iterations can add:

- URL hash state for shareable selected nodes or filters,
- richer memory curation reports for expanding the public corpus,
- a force-directed graph library if data volume justifies it,
- 3D graph exploration,
- Ask/RAG with login, citations, rate limits, and admin review,
- authoring workflow improvements for promoting more public thoughts.
