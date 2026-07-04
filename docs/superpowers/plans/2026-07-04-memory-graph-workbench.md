# Memory Graph Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/memory/` into a graph-first workbench for exploring public thoughts, topics, sources, and relationships.

**Architecture:** Keep the existing private-first static projection pipeline and derive a render-safe `MemoryGraphModel` in `src/lib/memoryData.ts`. `src/pages/memory.astro` renders the graph workbench from that model, while the browser script owns only local UI state: query, lens, filters, selected node, layout, labels, and density.

**Tech Stack:** Astro, TypeScript, plain browser JavaScript, SVG/HTML graph rendering, Vitest, static `src/data/memory.public.json`, existing global CSS.

## Global Constraints

- Public routes read only `src/data/memory.public.json`; they never import or parse `memory/**`.
- Keep the static Astro deployment model.
- Do not add login, account state, Ask/RAG, LLM calls, embeddings, database-backed memory, admin analytics, live editing, or full 3D physics.
- Keep the private thought file contract and public projection eligibility rules unchanged.
- Use a deterministic 2D graph layout for the first implementation.
- Preserve secondary list/library/source browsing for accessibility and mobile fallback.
- Use the existing quiet `beyondwin` visual system: white background, black/graphite text, thin hairlines, restrained cyan-blue signal accent.
- Do not use purple-blue gradients, decorative blobs, glass panel styling, or oversized marketing hero treatment.
- Run `npm run test`, `npm run validate`, `graphify update .`, and `git diff --check` before completion.

---

## File Structure

- Modify `src/lib/memoryData.ts`
  - Adds exported graph model interfaces.
  - Builds graph nodes, explicit edges, derived topic/source edges, facets, and deterministic layout metadata from `MemoryPublicData`.
  - Keeps source routing, lookup, and article-memory helpers intact.
- Modify `src/lib/memoryData.test.mjs`
  - Adds graph model unit tests for nodes, edges, facets, selected fallback, missing sources, empty data, layout bounds, and filter/lens visibility.
- Modify `src/pages/memory.astro`
  - Replaces the hero-first memory page with a graph-first workbench.
  - Builds a public graph payload from `buildMemoryGraphModel(memory)`.
  - Keeps Library and Sources fallback panels.
  - Updates inline browser state from thought/source-only filtering to graph node filtering.
- Modify `src/styles/global.css`
  - Adds graph workbench layout, rail, graph stage, SVG edge, node, drawer, control, and mobile fallback styles.
  - Retires or overrides old memory layout rules where they conflict.
- Do not modify `scripts/memory/project.mjs`
  - The current projection already exposes enough public fields for the deterministic graph model.

---

### Task 1: Tested Graph Model Helpers

**Files:**
- Modify: `src/lib/memoryData.ts`
- Modify: `src/lib/memoryData.test.mjs`

**Interfaces:**
- Consumes:
  - `MemoryPublicData`
  - `MemoryThought`
  - `MemoryTopic`
  - `MemorySource`
  - `MemoryEdge`
  - `buildMemoryLookup(memory: MemoryPublicData): MemoryLookup`
  - `resolveMemorySourceHref(source: Pick<MemorySource, 'path' | 'url'>): string | null`
- Produces:
  - `type MemoryGraphNodeKind = 'thought' | 'topic' | 'source'`
  - `interface MemoryGraphNode`
  - `interface MemoryGraphEdge`
  - `interface MemoryGraphFacets`
  - `interface MemoryGraphModel`
  - `interface MemoryGraphFilterState`
  - `function buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel`
  - `function filterMemoryGraphModel(model: MemoryGraphModel, filters: MemoryGraphFilterState): { nodeIds: Set<string>; edgeIds: Set<string> }`

- [ ] **Step 1: Add failing graph model tests**

Add `buildMemoryGraphModel` and `filterMemoryGraphModel` to the import list at the top of `src/lib/memoryData.test.mjs`:

```js
import {
  buildMemoryGraphModel,
  buildMemoryLookup,
  emptyMemoryData,
  filterMemoryGraphModel,
  findArticleMemoryLinks,
  normalizeMemoryData,
  resolveMemorySourceHref,
} from './memoryData.ts';
```

Append these tests to the existing `describe('memory data helpers', () => { ... })` block:

```js
  it('builds a graph model with thought, topic, and source nodes', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.selectedFallback).toBe('thought:routing-problem');
    expect(graph.nodes.map((node) => [node.id, node.kind])).toEqual([
      ['thought:routing-problem', 'thought'],
      ['thought:review-gates', 'thought'],
      ['topic:ai-workflow', 'topic'],
      ['topic:agent-workflows', 'topic'],
      ['source:article-source', 'source'],
      ['source:docs-source', 'source'],
      ['source:external-source', 'source'],
    ]);
    expect(graph.nodes.find((node) => node.id === 'thought:routing-problem')).toMatchObject({
      label: '컨텍스트 품질은 라우팅 문제다.',
      sublabel: 'Context quality is a routing problem.',
      memoryType: 'semantic',
      origin: 'kws',
      topicIds: ['topic:ai-workflow'],
      sourceIds: ['source:article-source', 'source:missing-source'],
      weight: 2,
    });
    expect(graph.nodes.find((node) => node.id === 'source:article-source')).toMatchObject({
      label: 'Context Refinement System 설계 요약',
      kind: 'source',
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
  });

  it('builds explicit and derived graph edges with stable ids', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.edges).toEqual([
      expect.objectContaining({
        id: 'explicit:routing-problem:supports:review-gates',
        from: 'thought:routing-problem',
        to: 'thought:review-gates',
        type: 'supports',
        derived: false,
      }),
      expect.objectContaining({
        id: 'derived:thought-topic:routing-problem:topic-ai-workflow',
        from: 'thought:routing-problem',
        to: 'topic:ai-workflow',
        type: 'topic-tag',
        derived: true,
      }),
      expect.objectContaining({
        id: 'derived:thought-source:routing-problem:article-source',
        from: 'thought:routing-problem',
        to: 'source:article-source',
        type: 'source-link',
        derived: true,
      }),
    ]);
    expect(graph.edges.some((edge) => edge.to.includes('missing-thought'))).toBe(false);
    expect(graph.edges.some((edge) => edge.to === 'source:missing-source')).toBe(false);
  });

  it('counts graph facets for lenses, topics, sources, memory types, and edge types', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.facets.lenses).toEqual([
      { id: 'all', label: 'All', count: 7 },
      { id: 'topics', label: 'Topics', count: 2 },
      { id: 'sources', label: 'Sources', count: 3 },
      { id: 'theses', label: 'Theses', count: 1 },
      { id: 'external-vs-mine', label: 'External vs Mine', count: 2 },
    ]);
    expect(graph.facets.topics).toEqual([
      { id: 'topic:agent-workflows', label: 'agent-workflows', count: 1 },
      { id: 'topic:ai-workflow', label: 'ai-workflow', count: 1 },
    ]);
    expect(graph.facets.sources).toEqual([
      { id: 'source:article-source', label: 'Context Refinement System 설계 요약', count: 1, routeable: true },
      { id: 'source:external-source', label: 'External Source', count: 0, routeable: true },
      { id: 'source:docs-source', label: 'Memory Second Brain Implementation Reference', count: 1, routeable: false },
    ]);
    expect(graph.facets.memoryTypes).toEqual([
      { id: 'procedural', label: 'procedural', count: 1 },
      { id: 'semantic', label: 'semantic', count: 1 },
    ]);
    expect(graph.facets.edgeTypes).toEqual([
      { id: 'source-link', label: 'source-link', count: 2 },
      { id: 'supports', label: 'supports', count: 1 },
      { id: 'topic-tag', label: 'topic-tag', count: 2 },
    ]);
  });

  it('returns an empty graph model for empty public memory data', () => {
    expect(buildMemoryGraphModel(emptyMemoryData)).toEqual({
      nodes: [],
      edges: [],
      facets: {
        lenses: [
          { id: 'all', label: 'All', count: 0 },
          { id: 'topics', label: 'Topics', count: 0 },
          { id: 'sources', label: 'Sources', count: 0 },
          { id: 'theses', label: 'Theses', count: 0 },
          { id: 'external-vs-mine', label: 'External vs Mine', count: 0 },
        ],
        topics: [],
        sources: [],
        memoryTypes: [],
        edgeTypes: [],
      },
      selectedFallback: null,
    });
  });

  it('keeps public thoughts visible when a thought references a missing source', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const thought = graph.nodes.find((node) => node.id === 'thought:routing-problem');

    expect(thought?.sourceIds).toContain('source:missing-source');
    expect(graph.nodes.some((node) => node.id === 'source:missing-source')).toBe(false);
    expect(graph.edges.some((edge) => edge.to === 'source:missing-source')).toBe(false);
  });

  it('keeps deterministic positions inside graph bounds', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    for (const node of graph.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(0);
      expect(node.position.x).toBeLessThanOrEqual(100);
      expect(node.position.y).toBeGreaterThanOrEqual(0);
      expect(node.position.y).toBeLessThanOrEqual(100);
    }
  });

  it('filters graph visibility by query, lens, topic, source, memory type, and edge type', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect([...filterMemoryGraphModel(graph, { query: 'routing' }).nodeIds]).toEqual([
      'thought:routing-problem',
      'topic:ai-workflow',
      'source:article-source',
    ]);
    expect([...filterMemoryGraphModel(graph, { activeLens: 'topics' }).nodeIds]).toEqual([
      'thought:routing-problem',
      'thought:review-gates',
      'topic:ai-workflow',
      'topic:agent-workflows',
    ]);
    expect([...filterMemoryGraphModel(graph, { activeTopicIds: ['topic:ai-workflow'] }).nodeIds]).toEqual([
      'thought:routing-problem',
      'topic:ai-workflow',
      'source:article-source',
    ]);
    expect([...filterMemoryGraphModel(graph, { activeSourceIds: ['source:docs-source'] }).nodeIds]).toEqual([
      'thought:review-gates',
      'topic:agent-workflows',
      'source:docs-source',
    ]);
    expect([...filterMemoryGraphModel(graph, { activeMemoryTypes: ['procedural'] }).nodeIds]).toEqual([
      'thought:review-gates',
      'topic:agent-workflows',
      'source:docs-source',
    ]);
    expect([...filterMemoryGraphModel(graph, { activeEdgeTypes: ['supports'] }).edgeIds]).toEqual([
      'explicit:routing-problem:supports:review-gates',
    ]);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: FAIL with an export error for `buildMemoryGraphModel` and `filterMemoryGraphModel`.

- [ ] **Step 3: Add graph model interfaces and helpers**

In `src/lib/memoryData.ts`, insert this code after the `MemoryLookup` interface and before `routeableSourcePrefixes`:

```ts
export type MemoryGraphNodeKind = 'thought' | 'topic' | 'source';

export interface MemoryGraphNode {
  id: string;
  kind: MemoryGraphNodeKind;
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

export interface MemoryGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
  derived: boolean;
}

export interface MemoryGraphFacets {
  lenses: Array<{ id: string; label: string; count: number }>;
  topics: Array<{ id: string; label: string; count: number }>;
  sources: Array<{ id: string; label: string; count: number; routeable: boolean }>;
  memoryTypes: Array<{ id: string; label: string; count: number }>;
  edgeTypes: Array<{ id: string; label: string; count: number }>;
}

export interface MemoryGraphModel {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  facets: MemoryGraphFacets;
  selectedFallback: string | null;
}

export interface MemoryGraphFilterState {
  query?: string;
  activeLens?: string;
  activeTopicIds?: string[];
  activeSourceIds?: string[];
  activeMemoryTypes?: string[];
  activeEdgeTypes?: string[];
}
```

Then insert this code after `buildMemoryLookup` and before `ArticleMemoryLink`:

```ts
const graphLensDefinitions = [
  { id: 'all', label: 'All' },
  { id: 'topics', label: 'Topics' },
  { id: 'sources', label: 'Sources' },
  { id: 'theses', label: 'Theses' },
  { id: 'external-vs-mine', label: 'External vs Mine' },
] as const;

function prefixedThoughtId(slug: string): string {
  return `thought:${slug}`;
}

function prefixedSourceId(sourceId: string): string {
  return `source:${sourceId}`;
}

function stableEdgePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedFacetEntries(counts: Map<string, number>): Array<{ id: string; label: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, label: id, count }));
}

function normalizedQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function nodeSearchText(node: MemoryGraphNode): string {
  return [
    node.id,
    node.label,
    node.sublabel ?? '',
    node.memoryType ?? '',
    node.origin ?? '',
    ...node.topicIds,
    ...node.sourceIds,
  ].join(' ').toLocaleLowerCase();
}

function graphPosition(base: { x: number; y: number } | undefined, index: number, total: number, ring: number): { x: number; y: number } {
  if (base) {
    return {
      x: Math.min(100, Math.max(0, base.x)),
      y: Math.min(100, Math.max(0, base.y)),
    };
  }

  const angle = total <= 1 ? 0 : (Math.PI * 2 * index) / total;
  return {
    x: Math.round((50 + Math.cos(angle) * ring) * 100) / 100,
    y: Math.round((50 + Math.sin(angle) * ring) * 100) / 100,
  };
}

export function buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel {
  const lookup = buildMemoryLookup(memory);
  const nodes: MemoryGraphNode[] = [];
  const edges: MemoryGraphEdge[] = [];
  const nodeIds = new Set<string>();
  const memoryTypeCounts = new Map<string, number>();
  const edgeTypeCounts = new Map<string, number>();

  for (const thought of memory.thoughts) {
    const topicIds = thought.topics.map((topic) => {
      return lookup.topicsBySlug.get(topic)?.id ?? `topic:${stableEdgePart(topic)}`;
    });
    const sourceIds = thought.sources.map(prefixedSourceId);

    nodes.push({
      id: prefixedThoughtId(thought.slug),
      kind: 'thought',
      label: thought.claimKo,
      sublabel: thought.claimEn,
      weight: Math.max(1, thought.sources.length),
      memoryType: thought.memoryType,
      origin: thought.origin,
      topicIds,
      sourceIds,
      position: graphPosition(thought.position, nodes.length, Math.max(1, memory.thoughts.length), 34),
    });
    nodeIds.add(prefixedThoughtId(thought.slug));
    incrementCount(memoryTypeCounts, thought.memoryType);
  }

  for (const [index, topic] of memory.topics.entries()) {
    nodes.push({
      id: topic.id,
      kind: 'topic',
      label: topic.label,
      weight: Math.max(1, topic.count),
      topicIds: [topic.id],
      sourceIds: [],
      position: graphPosition(topic.position, index, Math.max(1, memory.topics.length), 42),
    });
    nodeIds.add(topic.id);
  }

  for (const [index, source] of memory.sources.entries()) {
    const resolved = lookup.sourcesById.get(source.id);
    nodes.push({
      id: prefixedSourceId(source.id),
      kind: 'source',
      label: source.title,
      sublabel: source.kind,
      weight: Math.max(1, source.count),
      topicIds: [],
      sourceIds: [prefixedSourceId(source.id)],
      href: resolved?.href ?? null,
      routeable: resolved?.routeable ?? false,
      date: source.date,
      position: graphPosition(undefined, index, Math.max(1, memory.sources.length), 46),
    });
    nodeIds.add(prefixedSourceId(source.id));
  }

  for (const edge of memory.edges) {
    const from = lookup.thoughtsBySlug.has(edge.from) ? prefixedThoughtId(edge.from) : edge.from;
    const to = lookup.thoughtsBySlug.has(edge.to) ? prefixedThoughtId(edge.to) : edge.to;

    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      continue;
    }

    edges.push({
      id: `explicit:${stableEdgePart(edge.from)}:${stableEdgePart(edge.type)}:${stableEdgePart(edge.to)}`,
      from,
      to,
      type: edge.type,
      confidence: edge.confidence,
      derived: false,
    });
    incrementCount(edgeTypeCounts, edge.type);
  }

  for (const thought of memory.thoughts) {
    const thoughtId = prefixedThoughtId(thought.slug);

    for (const topic of thought.topics) {
      const topicId = lookup.topicsBySlug.get(topic)?.id;
      if (!topicId || !nodeIds.has(topicId)) {
        continue;
      }

      const edgeId = `derived:thought-topic:${stableEdgePart(thought.slug)}:${stableEdgePart(topicId)}`;
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push({
          id: edgeId,
          from: thoughtId,
          to: topicId,
          type: 'topic-tag',
          confidence: 1,
          derived: true,
        });
        incrementCount(edgeTypeCounts, 'topic-tag');
      }
    }

    for (const sourceId of thought.sources) {
      const graphSourceId = prefixedSourceId(sourceId);
      if (!nodeIds.has(graphSourceId)) {
        continue;
      }

      edges.push({
        id: `derived:thought-source:${stableEdgePart(thought.slug)}:${stableEdgePart(sourceId)}`,
        from: thoughtId,
        to: graphSourceId,
        type: 'source-link',
        confidence: 1,
        derived: true,
      });
      incrementCount(edgeTypeCounts, 'source-link');
    }
  }

  return {
    nodes,
    edges,
    facets: {
      lenses: graphLensDefinitions.map((lens) => {
        const count = lens.id === 'all'
          ? nodes.length
          : lens.id === 'topics'
            ? memory.topics.length
            : lens.id === 'sources'
              ? memory.sources.length
              : lens.id === 'theses'
                ? memory.thoughts.filter((thought) => thought.theses.length > 0).length
                : new Set(memory.thoughts.map((thought) => thought.origin)).size;
        return { ...lens, count };
      }),
      topics: memory.topics
        .map((topic) => ({ id: topic.id, label: topic.label, count: topic.count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      sources: memory.sources
        .map((source) => {
          const resolved = lookup.sourcesById.get(source.id);
          return {
            id: prefixedSourceId(source.id),
            label: source.title,
            count: source.count,
            routeable: resolved?.routeable ?? false,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
      memoryTypes: sortedFacetEntries(memoryTypeCounts),
      edgeTypes: sortedFacetEntries(edgeTypeCounts),
    },
    selectedFallback: memory.thoughts[0] ? prefixedThoughtId(memory.thoughts[0].slug) : null,
  };
}

function applyLens(nodes: MemoryGraphNode[], activeLens: string | undefined): MemoryGraphNode[] {
  if (!activeLens || activeLens === 'all') {
    return nodes;
  }

  if (activeLens === 'topics') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'topic');
  }

  if (activeLens === 'sources') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'source');
  }

  if (activeLens === 'theses') {
    return nodes.filter((node) => node.kind !== 'source');
  }

  if (activeLens === 'external-vs-mine') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'source');
  }

  return nodes;
}

export function filterMemoryGraphModel(
  model: MemoryGraphModel,
  filters: MemoryGraphFilterState = {},
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const query = normalizedQuery(filters.query);
  const activeTopicIds = new Set(filters.activeTopicIds ?? []);
  const activeSourceIds = new Set(filters.activeSourceIds ?? []);
  const activeMemoryTypes = new Set(filters.activeMemoryTypes ?? []);
  const activeEdgeTypes = new Set(filters.activeEdgeTypes ?? []);
  const activeEdgeNodeIds = activeEdgeTypes.size > 0
    ? new Set(model.edges.filter((edge) => activeEdgeTypes.has(edge.type)).flatMap((edge) => [edge.from, edge.to]))
    : null;

  const visibleNodes = applyLens(model.nodes, filters.activeLens)
    .filter((node) => {
      if (query && !nodeSearchText(node).includes(query)) {
        return false;
      }

      if (activeTopicIds.size > 0 && !node.topicIds.some((topicId) => activeTopicIds.has(topicId))) {
        return false;
      }

      if (activeSourceIds.size > 0 && !node.sourceIds.some((sourceId) => activeSourceIds.has(sourceId))) {
        return false;
      }

      if (activeMemoryTypes.size > 0 && (!node.memoryType || !activeMemoryTypes.has(node.memoryType))) {
        return false;
      }

      if (activeEdgeNodeIds && !activeEdgeNodeIds.has(node.id)) {
        return false;
      }

      return true;
    });

  const nodeIds = new Set(visibleNodes.map((node) => node.id));

  for (const edge of model.edges) {
    const fromVisible = nodeIds.has(edge.from);
    const toVisible = nodeIds.has(edge.to);

    if (!fromVisible && !toVisible) {
      continue;
    }

    const fromNode = model.nodes.find((node) => node.id === edge.from);
    const toNode = model.nodes.find((node) => node.id === edge.to);
    const visibleThoughtContext = (fromNode?.kind === 'thought' && fromVisible) || (toNode?.kind === 'thought' && toVisible);

    if (visibleThoughtContext && edge.derived) {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    }
  }

  const edgeIds = new Set(
    model.edges
      .filter((edge) => {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
          return false;
        }

        if (activeEdgeTypes.size > 0 && !activeEdgeTypes.has(edge.type)) {
          return false;
        }

        return true;
      })
      .map((edge) => edge.id),
  );

  return { nodeIds, edgeIds };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: PASS for `src/lib/memoryData.test.mjs`.

- [ ] **Step 5: Commit graph model helpers**

Run:

```bash
git add src/lib/memoryData.ts src/lib/memoryData.test.mjs
git commit -m "feat: add memory graph model"
```

Expected: commit succeeds with only the two listed files staged.

---

### Task 2: Graph-First Memory Page Shell

**Files:**
- Modify: `src/pages/memory.astro`

**Interfaces:**
- Consumes:
  - `buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel`
  - `buildMemoryLookup(memory: MemoryPublicData): MemoryLookup`
  - `loadPublicMemoryData(): MemoryPublicData`
- Produces:
  - Static graph-first workbench markup.
  - JSON payload with `graph`, `nodes`, `edges`, `thoughtDetails`, `topicDetails`, `sourceDetails`, and `fallbackRelationships`.

- [ ] **Step 1: Update imports and server-side graph payload**

Replace the import and top-level data preparation in `src/pages/memory.astro` from the opening frontmatter through `const memoryPayload = ...;` with this code:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { buildMemoryGraphModel, buildMemoryLookup, loadPublicMemoryData } from '../lib/memoryData';

const memory = loadPublicMemoryData();
const lookup = buildMemoryLookup(memory);
const graph = buildMemoryGraphModel(memory);
const hasThoughts = memory.thoughts.length > 0;
const latestGenerated = memory.generatedAt
  ? new Intl.DateTimeFormat('ko', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(memory.generatedAt))
  : null;
const thoughtLabels = new Map(memory.thoughts.map((thought) => [thought.slug, thought.claimKo]));
const topicLabels = new Map(memory.topics.map((topic) => [topic.id, topic.label]));
const strongestEdges = memory.edges
  .filter((edge) => edge.type !== 'topic-tag')
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 4);

function graphNodeLabel(id: string) {
  const thoughtSlug = id.startsWith('thought:') ? id.replace('thought:', '') : id;
  return thoughtLabels.get(thoughtSlug) ?? topicLabels.get(id) ?? id;
}

function memoryNodeLabel(id: string) {
  return thoughtLabels.get(id) ?? topicLabels.get(id) ?? id;
}

function sourceCountLabel(count: number) {
  return count === 1 ? '1 source' : `${count} sources`;
}

function relationshipLabel(edge: { from: string; to: string; type: string }) {
  return `${edge.type}: ${memoryNodeLabel(edge.from)} -> ${memoryNodeLabel(edge.to)}`;
}

function edgeCoordinates(edge: { from: string; to: string }) {
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);

  return {
    x1: from?.position.x ?? 50,
    y1: from?.position.y ?? 50,
    x2: to?.position.x ?? 50,
    y2: to?.position.y ?? 50,
  };
}

const thoughtDetails = Object.fromEntries(memory.thoughts.map((thought) => [
  `thought:${thought.slug}`,
  {
    id: `thought:${thought.slug}`,
    kind: 'thought',
    title: thought.claimKo,
    body: thought.body || thought.claimEn,
    sublabel: thought.claimEn,
    memoryType: thought.memoryType,
    origin: thought.origin,
    topics: thought.topics,
    theses: thought.theses,
    sources: (lookup.sourceRefsByThoughtSlug.get(thought.slug) ?? []).map((source) => ({
      id: source.id,
      title: source.title,
      href: source.href,
      routeable: source.routeable,
      unresolved: 'unresolved' in source ? source.unresolved : false,
    })),
    relationships: (lookup.edgesByThoughtSlug.get(thought.slug) ?? [])
      .filter((edge) => edge.type !== 'topic-tag')
      .map((edge) => relationshipLabel(edge)),
  },
]));

const topicDetails = Object.fromEntries(memory.topics.map((topic) => [
  topic.id,
  {
    id: topic.id,
    kind: 'topic',
    title: topic.label,
    body: `${topic.count} public thoughts`,
    thoughts: memory.thoughts
      .filter((thought) => thought.topics.includes(topic.label))
      .map((thought) => ({
        id: `thought:${thought.slug}`,
        title: thought.claimKo,
      })),
  },
]));

const sourceDetails = Object.fromEntries(memory.sources.map((source) => {
  const resolved = lookup.sourcesById.get(source.id);
  return [
    `source:${source.id}`,
    {
      id: `source:${source.id}`,
      kind: 'source',
      title: source.title,
      body: source.path ?? source.url ?? source.kind,
      href: resolved?.href ?? null,
      routeable: resolved?.routeable ?? false,
      sourceKind: source.kind,
      date: source.date,
      thoughts: memory.thoughts
        .filter((thought) => thought.sources.includes(source.id))
        .map((thought) => ({
          id: `thought:${thought.slug}`,
          title: thought.claimKo,
        })),
    },
  ];
}));

const memoryPayload = {
  graph,
  details: {
    ...thoughtDetails,
    ...topicDetails,
    ...sourceDetails,
  },
  fallbackRelationships: strongestEdges.map((edge) => relationshipLabel(edge)),
};
---
```

- [ ] **Step 2: Replace the old hero and workbench sections with the graph shell**

Replace everything inside `<BaseLayout ...>` before the existing `<script is:inline type="application/json" ... />` with this markup:

```astro
  <section class="memory-app shell" data-memory-app>
    {hasThoughts ? (
      <>
        <aside class="memory-app__rail" aria-label="Memory filters">
          <div class="memory-app__title">
            <p class="memory-eyebrow">Knowledge Graph</p>
            <h1>Second Brain</h1>
            <p>공개해도 되는 생각과 근거만 그래프로 탐색합니다.</p>
          </div>

          <dl class="memory-app__stats" aria-label="Memory statistics">
            <div><dt>Thoughts</dt><dd>{memory.counts.thoughts}</dd></div>
            <div><dt>Topics</dt><dd>{memory.counts.topics}</dd></div>
            <div><dt>Edges</dt><dd>{memory.counts.edges}</dd></div>
            <div><dt>Sources</dt><dd>{memory.counts.sources}</dd></div>
          </dl>

          <p class="memory-app__generated">{latestGenerated ? `Last projected ${latestGenerated}` : 'Projection date unavailable'}</p>

          <label class="memory-app__search">
            <span>Search memory</span>
            <input type="search" placeholder="topic, claim, source" data-memory-search />
          </label>

          <div class="memory-app__control-group" aria-label="Lenses">
            <h2>Lens</h2>
            <div class="memory-app__chips">
              {graph.facets.lenses.map((lens) => (
                <button class="memory-app__chip is-active" type="button" data-memory-lens={lens.id} aria-pressed={lens.id === 'all' ? 'true' : 'false'}>
                  <span>{lens.label}</span>
                  <b>{lens.count}</b>
                </button>
              ))}
            </div>
          </div>

          <div class="memory-app__control-group" aria-label="Topics">
            <h2>Topics</h2>
            <div class="memory-app__chips">
              {graph.facets.topics.map((topic) => (
                <button class="memory-app__chip" type="button" data-memory-topic={topic.id} aria-pressed="false">
                  <span>{topic.label}</span>
                  <b>{topic.count}</b>
                </button>
              ))}
            </div>
          </div>

          <div class="memory-app__control-group" aria-label="Sources">
            <h2>Sources</h2>
            <div class="memory-app__chips">
              {graph.facets.sources.map((source) => (
                <button class="memory-app__chip" type="button" data-memory-source={source.id} aria-pressed="false">
                  <span>{source.label}</span>
                  <b>{source.count}</b>
                </button>
              ))}
            </div>
          </div>

          <div class="memory-app__control-group" aria-label="Memory types">
            <h2>Node types</h2>
            <div class="memory-app__chips">
              {graph.facets.memoryTypes.map((type) => (
                <button class="memory-app__chip" type="button" data-memory-type={type.id} aria-pressed="false">
                  <span>{type.label}</span>
                  <b>{type.count}</b>
                </button>
              ))}
            </div>
          </div>

          <div class="memory-app__control-group" aria-label="Edge types">
            <h2>Edge types</h2>
            <div class="memory-app__chips">
              {graph.facets.edgeTypes.map((type) => (
                <button class="memory-app__chip" type="button" data-memory-edge-type={type.id} aria-pressed="false">
                  <span>{type.label}</span>
                  <b>{type.count}</b>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main class="memory-app__main">
          <div class="memory-graph-toolbar" aria-label="Graph controls">
            <div class="memory-graph-toolbar__group" role="group" aria-label="Graph layout">
              <button class="memory-graph-tool is-active" type="button" data-memory-layout="brain" aria-pressed="true">Brain</button>
              <button class="memory-graph-tool" type="button" data-memory-layout="cluster" aria-pressed="false">Cluster</button>
              <button class="memory-graph-tool" type="button" data-memory-layout="timeline" aria-pressed="false">Timeline</button>
            </div>
            <div class="memory-graph-toolbar__group" role="group" aria-label="Graph display">
              <button class="memory-graph-tool" type="button" data-memory-reset>Reset</button>
              <button class="memory-graph-tool is-active" type="button" data-memory-labels aria-pressed="true">Labels</button>
              <button class="memory-graph-tool" type="button" data-memory-density="wide" aria-pressed="false">Wide</button>
            </div>
          </div>

          <div class="memory-graph-stage" data-memory-graph data-memory-layout-mode="brain" data-memory-density-mode="normal">
            <svg class="memory-graph-edges" viewBox="0 0 100 100" role="presentation" aria-hidden="true" preserveAspectRatio="none">
              {graph.edges.map((edge) => {
                const coords = edgeCoordinates(edge);
                return (
                  <line
                    x1={coords.x1}
                    y1={coords.y1}
                    x2={coords.x2}
                    y2={coords.y2}
                    data-memory-edge={edge.id}
                    data-memory-edge-type={edge.type}
                    data-memory-edge-derived={String(edge.derived)}
                  />
                );
              })}
            </svg>

            {graph.nodes.map((node) => (
              <button
                class={`memory-graph-node memory-graph-node--${node.kind} ${node.id === graph.selectedFallback ? 'is-selected' : ''}`}
                type="button"
                style={`--x:${node.position.x};--y:${node.position.y};--weight:${node.weight};`}
                data-memory-node={node.id}
                data-memory-kind={node.kind}
                data-memory-topics={node.topicIds.join(' ')}
                data-memory-sources={node.sourceIds.join(' ')}
                data-memory-type={node.memoryType ?? ''}
                data-memory-text={`${node.label} ${node.sublabel ?? ''} ${node.memoryType ?? ''} ${node.origin ?? ''}`}
                aria-pressed={node.id === graph.selectedFallback ? 'true' : 'false'}
                aria-label={`${node.kind}: ${node.label}`}
              >
                <span>{node.label}</span>
              </button>
            ))}

            <div class="memory-no-results memory-no-results--graph" data-memory-graph-empty hidden>
              <h2>No matching graph nodes</h2>
              <p>검색어와 필터를 줄이면 다시 볼 수 있습니다.</p>
              <button type="button" data-memory-reset>Reset filters</button>
            </div>
          </div>

          <section class="memory-secondary" aria-label="Memory fallback views">
            <div class="memory-tabs" role="tablist" aria-label="Memory views">
              <button class="memory-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="memory-list" data-memory-tab="memory-list">List</button>
              <button class="memory-tab" type="button" role="tab" aria-selected="false" aria-controls="memory-library" data-memory-tab="memory-library">Library</button>
              <button class="memory-tab" type="button" role="tab" aria-selected="false" aria-controls="memory-sources" data-memory-tab="memory-sources">Sources</button>
            </div>

            <div class="memory-panel is-active" id="memory-list" role="tabpanel">
              <div class="memory-thought-stack" aria-label="Public thoughts">
                {memory.thoughts.map((thought) => (
                  <button
                    class={`memory-thought-row ${`thought:${thought.slug}` === graph.selectedFallback ? 'is-selected' : ''}`}
                    type="button"
                    data-memory-list-item
                    data-memory-node={`thought:${thought.slug}`}
                    data-memory-topics={thought.topics.map((topic) => lookup.topicsBySlug.get(topic)?.id ?? '').join(' ')}
                    data-memory-sources={thought.sources.map((source) => `source:${source}`).join(' ')}
                    data-memory-type={thought.memoryType}
                    data-memory-text={`${thought.claimKo} ${thought.claimEn} ${thought.topics.join(' ')} ${thought.sources.join(' ')}`}
                  >
                    <div>
                      <span>{thought.memoryType}</span>
                      <h2>{thought.claimKo}</h2>
                      <p>{thought.claimEn}</p>
                    </div>
                    <div class="memory-chip-row">
                      {thought.topics.map((topic) => <span>{topic}</span>)}
                      <span>{sourceCountLabel(thought.sources.length)}</span>
                    </div>
                  </button>
                ))}
                <div class="memory-no-results" data-memory-list-empty hidden>
                  <h2>No matching thoughts</h2>
                  <p>검색어와 필터를 줄이면 다시 볼 수 있습니다.</p>
                  <button type="button" data-memory-reset>Reset filters</button>
                </div>
              </div>
            </div>

            <div class="memory-panel" id="memory-library" role="tabpanel" hidden>
              <div class="memory-library">
                {memory.topics.map((topic) => (
                  <section class="memory-topic" id={`topic-${topic.slug}`} data-memory-topic-group={topic.id}>
                    <div>
                      <h2>{topic.label}</h2>
                      <p>{topic.count} public thoughts</p>
                    </div>
                    <div class="memory-thought-list">
                      {memory.thoughts
                        .filter((thought) => thought.topics.includes(topic.label))
                        .map((thought) => (
                          <button
                            class="memory-thought-card"
                            type="button"
                            data-memory-list-item
                            data-memory-node={`thought:${thought.slug}`}
                            data-memory-topics={thought.topics.map((label) => lookup.topicsBySlug.get(label)?.id ?? '').join(' ')}
                            data-memory-sources={thought.sources.map((source) => `source:${source}`).join(' ')}
                            data-memory-type={thought.memoryType}
                            data-memory-text={`${thought.claimKo} ${thought.claimEn} ${thought.topics.join(' ')} ${thought.sources.join(' ')}`}
                          >
                            <h3>{thought.claimKo}</h3>
                            <p>{thought.claimEn}</p>
                            <div class="memory-chip-row">
                              <span>{thought.memoryType}</span>
                              <span>{sourceCountLabel(thought.sources.length)}</span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
                <div class="memory-no-results" data-memory-list-empty hidden>
                  <h2>No matching library entries</h2>
                  <p>현재 조건에 맞는 public thought가 없습니다.</p>
                  <button type="button" data-memory-reset>Reset filters</button>
                </div>
              </div>
            </div>

            <div class="memory-panel" id="memory-sources" role="tabpanel" hidden>
              <div class="memory-source-grid">
                {memory.sources.map((source) => {
                  const resolved = lookup.sourcesById.get(source.id);
                  const content = (
                    <>
                      <span>{source.kind}{resolved?.routeable ? ' · public route' : ' · repo source'}</span>
                      <h2>{source.title}</h2>
                      <p>{source.count} linked thoughts{source.date ? ` · ${source.date}` : ''}</p>
                      {source.path && <small>{source.path}</small>}
                    </>
                  );

                  return resolved?.href ? (
                    <a class="memory-source-card" href={resolved.href} data-memory-source-card={`source:${source.id}`}>
                      {content}
                    </a>
                  ) : (
                    <button class="memory-source-card memory-source-card--static" type="button" data-memory-source-card={`source:${source.id}`}>
                      {content}
                    </button>
                  );
                })}
              </div>
              <div class="memory-no-results" data-memory-source-empty hidden>
                <h2>No matching sources</h2>
                <p>현재 조건에 연결된 source가 없습니다.</p>
                <button type="button" data-memory-reset>Reset filters</button>
              </div>
            </div>
          </section>
        </main>

        <aside class="memory-app__drawer" aria-label="Selected memory node" data-memory-detail>
          <p class="memory-eyebrow">Selected</p>
          <h2 data-memory-detail-title>{graph.selectedFallback ? graphNodeLabel(graph.selectedFallback) : 'No selected node'}</h2>
          <p data-memory-detail-body>{graph.selectedFallback ? memoryPayload.details[graph.selectedFallback]?.body : 'Select a node to inspect its public evidence.'}</p>
          <div class="memory-chip-row" data-memory-detail-chips></div>
          <div class="memory-detail-list" data-memory-detail-sources></div>
          <div class="memory-detail-list" data-memory-detail-relationships></div>
        </aside>
      </>
    ) : (
      <div class="empty-state">
        <p>No public memory projection yet. Run <code>npm run memory:project</code> after adding accepted public thoughts.</p>
      </div>
    )}
  </section>
```

- [ ] **Step 3: Run Astro build to catch syntax issues**

Run:

```bash
npm run build
```

Expected: PASS. If it fails, fix the reported Astro/TypeScript syntax error before continuing.

- [ ] **Step 4: Commit graph-first page shell**

Run:

```bash
git add src/pages/memory.astro
git commit -m "feat: render memory graph workbench shell"
```

Expected: commit succeeds with only `src/pages/memory.astro` staged.

---

### Task 3: Graph Workbench Client Interaction

**Files:**
- Modify: `src/pages/memory.astro`

**Interfaces:**
- Consumes:
  - `memoryPayload.graph.nodes`
  - `memoryPayload.graph.edges`
  - `memoryPayload.details`
  - Markup data attributes from Task 2.
- Produces:
  - Search, lens, topic, source, memory type, edge type, selected node, labels, density, layout, reset, and tab behavior.

- [ ] **Step 1: Replace the inline browser script**

In `src/pages/memory.astro`, keep this JSON payload line:

```astro
  <script is:inline type="application/json" id="memory-payload" set:html={JSON.stringify(memoryPayload)} />
```

Replace the following inline `<script is:inline>...</script>` block with this code:

```astro
  <script is:inline>
    const root = document.querySelector('[data-memory-app]');
    const payloadElement = document.querySelector('#memory-payload');
    const payload = payloadElement?.textContent ? JSON.parse(payloadElement.textContent) : {
      graph: { nodes: [], edges: [], selectedFallback: null },
      details: {},
      fallbackRelationships: [],
    };

    if (root) {
      const state = {
        query: '',
        activeLens: 'all',
        activeTopicIds: new Set(),
        activeSourceIds: new Set(),
        activeMemoryTypes: new Set(),
        activeEdgeTypes: new Set(),
        selectedNodeId: payload.graph.selectedFallback,
        layoutMode: 'brain',
        showLabels: true,
        density: 'normal',
      };

      const graphStage = root.querySelector('[data-memory-graph]');
      const graphNodes = Array.from(root.querySelectorAll('[data-memory-node]'));
      const graphEdges = Array.from(root.querySelectorAll('[data-memory-edge]'));
      const listItems = Array.from(root.querySelectorAll('[data-memory-list-item]'));
      const sourceCards = Array.from(root.querySelectorAll('[data-memory-source-card]'));
      const search = root.querySelector('[data-memory-search]');
      const lensButtons = Array.from(root.querySelectorAll('[data-memory-lens]'));
      const topicButtons = Array.from(root.querySelectorAll('[data-memory-topic]'));
      const sourceButtons = Array.from(root.querySelectorAll('[data-memory-source]'));
      const typeButtons = Array.from(root.querySelectorAll('[data-memory-type]'));
      const edgeTypeButtons = Array.from(root.querySelectorAll('[data-memory-edge-type]'));
      const layoutButtons = Array.from(root.querySelectorAll('[data-memory-layout]'));
      const resetButtons = Array.from(root.querySelectorAll('[data-memory-reset]'));
      const labelsButton = root.querySelector('[data-memory-labels]');
      const densityButton = root.querySelector('[data-memory-density]');
      const tabs = Array.from(root.querySelectorAll('[data-memory-tab]'));
      const panels = Array.from(root.querySelectorAll('.memory-panel'));
      const detailTitle = root.querySelector('[data-memory-detail-title]');
      const detailBody = root.querySelector('[data-memory-detail-body]');
      const detailChips = root.querySelector('[data-memory-detail-chips]');
      const detailSources = root.querySelector('[data-memory-detail-sources]');
      const detailRelationships = root.querySelector('[data-memory-detail-relationships]');
      const graphEmpty = root.querySelector('[data-memory-graph-empty]');
      const listEmptyStates = Array.from(root.querySelectorAll('[data-memory-list-empty]'));
      const sourceEmpty = root.querySelector('[data-memory-source-empty]');
      const topicGroups = Array.from(root.querySelectorAll('[data-memory-topic-group]'));

      function normalize(value) {
        return value.trim().toLocaleLowerCase();
      }

      function toggleSetValue(set, value) {
        if (!value) {
          return;
        }

        if (set.has(value)) {
          set.delete(value);
        } else {
          set.add(value);
        }
      }

      function matchesSetAttribute(element, attributeName, values) {
        if (values.size === 0) {
          return true;
        }

        const attributeValues = (element.getAttribute(attributeName) ?? '').split(/\s+/).filter(Boolean);
        return attributeValues.some((value) => values.has(value));
      }

      function nodeMatches(node) {
        const kind = node.getAttribute('data-memory-kind') ?? '';
        const text = normalize(node.getAttribute('data-memory-text') ?? node.textContent ?? '');
        const nodeType = node.getAttribute('data-memory-type') ?? '';

        if (state.query && !text.includes(state.query)) {
          return false;
        }

        if (state.activeLens === 'topics' && kind !== 'thought' && kind !== 'topic') {
          return false;
        }

        if (state.activeLens === 'sources' && kind !== 'thought' && kind !== 'source') {
          return false;
        }

        if (state.activeLens === 'theses' && kind === 'source') {
          return false;
        }

        if (state.activeLens === 'external-vs-mine' && kind !== 'thought' && kind !== 'source') {
          return false;
        }

        if (!matchesSetAttribute(node, 'data-memory-topics', state.activeTopicIds)) {
          return false;
        }

        if (!matchesSetAttribute(node, 'data-memory-sources', state.activeSourceIds)) {
          return false;
        }

        if (state.activeMemoryTypes.size > 0 && !state.activeMemoryTypes.has(nodeType)) {
          return false;
        }

        if (state.activeEdgeTypes.size > 0) {
          const id = node.getAttribute('data-memory-node') ?? '';
          const connected = graphEdges.some((edge) => {
            return state.activeEdgeTypes.has(edge.getAttribute('data-memory-edge-type') ?? '') &&
              payload.graph.edges.find((item) => item.id === edge.getAttribute('data-memory-edge')) &&
              payload.graph.edges
                .filter((item) => item.id === edge.getAttribute('data-memory-edge'))
                .some((item) => item.from === id || item.to === id);
          });

          if (!connected) {
            return false;
          }
        }

        return true;
      }

      function itemMatches(item) {
        const text = normalize(item.getAttribute('data-memory-text') ?? item.textContent ?? '');
        const itemType = item.getAttribute('data-memory-type') ?? '';

        if (state.query && !text.includes(state.query)) {
          return false;
        }

        if (!matchesSetAttribute(item, 'data-memory-topics', state.activeTopicIds)) {
          return false;
        }

        if (!matchesSetAttribute(item, 'data-memory-sources', state.activeSourceIds)) {
          return false;
        }

        if (state.activeMemoryTypes.size > 0 && !state.activeMemoryTypes.has(itemType)) {
          return false;
        }

        return true;
      }

      function visibleNodeIds() {
        return new Set(graphNodes
          .filter((node) => !node.hidden)
          .map((node) => node.getAttribute('data-memory-node'))
          .filter(Boolean));
      }

      function createRow(text, href) {
        const row = document.createElement(href ? 'a' : 'p');
        row.textContent = text;
        row.className = href ? 'memory-detail-link' : 'memory-detail-static';
        if (href) {
          row.href = href;
        }
        return row;
      }

      function renderDetail() {
        const selected = payload.details[state.selectedNodeId] ?? null;

        if (!selected || !detailTitle || !detailBody || !detailChips || !detailSources || !detailRelationships) {
          return;
        }

        detailTitle.textContent = selected.title;
        detailBody.textContent = selected.body || selected.sublabel || '';
        detailChips.innerHTML = '';
        detailSources.innerHTML = '';
        detailRelationships.innerHTML = '';

        [selected.kind, selected.memoryType, selected.origin, ...(selected.topics ?? []), ...(selected.theses ?? [])]
          .filter(Boolean)
          .forEach((value) => {
            const chip = document.createElement('span');
            chip.textContent = value;
            detailChips.append(chip);
          });

        if (selected.sources) {
          selected.sources.forEach((source) => {
            detailSources.append(createRow(source.unresolved ? `${source.id} · unresolved source` : source.title, source.href));
          });
        }

        if (selected.href) {
          detailSources.append(createRow('Open source route', selected.href));
        }

        if (selected.thoughts) {
          selected.thoughts.forEach((thought) => {
            detailRelationships.append(createRow(thought.title));
          });
        }

        const relationshipValues = selected.relationships?.length > 0 ? selected.relationships : payload.fallbackRelationships;
        relationshipValues.forEach((relationship) => {
          detailRelationships.append(createRow(relationship));
        });
      }

      function updateSelectedFromVisibleNodes() {
        const visible = visibleNodeIds();
        if (state.selectedNodeId && visible.has(state.selectedNodeId)) {
          return;
        }

        state.selectedNodeId = [...visible][0] ?? payload.graph.selectedFallback;
      }

      function applyFilters() {
        let visibleGraphCount = 0;
        let visibleListCount = 0;
        let visibleSourceCount = 0;

        graphNodes.forEach((node) => {
          const visible = nodeMatches(node);
          node.toggleAttribute('hidden', !visible);
          if (visible) {
            visibleGraphCount += 1;
          }
        });

        const visible = visibleNodeIds();

        graphEdges.forEach((edge) => {
          const modelEdge = payload.graph.edges.find((item) => item.id === edge.getAttribute('data-memory-edge'));
          const edgeType = edge.getAttribute('data-memory-edge-type') ?? '';
          const visibleEdge = modelEdge &&
            visible.has(modelEdge.from) &&
            visible.has(modelEdge.to) &&
            (state.activeEdgeTypes.size === 0 || state.activeEdgeTypes.has(edgeType));
          edge.toggleAttribute('hidden', !visibleEdge);
        });

        listItems.forEach((item) => {
          const visible = itemMatches(item);
          item.toggleAttribute('hidden', !visible);
          if (visible) {
            visibleListCount += 1;
          }
        });

        sourceCards.forEach((card) => {
          const sourceId = card.getAttribute('data-memory-source-card') ?? '';
          const sourceVisible = state.activeSourceIds.size === 0 || state.activeSourceIds.has(sourceId);
          card.toggleAttribute('hidden', !sourceVisible);
          if (sourceVisible) {
            visibleSourceCount += 1;
          }
        });

        topicGroups.forEach((group) => {
          const groupItems = Array.from(group.querySelectorAll('[data-memory-list-item]'));
          group.toggleAttribute('hidden', !groupItems.some((item) => !item.hidden));
        });

        updateSelectedFromVisibleNodes();

        graphNodes.forEach((node) => {
          const selected = node.getAttribute('data-memory-node') === state.selectedNodeId;
          node.classList.toggle('is-selected', selected);
          node.setAttribute('aria-pressed', String(selected));
        });

        listItems.forEach((item) => {
          item.classList.toggle('is-selected', item.getAttribute('data-memory-node') === state.selectedNodeId);
        });

        lensButtons.forEach((button) => {
          const active = button.getAttribute('data-memory-lens') === state.activeLens;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });

        [
          [topicButtons, state.activeTopicIds, 'data-memory-topic'],
          [sourceButtons, state.activeSourceIds, 'data-memory-source'],
          [typeButtons, state.activeMemoryTypes, 'data-memory-type'],
          [edgeTypeButtons, state.activeEdgeTypes, 'data-memory-edge-type'],
        ].forEach(([buttons, activeSet, attribute]) => {
          buttons.forEach((button) => {
            const active = activeSet.has(button.getAttribute(attribute) ?? '');
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
          });
        });

        graphEmpty?.toggleAttribute('hidden', visibleGraphCount > 0);
        listEmptyStates.forEach((emptyState) => emptyState.toggleAttribute('hidden', visibleListCount > 0));
        sourceEmpty?.toggleAttribute('hidden', visibleSourceCount > 0);
        graphStage?.setAttribute('data-memory-layout-mode', state.layoutMode);
        graphStage?.setAttribute('data-memory-density-mode', state.density);
        graphStage?.classList.toggle('is-hiding-labels', !state.showLabels);
        renderDetail();
      }

      search?.addEventListener('input', () => {
        state.query = search instanceof HTMLInputElement ? normalize(search.value) : '';
        applyFilters();
      });

      lensButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.activeLens = button.getAttribute('data-memory-lens') ?? 'all';
          applyFilters();
        });
      });

      [
        [topicButtons, state.activeTopicIds, 'data-memory-topic'],
        [sourceButtons, state.activeSourceIds, 'data-memory-source'],
        [typeButtons, state.activeMemoryTypes, 'data-memory-type'],
        [edgeTypeButtons, state.activeEdgeTypes, 'data-memory-edge-type'],
      ].forEach(([buttons, activeSet, attribute]) => {
        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            toggleSetValue(activeSet, button.getAttribute(attribute) ?? '');
            applyFilters();
          });
        });
      });

      graphNodes.forEach((node) => {
        node.addEventListener('click', () => {
          state.selectedNodeId = node.getAttribute('data-memory-node') ?? state.selectedNodeId;
          applyFilters();
        });
      });

      listItems.forEach((item) => {
        item.addEventListener('click', () => {
          state.selectedNodeId = item.getAttribute('data-memory-node') ?? state.selectedNodeId;
          applyFilters();
        });
      });

      layoutButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.layoutMode = button.getAttribute('data-memory-layout') ?? 'brain';
          layoutButtons.forEach((item) => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', String(active));
          });
          applyFilters();
        });
      });

      labelsButton?.addEventListener('click', () => {
        state.showLabels = !state.showLabels;
        labelsButton.classList.toggle('is-active', state.showLabels);
        labelsButton.setAttribute('aria-pressed', String(state.showLabels));
        applyFilters();
      });

      densityButton?.addEventListener('click', () => {
        state.density = state.density === 'normal' ? 'wide' : 'normal';
        densityButton.classList.toggle('is-active', state.density === 'wide');
        densityButton.setAttribute('aria-pressed', String(state.density === 'wide'));
        applyFilters();
      });

      resetButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.query = '';
          state.activeLens = 'all';
          state.activeTopicIds.clear();
          state.activeSourceIds.clear();
          state.activeMemoryTypes.clear();
          state.activeEdgeTypes.clear();
          state.selectedNodeId = payload.graph.selectedFallback;
          state.layoutMode = 'brain';
          state.showLabels = true;
          state.density = 'normal';
          if (search instanceof HTMLInputElement) {
            search.value = '';
          }
          applyFilters();
        });
      });

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-memory-tab');

          tabs.forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-selected', String(selected));
          });

          panels.forEach((panel) => {
            const selected = panel.id === target;
            panel.classList.toggle('is-active', selected);
            panel.toggleAttribute('hidden', !selected);
          });

          applyFilters();
        });
      });

      applyFilters();
    }
  </script>
```

- [ ] **Step 2: Run the build and catch client syntax mistakes**

Run:

```bash
npm run build
```

Expected: PASS. If the inline script has a syntax error, Astro build fails and prints the file and line.

- [ ] **Step 3: Smoke the no-dead-link invariant from built HTML**

Run:

```bash
npm run build
rg -n 'href="#"|data-memory-node="undefined"|data-memory-edge="undefined"' dist/memory/index.html
```

Expected: `rg` exits with code 1 and prints no matches.

- [ ] **Step 4: Commit graph interactions**

Run:

```bash
git add src/pages/memory.astro
git commit -m "feat: add memory graph interactions"
```

Expected: commit succeeds with only `src/pages/memory.astro` staged.

---

### Task 4: Graph Workbench Visual System

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes:
  - Markup classes and data attributes from Tasks 2 and 3.
- Produces:
  - Responsive graph-first memory app layout.
  - Stable node, edge, rail, drawer, chip, toolbar, secondary panel, and no-results styles.

- [ ] **Step 1: Add graph workbench styles**

In `src/styles/global.css`, replace the current memory section from `.memory-hero {` through the `.memory-no-results button { ... }` rule with this CSS:

```css
.memory-app {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 330px;
  gap: 0;
  min-height: calc(100vh - 90px);
  padding-top: 24px;
  padding-bottom: 34px;
}

.memory-app__rail,
.memory-app__drawer,
.memory-app__main {
  min-width: 0;
}

.memory-app__rail,
.memory-app__drawer {
  border: 1px solid var(--line);
  background: var(--surface);
}

.memory-app__rail {
  border-radius: var(--radius) 0 0 var(--radius);
  padding: 18px;
}

.memory-app__main {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}

.memory-app__drawer {
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 20px;
}

.memory-app__title h1 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 28px;
  line-height: 1.12;
  letter-spacing: 0;
}

.memory-app__title p:not(.memory-eyebrow),
.memory-app__generated {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.memory-eyebrow {
  margin: 0 0 10px;
  color: var(--primary-ink);
  font-size: 12px;
  font-weight: 780;
}

.memory-app__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 18px 0;
}

.memory-app__stats div {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
}

.memory-app__stats dt {
  color: var(--muted);
  font-size: 11px;
}

.memory-app__stats dd {
  margin: 4px 0 0;
  color: var(--ink-strong);
  font-size: 22px;
  font-weight: 780;
}

.memory-app__search {
  display: grid;
  gap: 7px;
  margin: 18px 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 740;
}

.memory-app__search input {
  min-height: 40px;
  width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  padding: 0 11px;
}

.memory-app__control-group {
  border-top: 1px solid var(--line);
  padding-top: 14px;
  margin-top: 14px;
}

.memory-app__control-group h2 {
  margin: 0 0 10px;
  color: var(--ink-strong);
  font-size: 13px;
}

.memory-app__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.memory-app__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  padding: 5px 8px;
}

.memory-app__chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-app__chip b {
  color: var(--muted-2);
  font-weight: 760;
}

.memory-app__chip.is-active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-ink);
}

.memory-graph-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  padding: 10px;
}

.memory-graph-toolbar__group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.memory-graph-tool {
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 720;
  padding: 7px 10px;
}

.memory-graph-tool.is-active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-ink);
}

.memory-graph-stage {
  position: relative;
  min-height: 560px;
  overflow: hidden;
  background:
    linear-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px),
    var(--bg);
  background-size: 28px 28px;
}

.memory-graph-edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.memory-graph-edges line {
  stroke: color-mix(in oklch, var(--muted) 28%, transparent);
  stroke-width: 0.18;
}

.memory-graph-edges line[data-memory-edge-derived="true"] {
  stroke-dasharray: 1.2 1.2;
}

.memory-graph-node {
  position: absolute;
  left: calc(var(--x) * 1%);
  top: calc(var(--y) * 1%);
  display: grid;
  place-items: center;
  width: clamp(50px, calc(48px + var(--weight) * 8px), 92px);
  min-height: clamp(50px, calc(48px + var(--weight) * 8px), 92px);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-strong);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 760;
  line-height: 1.2;
  padding: 8px;
  text-align: center;
  transform: translate(-50%, -50%);
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.memory-graph-node span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.memory-graph-node--thought {
  border-color: color-mix(in oklch, var(--primary) 46%, var(--line));
}

.memory-graph-node--topic {
  color: var(--primary-ink);
}

.memory-graph-node--source {
  color: var(--muted);
  font-size: 10px;
}

.memory-graph-node.is-selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-ink);
}

.memory-graph-stage.is-hiding-labels .memory-graph-node span {
  opacity: 0;
}

.memory-graph-stage[data-memory-density-mode="wide"] .memory-graph-node {
  transform: translate(-50%, -50%) scale(1.08);
}

.memory-secondary {
  border-top: 1px solid var(--line);
  background: var(--surface);
  padding: 14px;
}

.memory-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.memory-tab {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg);
  color: var(--ink-strong);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 760;
  padding: 8px 12px;
}

.memory-tab.is-active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-ink);
}

.memory-thought-stack,
.memory-thought-list,
.memory-library {
  display: grid;
  gap: 10px;
}

.memory-thought-row,
.memory-thought-card,
.memory-source-card,
.memory-topic,
.memory-no-results {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.memory-thought-row,
.memory-thought-card,
.memory-source-card--static {
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.memory-thought-row {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.memory-thought-row.is-selected,
.memory-thought-card.is-selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.memory-thought-row > div:first-child > span {
  color: var(--primary-ink);
  font-size: 12px;
  font-weight: 760;
}

.memory-thought-row h2 {
  margin: 7px 0 8px;
  color: var(--ink-strong);
  font-size: clamp(20px, 2.4vw, 26px);
  line-height: 1.24;
}

.memory-thought-row p,
.memory-topic p,
.memory-source-card p,
.memory-thought-card p,
.memory-app__drawer p {
  margin: 0;
  color: var(--muted);
  line-height: 1.58;
}

.memory-app__drawer h2 {
  margin: 0 0 12px;
  color: var(--ink-strong);
  font-size: 22px;
  line-height: 1.26;
}

.memory-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.memory-chip-row span {
  border-radius: 999px;
  background: var(--surface-strong);
  color: var(--muted);
  font-size: 11px;
  font-weight: 720;
  padding: 5px 8px;
}

.memory-detail-list {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.memory-detail-list p,
.memory-detail-list a {
  margin: 0;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  padding-top: 8px;
}

.memory-detail-link {
  color: var(--primary-ink);
  text-decoration-thickness: 1px;
}

.memory-detail-static {
  color: var(--muted);
}

.memory-topic {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  padding: 18px;
}

.memory-topic h2,
.memory-source-card h2,
.memory-thought-card h3 {
  margin: 0 0 8px;
  color: var(--ink-strong);
  letter-spacing: 0;
}

.memory-thought-card {
  padding: 15px;
}

.memory-thought-card h3 {
  font-size: 20px;
  line-height: 1.24;
}

.memory-source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.memory-source-card {
  display: block;
  min-height: 160px;
  padding: 16px;
  text-decoration: none;
}

.memory-source-card span {
  display: inline-flex;
  margin-bottom: 16px;
  color: var(--primary-ink);
  font-size: 12px;
  font-weight: 760;
}

.memory-source-card small {
  display: block;
  margin-top: 14px;
  color: var(--muted-2);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.memory-source-card--static {
  width: 100%;
}

.memory-no-results {
  background: var(--surface-strong);
  padding: 18px;
}

.memory-no-results--graph {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(320px, calc(100% - 32px));
  transform: translate(-50%, -50%);
}

.memory-no-results h2 {
  margin: 0 0 8px;
  color: var(--ink-strong);
  font-size: 18px;
}

.memory-no-results p {
  margin: 0 0 14px;
  color: var(--muted);
  line-height: 1.55;
}

.memory-no-results button {
  min-height: 36px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--bg);
  color: var(--ink-strong);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 760;
  padding: 0 12px;
}
```

- [ ] **Step 2: Replace the memory responsive rules**

In the existing `@media (max-width: 980px)` block, replace the memory-specific selectors:

```css
  .memory-hero,
  .memory-workbench,
  .memory-topic,
```

with:

```css
  .memory-app,
  .memory-topic,
```

Then add this CSS inside the same `@media (max-width: 980px)` block:

```css
  .memory-app {
    display: grid;
    grid-template-columns: 1fr;
  }

  .memory-app__rail,
  .memory-app__main,
  .memory-app__drawer {
    border-radius: var(--radius);
  }

  .memory-app__main,
  .memory-app__drawer {
    border: 1px solid var(--line);
    margin-top: 12px;
  }

  .memory-graph-toolbar {
    align-items: start;
    flex-direction: column;
  }

  .memory-graph-stage {
    min-height: 420px;
  }

  .memory-topic {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 3: Run validation and visual smoke**

Run:

```bash
npm run build
npm run validate
```

Expected: both commands pass.

Start a local dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4321/memory/` and verify:

- desktop first viewport shows rail, graph, and drawer,
- graph nodes and edges are visible,
- selecting a graph node changes the drawer,
- filtering to no results shows the graph reset state,
- mobile width shows rail, graph, drawer, and fallback list without overlap.

Stop the dev server after the smoke check.

- [ ] **Step 4: Commit visual system**

Run:

```bash
git add src/styles/global.css
git commit -m "style: add memory graph workbench layout"
```

Expected: commit succeeds with only `src/styles/global.css` staged.

---

### Task 5: Final Verification And Graph Refresh

**Files:**
- Tracked source files are not modified in this task.
- Generated ignored output: `graphify-out/`

**Interfaces:**
- Consumes:
  - Completed Tasks 1-4.
- Produces:
  - Verification evidence for implementation completion.
  - Refreshed Graphify output as ignored command evidence.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run test
npm run validate
git diff --check
```

Expected:

- `npm run test`: PASS.
- `npm run validate`: PASS.
- `git diff --check`: no output.

- [ ] **Step 2: Refresh Graphify**

Run:

```bash
graphify update .
```

Expected: command completes. `graphify-out/` may be modified as ignored output and should not be staged.

- [ ] **Step 3: Confirm git state**

Run:

```bash
git status --short
git status --ignored --short graphify-out | sed -n '1,20p'
```

Expected:

- `git status --short` shows no tracked changes.
- ignored `graphify-out/` output may appear only in the ignored-status command.

- [ ] **Step 4: Record final visual check**

Run the local dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4321/memory/` and verify:

- first viewport has graph-first workbench layout,
- nodes are non-empty,
- edges are non-empty,
- drawer updates on node click,
- Lens buttons update active state,
- topic/source/type/edge filters update visible nodes,
- reset restores the graph,
- mobile viewport has no text overlap.

Stop the dev server after verification.

- [ ] **Step 5: Final completion note**

Report:

```text
Implemented Memory Graph Workbench.
Verified: npm run test, npm run validate, graphify update ., git diff --check.
Visual smoke: desktop and mobile /memory/ checked.
```
