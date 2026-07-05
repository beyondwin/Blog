# Memory Code Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the public memory code into small responsibility-based modules while preserving `/memory` behavior, deep links, article memory links, and public/private safety.

**Architecture:** Split `src/lib/memoryData.ts` into `src/lib/memory/*` modules for public data, lookup, graph model, filters, article links, and page payloads. Keep `src/lib/memoryData.ts` as a compatibility re-export surface during the first implementation. Move the `/memory` browser state machine out of `src/pages/memory.astro` into a static workbench script served from `public/scripts/memory-workbench.js` to avoid adding Astro bundling complexity in this refactor.

**Tech Stack:** Astro, TypeScript modules under `src/lib`, plain browser JavaScript for the workbench, Vitest, existing `npm run validate`, Graphify.

## Global Constraints

- Public routes must never import or parse `memory/**` directly.
- The only public memory input remains `src/data/memory.public.json`.
- Existing helper names remain importable from `src/lib/memoryData.ts`.
- Existing `/memory` URL parameters keep the same meaning: `node`, `topic`, `source`, `lens`, `q`, `type`, and `edge`.
- Unknown or stale URL parameter values are ignored rather than throwing.
- Missing or partial public JSON normalizes to `emptyMemoryData`.
- Non-routeable sources remain visible as static rows with `href: null`.
- Edges with unknown endpoints are skipped.
- Static `/memory` HTML remains readable if the browser workbench script fails.
- Run `graphify update .` after code changes before closeout.

---

## File Structure

- Create `src/lib/memory/publicData.ts`.
  - Responsibility: public projection types, empty fallback, normalization, public JSON loading.
- Create `src/lib/memory/lookup.ts`.
  - Responsibility: source href resolution, resolved/unresolved source refs, lookup maps.
- Create `src/lib/memory/graphModel.ts`.
  - Responsibility: graph node/edge/facet types, graph model derivation, deterministic positions.
- Create `src/lib/memory/filters.ts`.
  - Responsibility: graph filter state, lens filtering, deep-link href creation, deep-link parsing.
- Create `src/lib/memory/articleLinks.ts`.
  - Responsibility: article-to-memory linked/related matching and memory node URLs.
- Create `src/lib/memory/pagePayload.ts`.
  - Responsibility: serializable `/memory` payload, selected-node details, labels, edge coordinates.
- Create `src/lib/memory/index.ts`.
  - Responsibility: public memory module re-export surface.
- Modify `src/lib/memoryData.ts`.
  - Responsibility after refactor: compatibility re-export only.
- Create `src/lib/memory/testFixture.mjs`.
  - Responsibility: shared Vitest fixture copied from the current `src/lib/memoryData.test.mjs`.
- Split tests under `src/lib/memory/*.test.mjs`.
- Modify `src/pages/memory.astro`.
  - Responsibility after refactor: load memory, call page payload helper, render shell/markup, include client script.
- Create `public/scripts/memory-workbench.js`.
  - Responsibility: browser DOM state, filters, URL state, selected detail rendering, tabs, reset, graph UI toggles.
- Modify docs that mention memory file responsibilities:
  - `docs/notes/project/architecture-reference.md`
  - `docs/notes/project/agent-runbook.md`
  - `docs/implementation/memory-second-brain.md`

---

### Task 1: Extract Public Data And Lookup Modules

**Files:**
- Create: `src/lib/memory/publicData.ts`
- Create: `src/lib/memory/lookup.ts`
- Create: `src/lib/memory/index.ts`
- Create: `src/lib/memory/testFixture.mjs`
- Create: `src/lib/memory/publicData.test.mjs`
- Create: `src/lib/memory/lookup.test.mjs`
- Modify: `src/lib/memoryData.ts`
- Modify: `src/lib/memoryData.test.mjs`

**Interfaces:**
- Consumes: current `MemoryPublicData`, `emptyMemoryData`, `normalizeMemoryData`, `resolveMemorySourceHref`, and `buildMemoryLookup` behavior from `src/lib/memoryData.ts`.
- Produces:
  - `normalizeMemoryData(value: Partial<MemoryPublicData> | null | undefined): MemoryPublicData`
  - `loadPublicMemoryData(): MemoryPublicData`
  - `resolveMemorySourceHref(source: Pick<MemorySource, 'path' | 'url'>): string | null`
  - `buildMemoryLookup(memory: MemoryPublicData): MemoryLookup`
  - `src/lib/memoryData.ts` re-exports these names for existing imports.

- [ ] **Step 1: Create the shared fixture**

Create `src/lib/memory/testFixture.mjs` by moving the current `makeMemory()` helper from `src/lib/memoryData.test.mjs` into this file.

Use this exact export shape:

```js
import { normalizeMemoryData } from './publicData.ts';

export function makeMemory(overrides = {}) {
  return normalizeMemoryData({
    schemaVersion: 1,
    generatedAt: '2026-06-30T00:00:00.000Z',
    counts: { thoughts: 2, topics: 2, edges: 3, sources: 3 },
    thoughts: [
      {
        slug: 'routing-problem',
        claimKo: '컨텍스트 품질은 라우팅 문제다.',
        claimEn: 'Context quality is a routing problem.',
        memoryType: 'semantic',
        origin: 'kws',
        topics: ['ai-workflow'],
        theses: ['workflow-quality'],
        sources: ['article-source', 'missing-source'],
        body: 'A body.',
        position: { x: 10, y: 20 },
      },
      {
        slug: 'review-gates',
        claimKo: '에이전트 워크플로우에는 리뷰 게이트가 필요하다.',
        claimEn: 'Agent workflows need review gates.',
        memoryType: 'procedural',
        origin: 'kws',
        topics: ['agent-workflows'],
        theses: [],
        sources: ['docs-source'],
        body: 'Another body.',
        position: { x: 30, y: 40 },
      },
    ],
    topics: [
      { id: 'topic:ai-workflow', slug: 'ai-workflow', label: 'ai-workflow', count: 1, position: { x: 1, y: 1 } },
      { id: 'topic:agent-workflows', slug: 'agent-workflows', label: 'agent-workflows', count: 1, position: { x: 2, y: 2 } },
    ],
    sources: [
      {
        id: 'article-source',
        kind: 'article',
        path: 'src/content/articles/context-refinement-system-design.mdx',
        title: 'Context Refinement System 설계 요약',
        count: 1,
      },
      {
        id: 'docs-source',
        kind: 'guide',
        path: 'docs/implementation/memory-second-brain.md',
        title: 'Memory Second Brain Implementation Reference',
        count: 1,
      },
      {
        id: 'external-source',
        kind: 'external',
        url: 'https://example.com/source',
        title: 'External Source',
        count: 0,
      },
    ],
    edges: [
      { from: 'routing-problem', to: 'review-gates', type: 'supports', confidence: 0.8 },
      { from: 'routing-problem', to: 'topic:ai-workflow', type: 'topic-tag', confidence: 1 },
      { from: 'routing-problem', to: 'missing-thought', type: 'supports', confidence: 0.2 },
    ],
    excluded: {},
    ...overrides,
  });
}
```

- [ ] **Step 2: Write public data tests first**

Create `src/lib/memory/publicData.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { emptyMemoryData, normalizeMemoryData } from './publicData.ts';

describe('memory public data helpers', () => {
  it('provides a stable empty memory shape', () => {
    expect(emptyMemoryData).toEqual({
      schemaVersion: 1,
      generatedAt: null,
      counts: { thoughts: 0, topics: 0, edges: 0, sources: 0 },
      thoughts: [],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    });
  });

  it('normalizes missing collections to empty arrays', () => {
    expect(normalizeMemoryData({ schemaVersion: 1, counts: { thoughts: 1 } })).toMatchObject({
      schemaVersion: 1,
      counts: { thoughts: 1, topics: 0, edges: 0, sources: 0 },
      thoughts: [],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    });
  });
});
```

- [ ] **Step 3: Run public data tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/publicData.test.mjs
```

Expected: FAIL because `src/lib/memory/publicData.ts` does not exist yet.

- [ ] **Step 4: Implement `publicData.ts`**

Move the public memory interfaces, `emptyMemoryData`, `normalizeMemoryData()`,
and `loadPublicMemoryData()` from `src/lib/memoryData.ts` into
`src/lib/memory/publicData.ts`.

Use this path inside `loadPublicMemoryData()` because the module is now one
directory deeper:

```ts
export function loadPublicMemoryData(): MemoryPublicData {
  const modules = import.meta.glob('../../data/memory.public.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Partial<MemoryPublicData>>;

  return normalizeMemoryData(modules['../../data/memory.public.json']);
}
```

- [ ] **Step 5: Run public data tests and verify they pass**

Run:

```bash
npm run test -- src/lib/memory/publicData.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Write lookup tests first**

Create `src/lib/memory/lookup.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { buildMemoryLookup, resolveMemorySourceHref } from './lookup.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory lookup helpers', () => {
  it('resolves public source hrefs for routeable content collections', () => {
    expect(resolveMemorySourceHref({ path: 'src/content/articles/example-article.mdx' })).toBe('/articles/example-article/');
    expect(resolveMemorySourceHref({ path: 'src/content/analysis/example-url-analysis.mdx' })).toBe('/analysis/example-url-analysis/');
    expect(resolveMemorySourceHref({ path: 'src/content/ideas/example-idea.mdx' })).toBe('/ideas/example-idea/');
    expect(resolveMemorySourceHref({ path: 'src/content/reviews/black-swan.mdx' })).toBe('/reviews/black-swan/');
    expect(resolveMemorySourceHref({ path: 'src/content/travel/example-travel-note.mdx' })).toBe('/travel/example-travel-note/');
  });

  it('passes through external source URLs', () => {
    expect(resolveMemorySourceHref({ url: 'https://example.com/source' })).toBe('https://example.com/source');
  });

  it('returns null for non-routeable repo paths and missing paths', () => {
    expect(resolveMemorySourceHref({ path: 'docs/implementation/memory-second-brain.md' })).toBeNull();
    expect(resolveMemorySourceHref({ path: 'src/pages/memory.astro' })).toBeNull();
    expect(resolveMemorySourceHref({})).toBeNull();
  });

  it('builds lookup maps with routeable sources and unresolved source refs', () => {
    const lookup = buildMemoryLookup(makeMemory());

    expect(lookup.thoughtsBySlug.get('routing-problem')?.claimEn).toBe('Context quality is a routing problem.');
    expect(lookup.topicsById.get('topic:ai-workflow')?.label).toBe('ai-workflow');
    expect(lookup.topicsBySlug.get('agent-workflows')?.id).toBe('topic:agent-workflows');
    expect(lookup.sourcesById.get('article-source')).toMatchObject({
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
    expect(lookup.sourcesById.get('docs-source')).toMatchObject({
      href: null,
      routeable: false,
    });
    expect(lookup.sourceRefsByThoughtSlug.get('routing-problem')).toEqual([
      expect.objectContaining({ id: 'article-source', routeable: true }),
      expect.objectContaining({ id: 'missing-source', unresolved: true, routeable: false }),
    ]);
  });

  it('groups only relationships whose endpoints are known public thoughts or topics', () => {
    const lookup = buildMemoryLookup(makeMemory());
    const edges = lookup.edgesByThoughtSlug.get('routing-problem') ?? [];

    expect(edges).toEqual([
      expect.objectContaining({ from: 'routing-problem', to: 'review-gates' }),
      expect.objectContaining({ from: 'routing-problem', to: 'topic:ai-workflow' }),
    ]);
    expect(edges.some((edge) => edge.to === 'missing-thought')).toBe(false);
  });
});
```

- [ ] **Step 7: Run lookup tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/lookup.test.mjs
```

Expected: FAIL because `src/lib/memory/lookup.ts` does not exist yet.

- [ ] **Step 8: Implement `lookup.ts`**

Move source resolution and lookup code from `src/lib/memoryData.ts` into
`src/lib/memory/lookup.ts`. Import shared types from `publicData.ts`:

```ts
import type { MemoryEdge, MemoryPublicData, MemorySource, MemoryThought, MemoryTopic } from './publicData';
```

Keep these exported names:

```ts
export interface ResolvedMemorySource extends MemorySource {
  href: string | null;
  routeable: boolean;
}

export interface UnresolvedMemorySource {
  id: string;
  title: string;
  href: null;
  routeable: false;
  unresolved: true;
}

export interface MemoryLookup {
  thoughtsBySlug: Map<string, MemoryThought>;
  topicsById: Map<string, MemoryTopic>;
  topicsBySlug: Map<string, MemoryTopic>;
  sourcesById: Map<string, ResolvedMemorySource>;
  sourceRefsByThoughtSlug: Map<string, Array<ResolvedMemorySource | UnresolvedMemorySource>>;
  edgesByThoughtSlug: Map<string, MemoryEdge[]>;
}
```

- [ ] **Step 9: Add re-export surfaces**

Create `src/lib/memory/index.ts`:

```ts
export * from './publicData';
export * from './lookup';
```

Modify `src/lib/memoryData.ts` so the moved declarations are imported from the
new modules and re-exported. Do not remove graph/filter/article functions yet.
The file should begin with:

```ts
export * from './memory/publicData';
export * from './memory/lookup';

import type { MemoryPublicData, MemoryThought } from './memory/publicData';
import { buildMemoryLookup, resolveMemorySourceHref } from './memory/lookup';
```

Remove the original duplicated declarations from `memoryData.ts`.

- [ ] **Step 10: Update the old aggregate test imports**

Modify `src/lib/memoryData.test.mjs`:

- import `makeMemory` from `./memory/testFixture.mjs`,
- remove the local `makeMemory()` function,
- keep the existing assertions that still target `./memoryData.ts`.

The import block should start like this:

```js
import { describe, expect, it } from 'vitest';
import { makeMemory } from './memory/testFixture.mjs';
import {
  buildMemoryGraphModel,
  buildMemoryLookup,
  createMemoryFilterHref,
  createMemoryNodeHref,
  emptyMemoryData,
  findArticleMemoryLinks,
  filterMemoryGraphModel,
  normalizeMemoryData,
  parseMemoryDeepLinkParams,
  resolveMemorySourceHref,
} from './memoryData.ts';
```

- [ ] **Step 11: Run focused and compatibility tests**

Run:

```bash
npm run test -- src/lib/memory/publicData.test.mjs src/lib/memory/lookup.test.mjs src/lib/memoryData.test.mjs
```

Expected: PASS.

- [ ] **Step 12: Commit Task 1**

Run:

```bash
git add src/lib/memory src/lib/memoryData.ts src/lib/memoryData.test.mjs
git diff --cached --check
git commit -m "refactor: extract memory public data and lookup"
```

Expected: commit succeeds with only Task 1 files staged.

---

### Task 2: Extract Graph Model And Filter Modules

**Files:**
- Create: `src/lib/memory/graphModel.ts`
- Create: `src/lib/memory/filters.ts`
- Create: `src/lib/memory/graphModel.test.mjs`
- Create: `src/lib/memory/filters.test.mjs`
- Modify: `src/lib/memory/index.ts`
- Modify: `src/lib/memoryData.ts`
- Modify: `src/lib/memoryData.test.mjs`

**Interfaces:**
- Consumes:
  - `MemoryPublicData` from `publicData.ts`
  - `buildMemoryLookup()` from `lookup.ts`
- Produces:
  - `buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel`
  - `filterMemoryGraphModel(model: MemoryGraphModel, filters?: MemoryGraphFilterState): { nodeIds: Set<string>; edgeIds: Set<string> }`
  - `createMemoryFilterHref(filters: MemoryDeepLinkState): string`
  - `createMemoryNodeHref(nodeId: string): string`
  - `parseMemoryDeepLinkParams(params: URLSearchParams, model: MemoryGraphModel): MemoryDeepLinkState`

- [ ] **Step 1: Write graph model tests first**

Create `src/lib/memory/graphModel.test.mjs` with graph model assertions moved
from `src/lib/memoryData.test.mjs`. Include these minimum cases:

```js
import { describe, expect, it } from 'vitest';
import { buildMemoryGraphModel } from './graphModel.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory graph model', () => {
  it('builds thought, topic, and source graph nodes', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'thought:routing-problem',
      'thought:review-gates',
      'topic:ai-workflow',
      'topic:agent-workflows',
      'source:article-source',
      'source:docs-source',
      'source:external-source',
    ]));
    expect(graph.selectedFallback).toBe('thought:routing-problem');
  });

  it('skips explicit edges with unknown endpoints and derives topic/source edges', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'thought:routing-problem', to: 'thought:review-gates', type: 'supports', derived: false }),
      expect.objectContaining({ from: 'thought:routing-problem', to: 'topic:ai-workflow', type: 'topic-tag', derived: true }),
      expect.objectContaining({ from: 'thought:routing-problem', to: 'source:article-source', type: 'source-link', derived: true }),
    ]));
    expect(graph.edges.some((edge) => edge.to === 'missing-thought')).toBe(false);
  });

  it('builds stable facets for lenses, topics, sources, memory types, and edge types', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.facets.lenses.map((lens) => lens.id)).toEqual(['all', 'topics', 'sources', 'theses', 'external-vs-mine']);
    expect(graph.facets.topics.map((topic) => topic.id)).toEqual(['topic:agent-workflows', 'topic:ai-workflow']);
    expect(graph.facets.memoryTypes.map((type) => type.id)).toEqual(['procedural', 'semantic']);
    expect(graph.facets.edgeTypes.map((type) => type.id)).toEqual(expect.arrayContaining(['source-link', 'supports', 'topic-tag']));
  });
});
```

- [ ] **Step 2: Run graph model tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/graphModel.test.mjs
```

Expected: FAIL because `src/lib/memory/graphModel.ts` does not exist yet.

- [ ] **Step 3: Implement `graphModel.ts`**

Move these declarations from `src/lib/memoryData.ts` into
`src/lib/memory/graphModel.ts`:

- `MemoryGraphNodeKind`
- `MemoryGraphNode`
- `MemoryGraphEdge`
- `MemoryGraphFacets`
- `MemoryGraphModel`
- `graphLensDefinitions`
- `prefixedThoughtId`
- `prefixedSourceId`
- `stableEdgePart`
- `incrementCount`
- `sortedFacetEntries`
- `graphPosition`
- `buildMemoryGraphModel()`

Export `prefixedThoughtId`, `prefixedSourceId`, and `stableEdgePart` because
`articleLinks.ts` and `filters.ts` will need them later:

```ts
export function prefixedThoughtId(slug: string): string {
  return `thought:${slug}`;
}

export function prefixedSourceId(sourceId: string): string {
  return `source:${sourceId}`;
}

export function stableEdgePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
```

Import dependencies:

```ts
import type { MemoryPublicData } from './publicData';
import { buildMemoryLookup } from './lookup';
```

- [ ] **Step 4: Write filter tests first**

Create `src/lib/memory/filters.test.mjs` with filter and URL assertions moved
from `src/lib/memoryData.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { buildMemoryGraphModel } from './graphModel.ts';
import {
  createMemoryFilterHref,
  createMemoryNodeHref,
  filterMemoryGraphModel,
  parseMemoryDeepLinkParams,
} from './filters.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory graph filters and deep links', () => {
  it('filters graph nodes by query, topic, source, memory type, and edge type', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const result = filterMemoryGraphModel(graph, {
      query: 'routing',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    });

    expect([...result.nodeIds]).toContain('thought:routing-problem');
    expect([...result.edgeIds]).toEqual(['explicit:routing-problem:supports:review-gates']);
  });

  it('creates stable memory node and filter hrefs', () => {
    expect(createMemoryNodeHref('thought:routing-problem')).toBe('/memory/?node=thought%3Arouting-problem');
    expect(createMemoryFilterHref({
      selectedNodeId: 'thought:routing-problem',
      query: 'workflow',
      activeLens: 'sources',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    })).toBe('/memory/?node=thought%3Arouting-problem&q=workflow&lens=sources&topic=topic%3Aai-workflow&source=source%3Aarticle-source&type=semantic&edge=supports');
  });

  it('parses only valid deep-link params for the current graph', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const params = new URLSearchParams('node=thought:routing-problem&node=missing&q=workflow&lens=sources&topic=topic:ai-workflow&topic=missing&source=source:article-source&type=semantic&type=missing&edge=supports&edge=missing');

    expect(parseMemoryDeepLinkParams(params, graph)).toEqual({
      selectedNodeId: 'thought:routing-problem',
      query: 'workflow',
      activeLens: 'sources',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    });
  });
});
```

- [ ] **Step 5: Run filter tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/filters.test.mjs
```

Expected: FAIL because `src/lib/memory/filters.ts` does not exist yet.

- [ ] **Step 6: Implement `filters.ts`**

Move these declarations from `src/lib/memoryData.ts` into
`src/lib/memory/filters.ts`:

- `MemoryGraphFilterState`
- `MemoryDeepLinkState`
- `normalizedQuery`
- `nodeSearchText`
- `applyLens`
- `filterMemoryGraphModel()`
- `appendParams`
- `createMemoryFilterHref()`
- `createMemoryNodeHref()`
- `allowedParamValues`
- `parseMemoryDeepLinkParams()`

Import graph types from `graphModel.ts`:

```ts
import type { MemoryGraphModel, MemoryGraphNode } from './graphModel';
```

- [ ] **Step 7: Update re-export surfaces**

Modify `src/lib/memory/index.ts`:

```ts
export * from './publicData';
export * from './lookup';
export * from './graphModel';
export * from './filters';
```

Modify `src/lib/memoryData.ts` so it re-exports the new graph/filter modules
and imports only the names needed by still-unmoved article link code:

```ts
export * from './memory/publicData';
export * from './memory/lookup';
export * from './memory/graphModel';
export * from './memory/filters';

import type { MemoryPublicData, MemoryThought } from './memory/publicData';
import { createMemoryNodeHref } from './memory/filters';
import { prefixedThoughtId } from './memory/graphModel';
```

- [ ] **Step 8: Remove duplicate graph/filter assertions from aggregate test**

Delete graph-model-specific and filter-specific test cases from
`src/lib/memoryData.test.mjs` only after they exist in the new focused test
files. Keep at least one compatibility assertion:

```js
it('keeps memoryData compatibility exports wired', () => {
  const graph = buildMemoryGraphModel(makeMemory());

  expect(graph.selectedFallback).toBe('thought:routing-problem');
  expect(createMemoryNodeHref('thought:routing-problem')).toBe('/memory/?node=thought%3Arouting-problem');
});
```

- [ ] **Step 9: Run focused and compatibility tests**

Run:

```bash
npm run test -- src/lib/memory/graphModel.test.mjs src/lib/memory/filters.test.mjs src/lib/memoryData.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add src/lib/memory src/lib/memoryData.ts src/lib/memoryData.test.mjs
git diff --cached --check
git commit -m "refactor: extract memory graph model and filters"
```

Expected: commit succeeds with only Task 2 files staged.

---

### Task 3: Extract Article Links And Page Payload

**Files:**
- Create: `src/lib/memory/articleLinks.ts`
- Create: `src/lib/memory/pagePayload.ts`
- Create: `src/lib/memory/articleLinks.test.mjs`
- Create: `src/lib/memory/pagePayload.test.mjs`
- Modify: `src/lib/memory/index.ts`
- Modify: `src/lib/memoryData.ts`
- Modify: `src/lib/memoryData.test.mjs`
- Modify: `src/pages/memory.astro`
- Modify if imports need the new path: `src/pages/articles/[slug].astro`

**Interfaces:**
- Consumes:
  - `MemoryPublicData`, `MemoryThought` from `publicData.ts`
  - `buildMemoryLookup`, `MemoryLookup` from `lookup.ts`
  - `buildMemoryGraphModel`, `MemoryGraphModel`, `prefixedThoughtId`, `prefixedSourceId` from `graphModel.ts`
  - `createMemoryNodeHref` from `filters.ts`
- Produces:
  - `findArticleMemoryLinks(memory: MemoryPublicData, articlePath: string, articleTags?: string[], limit?: number): ArticleMemoryLinks`
  - `buildMemoryPagePayload(memory: MemoryPublicData): MemoryPagePayload`
  - `getMemoryGraphEdgeCoordinates(graph: MemoryGraphModel, edge: { from: string; to: string }): { x1: number; y1: number; x2: number; y2: number }`
  - `getMemorySourceCountLabel(count: number): string`

- [ ] **Step 1: Write article link tests first**

Create `src/lib/memory/articleLinks.test.mjs` by moving the article matching
cases from `src/lib/memoryData.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { findArticleMemoryLinks } from './articleLinks.ts';
import { emptyMemoryData, normalizeMemoryData } from './publicData.ts';
import { makeMemory } from './testFixture.mjs';

describe('article memory links', () => {
  it('finds memory directly linked to an article source path', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      [],
    );

    expect(result.linked).toEqual([
      expect.objectContaining({
        slug: 'routing-problem',
        nodeId: 'thought:routing-problem',
        memoryHref: '/memory/?node=thought%3Arouting-problem',
        matchCount: 0,
      }),
    ]);
    expect(result.related).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('falls back to case-insensitive article tag and memory topic matches', () => {
    const result = findArticleMemoryLinks(makeMemory(), 'src/content/articles/unlinked.mdx', [
      'AI-WORKFLOW',
      'missing',
    ]);

    expect(result.linked).toEqual([]);
    expect(result.related).toEqual([
      expect.objectContaining({
        slug: 'routing-problem',
        matchCount: 1,
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it('does not duplicate linked thoughts in related fallback results', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      ['ai-workflow'],
    );

    expect(result.linked.map((thought) => thought.slug)).toEqual(['routing-problem']);
    expect(result.related.map((thought) => thought.slug)).not.toContain('routing-problem');
    expect(result.total).toBe(1);
  });

  it('caps article memory results at four thoughts', () => {
    const memory = normalizeMemoryData({
      counts: { thoughts: 5, topics: 1, edges: 0, sources: 1 },
      thoughts: Array.from({ length: 5 }, (_, index) => ({
        slug: `thought-${index + 1}`,
        claimKo: `생각 ${index + 1}`,
        claimEn: `Thought ${index + 1}`,
        memoryType: 'semantic',
        origin: 'kws',
        topics: ['ai-workflow'],
        theses: [],
        sources: [],
        body: '',
        position: { x: index, y: index },
      })),
      topics: [
        { id: 'topic:ai-workflow', slug: 'ai-workflow', label: 'ai-workflow', count: 5, position: { x: 1, y: 1 } },
      ],
      sources: [],
      edges: [],
      excluded: {},
    });

    const result = findArticleMemoryLinks(memory, '', ['ai-workflow']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'thought-1',
      'thought-2',
      'thought-3',
      'thought-4',
    ]);
    expect(result.total).toBe(4);
  });

  it('returns empty article memory links for empty memory data', () => {
    expect(findArticleMemoryLinks(emptyMemoryData, 'src/content/articles/example.mdx', ['ai-workflow'])).toEqual({
      linked: [],
      related: [],
      total: 0,
    });
  });
});
```

- [ ] **Step 2: Run article link tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/articleLinks.test.mjs
```

Expected: FAIL because `src/lib/memory/articleLinks.ts` does not exist yet.

- [ ] **Step 3: Implement `articleLinks.ts`**

Move these declarations from `src/lib/memoryData.ts` into
`src/lib/memory/articleLinks.ts`:

- `ArticleMemoryLink`
- `ArticleMemoryLinks`
- `defaultArticleMemoryLimit`
- `normalizeMemoryMatchValue`
- `toArticleMemoryLink`
- `findArticleMemoryLinks()`

Import dependencies:

```ts
import type { MemoryPublicData, MemoryThought } from './publicData';
import { createMemoryNodeHref } from './filters';
import { prefixedThoughtId } from './graphModel';
```

- [ ] **Step 4: Write page payload tests first**

Create `src/lib/memory/pagePayload.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import {
  buildMemoryPagePayload,
  getMemoryGraphEdgeCoordinates,
  getMemorySourceCountLabel,
} from './pagePayload.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory page payload', () => {
  it('builds a serializable graph payload and node details', () => {
    const payload = buildMemoryPagePayload(makeMemory());

    expect(payload.graph.selectedFallback).toBe('thought:routing-problem');
    expect(payload.details['thought:routing-problem']).toMatchObject({
      id: 'thought:routing-problem',
      kind: 'thought',
      title: '컨텍스트 품질은 라우팅 문제다.',
      body: 'A body.',
      memoryType: 'semantic',
      origin: 'kws',
    });
    expect(payload.details['topic:ai-workflow']).toMatchObject({
      id: 'topic:ai-workflow',
      kind: 'topic',
      title: 'ai-workflow',
    });
    expect(payload.details['source:article-source']).toMatchObject({
      id: 'source:article-source',
      kind: 'source',
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
  });

  it('provides lookup data needed by the Astro markup without exposing Maps', () => {
    const payload = buildMemoryPagePayload(makeMemory());

    expect(payload.topicIdsByLabel).toEqual({
      'agent-workflows': 'topic:agent-workflows',
      'ai-workflow': 'topic:ai-workflow',
    });
    expect(payload.sourcesById['article-source']).toMatchObject({
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
  });

  it('computes graph edge coordinates from graph node positions', () => {
    const payload = buildMemoryPagePayload(makeMemory());
    const edge = payload.graph.edges.find((item) => item.type === 'supports');

    expect(getMemoryGraphEdgeCoordinates(payload.graph, edge)).toEqual({
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
    });
  });

  it('formats source count labels', () => {
    expect(getMemorySourceCountLabel(1)).toBe('1 source');
    expect(getMemorySourceCountLabel(2)).toBe('2 sources');
  });
});
```

- [ ] **Step 5: Run page payload tests and verify they fail**

Run:

```bash
npm run test -- src/lib/memory/pagePayload.test.mjs
```

Expected: FAIL because `src/lib/memory/pagePayload.ts` does not exist yet.

- [ ] **Step 6: Implement `pagePayload.ts`**

Create these exported interfaces and helpers:

```ts
import type { MemoryEdge, MemoryPublicData } from './publicData';
import { buildMemoryGraphModel, prefixedSourceId, type MemoryGraphModel } from './graphModel';
import { buildMemoryLookup, type ResolvedMemorySource } from './lookup';

export interface MemoryDetailSource {
  id: string;
  title: string;
  href: string | null;
  routeable: boolean;
  unresolved?: boolean;
}

export interface MemoryPageDetail {
  id: string;
  kind: 'thought' | 'topic' | 'source';
  title: string;
  body: string;
  sublabel?: string;
  memoryType?: string;
  origin?: string;
  topics?: string[];
  theses?: string[];
  sources?: MemoryDetailSource[];
  relationships?: string[];
  href?: string | null;
  routeable?: boolean;
  sourceKind?: string;
  date?: string;
  thoughts?: Array<{ id: string; title: string }>;
}

export interface MemoryPagePayload {
  graph: MemoryGraphModel;
  details: Record<string, MemoryPageDetail>;
  fallbackRelationships: string[];
  topicIdsByLabel: Record<string, string>;
  sourcesById: Record<string, Pick<ResolvedMemorySource, 'href' | 'routeable'>>;
}
```

Implement `buildMemoryPagePayload(memory)` by moving the current top-of-page
detail assembly from `src/pages/memory.astro` into this module. It must return
plain objects only, not `Map` instances.

Export these helpers:

```ts
export function getMemorySourceCountLabel(count: number): string {
  return count === 1 ? '1 source' : `${count} sources`;
}

export function getMemoryGraphEdgeCoordinates(
  graph: MemoryGraphModel,
  edge: Pick<MemoryEdge, 'from' | 'to'>,
): { x1: number; y1: number; x2: number; y2: number } {
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);

  return {
    x1: from?.position.x ?? 50,
    y1: from?.position.y ?? 50,
    x2: to?.position.x ?? 50,
    y2: to?.position.y ?? 50,
  };
}
```

- [ ] **Step 7: Update re-export surfaces and compatibility file**

Modify `src/lib/memory/index.ts`:

```ts
export * from './publicData';
export * from './lookup';
export * from './graphModel';
export * from './filters';
export * from './articleLinks';
export * from './pagePayload';
```

Replace `src/lib/memoryData.ts` with compatibility re-exports only:

```ts
export * from './memory/publicData';
export * from './memory/lookup';
export * from './memory/graphModel';
export * from './memory/filters';
export * from './memory/articleLinks';
export * from './memory/pagePayload';
```

- [ ] **Step 8: Update `src/pages/memory.astro` to use page payload**

Replace the current imports with:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import {
  buildMemoryPagePayload,
  getMemoryGraphEdgeCoordinates,
  getMemorySourceCountLabel,
  loadPublicMemoryData,
} from '../lib/memory';

const memory = loadPublicMemoryData();
const memoryPayload = buildMemoryPagePayload(memory);
const graph = memoryPayload.graph;
const hasThoughts = memory.thoughts.length > 0;
const latestGenerated = memory.generatedAt
  ? new Intl.DateTimeFormat('ko', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(memory.generatedAt))
  : null;
const clientPayload = {
  graph: memoryPayload.graph,
  details: memoryPayload.details,
  fallbackRelationships: memoryPayload.fallbackRelationships,
};
---
```

Then update page references:

- `sourceCountLabel(...)` becomes `getMemorySourceCountLabel(...)`.
- `edgeCoordinates(edge)` becomes `getMemoryGraphEdgeCoordinates(graph, edge)`.
- `lookup.topicsBySlug.get(topic)?.id ?? ''` becomes `memoryPayload.topicIdsByLabel[topic] ?? ''`.
- `lookup.sourcesById.get(source.id)` becomes `memoryPayload.sourcesById[source.id]`.
- JSON payload uses `clientPayload`:

```astro
<script is:inline type="application/json" id="memory-payload" set:html={JSON.stringify(clientPayload)} />
```

- [ ] **Step 9: Update article page import if needed**

If `src/pages/articles/[slug].astro` imports from `../../lib/memoryData`, change
it to the new module surface:

```ts
import { findArticleMemoryLinks, loadPublicMemoryData } from '../../lib/memory';
```

Do not change article matching behavior.

- [ ] **Step 10: Run focused tests and Astro type check**

Run:

```bash
npm run test -- src/lib/memory/articleLinks.test.mjs src/lib/memory/pagePayload.test.mjs src/lib/memoryData.test.mjs
npm run build
```

Expected: PASS for tests; Astro check and build complete successfully.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add src/lib/memory src/lib/memoryData.ts src/lib/memoryData.test.mjs src/pages/memory.astro src/pages/articles/[slug].astro
git diff --cached --check
git commit -m "refactor: extract memory article links and page payload"
```

Expected: commit succeeds with only Task 3 files staged.

---

### Task 4: Move Memory Workbench Browser Script Out Of Astro Page

**Files:**
- Create: `public/scripts/memory-workbench.js`
- Modify: `src/pages/memory.astro`
- Optional test if practical: `scripts/site-content.test.mjs`

**Interfaces:**
- Consumes: JSON payload in `<script id="memory-payload" type="application/json">`.
- Produces: same browser behavior currently provided by the inline script in `src/pages/memory.astro`.

- [ ] **Step 1: Capture the current inline script behavior**

Before editing, copy the current inline workbench script body from
`src/pages/memory.astro` into a scratch buffer. The script begins with:

```js
const root = document.querySelector('[data-memory-app]');
const payloadElement = document.querySelector('#memory-payload');
```

and ends with:

```js
applyFilters();
```

inside the `if (root) { ... }` block.

- [ ] **Step 2: Create `public/scripts/memory-workbench.js`**

Create the file and paste the current script body unchanged except for one
wrapper that avoids leaking top-level names:

```js
(() => {
  const root = document.querySelector('[data-memory-app]');
  const payloadElement = document.querySelector('#memory-payload');
  const payload = payloadElement?.textContent ? JSON.parse(payloadElement.textContent) : {
    graph: { nodes: [], edges: [], selectedFallback: null },
    details: {},
    fallbackRelationships: [],
  };

  if (!root) {
    return;
  }

  // Paste the current inline script contents from inside `if (root) { ... }` here.
})();
```

When pasting, remove the old outer `if (root) {` and its final matching `}`.
Keep function names and DOM selectors unchanged.

- [ ] **Step 3: Update `src/pages/memory.astro` to load the script**

Remove the long inline workbench script and replace it with:

```astro
<script src="/scripts/memory-workbench.js" defer></script>
```

Keep the JSON payload script immediately before it:

```astro
<script is:inline type="application/json" id="memory-payload" set:html={JSON.stringify(clientPayload)} />
<script src="/scripts/memory-workbench.js" defer></script>
```

- [ ] **Step 4: Add a lightweight content test for the external script reference**

If `scripts/site-content.test.mjs` already checks page shell contracts, add:

```js
it('loads the memory workbench script from the public scripts directory', async () => {
  const source = await fs.readFile(new URL('../src/pages/memory.astro', import.meta.url), 'utf8');

  expect(source).toContain('<script src="/scripts/memory-workbench.js" defer></script>');
});
```

If that file does not already import `fs`, add:

```js
import fs from 'node:fs/promises';
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm run test -- scripts/site-content.test.mjs src/lib/memoryData.test.mjs
npm run build
```

Expected: PASS for tests; Astro check and build complete successfully.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add public/scripts/memory-workbench.js src/pages/memory.astro scripts/site-content.test.mjs
git diff --cached --check
git commit -m "refactor: extract memory workbench script"
```

Expected: commit succeeds with only Task 4 files staged.

---

### Task 5: Update Documentation And Run Full Verification

**Files:**
- Modify: `docs/notes/project/architecture-reference.md`
- Modify: `docs/notes/project/agent-runbook.md`
- Modify: `docs/implementation/memory-second-brain.md`

**Interfaces:**
- Consumes: final file responsibilities from Tasks 1-4.
- Produces: updated docs that match the refactored memory module layout and validation commands.

- [ ] **Step 1: Update architecture reference memory section**

In `docs/notes/project/architecture-reference.md`, replace the single
`src/lib/memoryData.ts` responsibility line with the module map:

```md
| Memory public data | `src/lib/memory/publicData.ts` | public memory JSON type, empty fallback, normalize, public JSON load. |
| Memory lookup | `src/lib/memory/lookup.ts` | source route resolution and thought/topic/source/edge lookup maps. |
| Memory graph model | `src/lib/memory/graphModel.ts` | graph nodes, edges, facets, deterministic positions. |
| Memory filters | `src/lib/memory/filters.ts` | lens/filter matching and `/memory/` deep-link helpers. |
| Memory article links | `src/lib/memory/articleLinks.ts` | article footer linked/related memory matching. |
| Memory page payload | `src/lib/memory/pagePayload.ts` | serializable `/memory` detail drawer and client payload data. |
| Memory compatibility | `src/lib/memoryData.ts` | temporary re-export surface for existing imports. |
```

Also add `public/scripts/memory-workbench.js` to the route/page behavior section:

```md
`/memory/` browser interaction lives in `public/scripts/memory-workbench.js`;
the Astro page renders static markup and embeds the public memory payload.
```

- [ ] **Step 2: Update agent runbook memory read order**

In `docs/notes/project/agent-runbook.md`, update the `Public memory projection`
row so the confirmation column names the new files:

```md
| Public memory projection | `docs/notes/project/architecture-reference.md`, `docs/implementation/memory-second-brain.md` | `scripts/memory/schema.mjs`, `scripts/memory/project.mjs`, `src/lib/memory/`, `src/pages/memory.astro`, `public/scripts/memory-workbench.js` |
```

Add one common failure mode:

```md
- Editing `/memory` behavior in `src/pages/memory.astro` before checking the focused module under `src/lib/memory/`.
```

- [ ] **Step 3: Update implementation reference**

In `docs/implementation/memory-second-brain.md`, add a short "Code Map" section
or update the existing implementation map with:

```md
## Code Map

- `src/lib/memory/publicData.ts`: generated public JSON shape and fallback.
- `src/lib/memory/lookup.ts`: source href resolution and lookup maps.
- `src/lib/memory/graphModel.ts`: graph nodes, edges, facets, and layout metadata.
- `src/lib/memory/filters.ts`: graph filters and URL deep-link helpers.
- `src/lib/memory/articleLinks.ts`: article footer linked/related memory cards.
- `src/lib/memory/pagePayload.ts`: serializable `/memory` detail payload.
- `src/lib/memoryData.ts`: compatibility re-export for older imports.
- `public/scripts/memory-workbench.js`: progressive-enhancement browser behavior.
```

- [ ] **Step 4: Run focused memory tests**

Run:

```bash
npm run test -- src/lib/memory
npm run test -- src/lib/memoryData.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run full repo validation**

Run:

```bash
npm run validate
```

Expected: PASS, including content validation, article quality, memory validation,
Vitest, Astro check, and Astro build.

- [ ] **Step 6: Run Graphify refresh**

Run:

```bash
graphify update .
```

Expected: command exits 0. `graphify-out/` may remain ignored generated output.
Do not stage ignored generated graph files unless the repo already tracks them.

- [ ] **Step 7: Run final diff check**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Status shows only intended source, test, docs,
and public script changes.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add docs/notes/project/architecture-reference.md docs/notes/project/agent-runbook.md docs/implementation/memory-second-brain.md
git diff --cached --check
git commit -m "docs: update memory code map"
```

Expected: commit succeeds with only Task 5 docs staged.

---

## Final Acceptance Checklist

- [ ] `src/lib/memoryData.ts` is compatibility re-exports only.
- [ ] `src/lib/memory/` contains responsibility-based modules and focused tests.
- [ ] `src/pages/memory.astro` renders shell and payload without owning detail payload construction.
- [ ] `public/scripts/memory-workbench.js` owns browser interaction.
- [ ] Article memory links still use exact `/memory/?node=...` URLs.
- [ ] `/memory` ignores stale URL params and handles empty projection safely.
- [ ] `npm run test -- src/lib/memory` passes.
- [ ] `npm run test -- src/lib/memoryData.test.mjs` passes.
- [ ] `npm run validate` passes.
- [ ] `graphify update .` has been run after code changes.
- [ ] `git diff --check` passes.

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover module splitting, compatibility re-exports,
  page payload extraction, browser script isolation, URL and article behavior
  preservation. Task 5 covers documentation and Graphify closeout.
- Gap scan: every step names the concrete files, functions, commands, or code
  shape it depends on.
- Type consistency: `MemoryPublicData`, `MemoryLookup`, `MemoryGraphModel`,
  `MemoryDeepLinkState`, `ArticleMemoryLinks`, and `MemoryPagePayload` are
  produced before later tasks consume them.
