# Content Memory Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing article memory footer into a content-wide memory footer for articles, analysis, reviews, ideas, and travel detail pages.

**Architecture:** Move matching into `src/lib/memory/contentLinks.ts`, keep `findArticleMemoryLinks()` as a compatibility wrapper, and render memory links through one shared Astro component. Detail routes build their own `src/content/<collection>/<slug>.mdx` source path, pass public projection data through `findContentMemoryLinks()`, and layouts render the footer only when matches exist.

**Tech Stack:** Astro, TypeScript, MDX content collections, Vitest, static JSON public memory projection, existing global CSS, Graphify.

## Global Constraints

- Public routes must read only `src/data/memory.public.json` through memory helper modules.
- Public routes must not read or parse `memory/**` directly.
- Extend memory footer support from articles to analysis, reviews, ideas, and travel notes.
- Preserve the existing article footer behavior and matching rules.
- Direct source matches use exact `source.path === sourcePath` equality.
- Related fallback uses case-insensitive exact equality between content tags and memory topics.
- The total result is capped at four thoughts by default.
- Render no footer when `total === 0`.
- Do not redesign the `/memory/` workbench.
- Do not add runtime recommendation, embeddings, search indexing, or server behavior.
- Do not create a new content lane.
- The visible section title is `이 기록에서 이어지는 판단`.
- The footer must not use gradients, decorative blobs, nested cards, or a marketing-style recommendation section.
- Run `graphify update .` after code changes.
- Keep `graphify-out/` unstaged because it is generated navigation.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/memory/contentLinks.ts` | New lane-neutral content-to-memory matching helper and render model types. |
| `src/lib/memory/contentLinks.test.mjs` | Focused tests for source matching, fallback matching, ordering, limits, and empty data. |
| `src/lib/memory/articleLinks.ts` | Compatibility wrapper that delegates to `findContentMemoryLinks()`. |
| `src/lib/memory/articleLinks.test.mjs` | Narrow compatibility test for existing article helper behavior. |
| `src/lib/memory/index.ts` | Re-export `contentLinks.ts` from the memory public helper surface. |
| `src/lib/memoryData.ts` | Re-export `contentLinks.ts` through the legacy compatibility surface. |
| `src/components/ContentMemoryLinks.astro` | Shared optional footer renderer. It receives render-model data only. |
| `src/layouts/ArticleLayout.astro` | Accept `ContentMemoryLinks` and render the shared footer for articles, ideas, and travel. |
| `src/layouts/AnalysisLayout.astro` | Accept `ContentMemoryLinks` and render the shared footer inside the main article body. |
| `src/layouts/ReviewLayout.astro` | Accept `ContentMemoryLinks` and render the shared footer after review prose. |
| `src/pages/articles/[slug].astro` | Switch to `findContentMemoryLinks()` and pass article memory to the layout. |
| `src/pages/analysis/[slug].astro` | Load public memory, build analysis source path, and pass memory links to the layout. |
| `src/pages/reviews/[slug].astro` | Load public memory, build review source path, and pass memory links to the layout. |
| `src/pages/ideas/[slug].astro` | Load public memory, build idea source path, and pass memory links to the layout. |
| `src/pages/travel/[slug].astro` | Load public memory, build travel source path, and pass memory links to the layout. |
| `docs/notes/project/architecture-reference.md` | Update memory code map and route detail behavior from article-only to content-wide. |
| `docs/implementation/memory-second-brain.md` | Update public behavior notes that mention article-only memory links. |

---

### Task 1: Lane-Neutral Memory Matching Helper

**Files:**
- Create: `src/lib/memory/contentLinks.ts`
- Create: `src/lib/memory/contentLinks.test.mjs`
- Modify: `src/lib/memory/articleLinks.ts`
- Modify: `src/lib/memory/articleLinks.test.mjs`
- Modify: `src/lib/memory/index.ts`
- Modify: `src/lib/memoryData.ts`

**Interfaces:**
- Consumes: `MemoryPublicData`, `MemoryThought`, `createMemoryNodeHref(nodeId: string): string`, `prefixedThoughtId(slug: string): string`.
- Produces:
  - `ContentMemoryLink`
  - `ContentMemoryLinks`
  - `findContentMemoryLinks(memory: MemoryPublicData, sourcePath: string, tags?: string[], limit?: number): ContentMemoryLinks`
  - compatibility aliases `ArticleMemoryLink`, `ArticleMemoryLinks`
  - compatibility function `findArticleMemoryLinks(memory: MemoryPublicData, articlePath: string, articleTags?: string[], limit?: number): ArticleMemoryLinks`

- [ ] **Step 1: Write failing content helper tests**

Create `src/lib/memory/contentLinks.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { findContentMemoryLinks } from './contentLinks.ts';
import { emptyMemoryData, normalizeMemoryData } from './publicData.ts';
import { makeMemory } from './testFixture.mjs';

describe('content memory links', () => {
  it('finds memory directly linked to a non-article source path', () => {
    const memory = normalizeMemoryData({
      ...makeMemory(),
      counts: { thoughts: 1, topics: 1, edges: 0, sources: 1 },
      thoughts: [
        {
          slug: 'reading-risk',
          claimKo: '리뷰도 나중의 판단으로 이어져야 한다.',
          claimEn: 'Reviews should become reusable judgement.',
          memoryType: 'reflective',
          origin: 'kws',
          topics: ['book'],
          theses: [],
          sources: ['review-source'],
          body: '',
          position: { x: 10, y: 20 },
        },
      ],
      topics: [
        { id: 'topic:book', slug: 'book', label: 'book', count: 1, position: { x: 1, y: 1 } },
      ],
      sources: [
        {
          id: 'review-source',
          kind: 'review',
          path: 'src/content/reviews/black-swan.mdx',
          title: 'Black Swan',
          count: 1,
        },
      ],
      edges: [],
      excluded: {},
    });

    const result = findContentMemoryLinks(memory, 'src/content/reviews/black-swan.mdx', []);

    expect(result.linked).toEqual([
      expect.objectContaining({
        slug: 'reading-risk',
        nodeId: 'thought:reading-risk',
        memoryHref: '/memory/?node=thought%3Areading-risk',
        matchCount: 0,
      }),
    ]);
    expect(result.related).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('keeps existing article direct source behavior', () => {
    const result = findContentMemoryLinks(
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

  it('falls back to case-insensitive content tag and memory topic matches', () => {
    const result = findContentMemoryLinks(makeMemory(), 'src/content/reviews/unlinked.mdx', [
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
    const result = findContentMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      ['ai-workflow'],
    );

    expect(result.linked.map((thought) => thought.slug)).toEqual(['routing-problem']);
    expect(result.related.map((thought) => thought.slug)).not.toContain('routing-problem');
    expect(result.total).toBe(1);
  });

  it('caps content memory results at four thoughts', () => {
    const memory = normalizeMemoryData({
      counts: { thoughts: 5, topics: 1, edges: 0, sources: 0 },
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

    const result = findContentMemoryLinks(memory, '', ['ai-workflow']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'thought-1',
      'thought-2',
      'thought-3',
      'thought-4',
    ]);
    expect(result.total).toBe(4);
  });

  it('returns empty content memory links for empty memory data', () => {
    expect(findContentMemoryLinks(emptyMemoryData, 'src/content/reviews/example.mdx', ['ai-workflow'])).toEqual({
      linked: [],
      related: [],
      total: 0,
    });
  });

  it('allows tag fallback when source path is missing', () => {
    const result = findContentMemoryLinks(makeMemory(), '', ['agent-workflows']);

    expect(result.linked).toEqual([]);
    expect(result.related).toEqual([
      expect.objectContaining({
        slug: 'review-gates',
        matchCount: 1,
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it('sorts related thoughts by match count and keeps projection order for ties', () => {
    const memory = normalizeMemoryData({
      counts: { thoughts: 3, topics: 3, edges: 0, sources: 0 },
      thoughts: [
        {
          slug: 'one-match-first',
          claimKo: '첫 번째 한 개 매칭',
          claimEn: 'First one-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['ai-workflow'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 1, y: 1 },
        },
        {
          slug: 'two-matches',
          claimKo: '두 개 매칭',
          claimEn: 'Two-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['ai-workflow', 'codex'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 2, y: 2 },
        },
        {
          slug: 'one-match-second',
          claimKo: '두 번째 한 개 매칭',
          claimEn: 'Second one-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['codex'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 3, y: 3 },
        },
      ],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    });

    const result = findContentMemoryLinks(memory, '', ['ai-workflow', 'codex']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'two-matches',
      'one-match-first',
      'one-match-second',
    ]);
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
npm test -- src/lib/memory/contentLinks.test.mjs
```

Expected: FAIL because `src/lib/memory/contentLinks.ts` does not exist.

- [ ] **Step 3: Add the lane-neutral helper**

Create `src/lib/memory/contentLinks.ts`:

```ts
import type { MemoryPublicData, MemoryThought } from './publicData';
import { createMemoryNodeHref } from './filters';
import { prefixedThoughtId } from './graphModel';

export interface ContentMemoryLink {
  slug: string;
  claimKo: string;
  claimEn: string;
  memoryType: string;
  nodeId: string;
  memoryHref: string;
  topics: string[];
  sourceCount: number;
  matchCount: number;
}

export interface ContentMemoryLinks {
  linked: ContentMemoryLink[];
  related: ContentMemoryLink[];
  total: number;
}

const defaultContentMemoryLimit = 4;

function normalizeMemoryMatchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toContentMemoryLink(thought: MemoryThought, matchCount: number): ContentMemoryLink {
  const nodeId = prefixedThoughtId(thought.slug);

  return {
    slug: thought.slug,
    claimKo: thought.claimKo,
    claimEn: thought.claimEn,
    memoryType: thought.memoryType,
    nodeId,
    memoryHref: createMemoryNodeHref(nodeId),
    topics: thought.topics,
    sourceCount: thought.sources.length,
    matchCount,
  };
}

export function findContentMemoryLinks(
  memory: MemoryPublicData,
  sourcePath: string,
  tags: string[] = [],
  limit = defaultContentMemoryLimit,
): ContentMemoryLinks {
  const boundedLimit = Math.max(0, limit);

  if (boundedLimit === 0 || memory.thoughts.length === 0) {
    return { linked: [], related: [], total: 0 };
  }

  const linkedSourceIds = new Set(
    memory.sources
      .filter((source) => sourcePath && source.path === sourcePath)
      .map((source) => source.id),
  );
  const linkedThoughtSlugs = new Set<string>();
  const linked: ContentMemoryLink[] = [];

  if (linkedSourceIds.size > 0) {
    for (const thought of memory.thoughts) {
      if (!thought.sources.some((sourceId) => linkedSourceIds.has(sourceId))) {
        continue;
      }

      linkedThoughtSlugs.add(thought.slug);
      linked.push(toContentMemoryLink(thought, 0));

      if (linked.length === boundedLimit) {
        break;
      }
    }
  }

  const remainingLimit = boundedLimit - linked.length;

  if (remainingLimit === 0) {
    return { linked, related: [], total: linked.length };
  }

  const normalizedTags = new Set(tags.map(normalizeMemoryMatchValue).filter(Boolean));

  if (normalizedTags.size === 0) {
    return { linked, related: [], total: linked.length };
  }

  const related = memory.thoughts
    .map((thought, index) => {
      if (linkedThoughtSlugs.has(thought.slug)) {
        return null;
      }

      const normalizedTopics = new Set(thought.topics.map(normalizeMemoryMatchValue).filter(Boolean));
      const matchCount = [...normalizedTopics].filter((topic) => normalizedTags.has(topic)).length;

      if (matchCount === 0) {
        return null;
      }

      return { thought, index, matchCount };
    })
    .filter((candidate): candidate is { thought: MemoryThought; index: number; matchCount: number } => candidate !== null)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }

      return a.index - b.index;
    })
    .slice(0, remainingLimit)
    .map(({ thought, matchCount }) => toContentMemoryLink(thought, matchCount));

  return {
    linked,
    related,
    total: linked.length + related.length,
  };
}
```

- [ ] **Step 4: Replace article-specific implementation with a compatibility wrapper**

Replace `src/lib/memory/articleLinks.ts` with:

```ts
import type { MemoryPublicData } from './publicData';
import {
  findContentMemoryLinks,
  type ContentMemoryLink,
  type ContentMemoryLinks,
} from './contentLinks';

export type ArticleMemoryLink = ContentMemoryLink;
export type ArticleMemoryLinks = ContentMemoryLinks;

export function findArticleMemoryLinks(
  memory: MemoryPublicData,
  articlePath: string,
  articleTags: string[] = [],
  limit?: number,
): ArticleMemoryLinks {
  return findContentMemoryLinks(memory, articlePath, articleTags, limit);
}
```

- [ ] **Step 5: Add exports**

Modify `src/lib/memory/index.ts` so it includes `contentLinks`:

```ts
export * from './publicData';
export * from './lookup';
export * from './graphModel';
export * from './filters';
export * from './contentLinks';
export * from './articleLinks';
export * from './pagePayload';
```

Modify `src/lib/memoryData.ts` so it includes `contentLinks`:

```ts
export * from './memory/publicData';
export * from './memory/lookup';
export * from './memory/graphModel';
export * from './memory/filters';
export * from './memory/contentLinks';
export * from './memory/articleLinks';
export * from './memory/pagePayload';
```

- [ ] **Step 6: Reduce article helper tests to compatibility coverage**

Replace `src/lib/memory/articleLinks.test.mjs` with:

```js
import { describe, expect, it } from 'vitest';
import { findArticleMemoryLinks } from './articleLinks.ts';
import { findContentMemoryLinks } from './contentLinks.ts';
import { makeMemory } from './testFixture.mjs';

describe('article memory links compatibility', () => {
  it('delegates article memory matching to the content memory helper', () => {
    const memory = makeMemory();
    const articlePath = 'src/content/articles/context-refinement-system-design.mdx';
    const tags = ['ai-workflow'];

    expect(findArticleMemoryLinks(memory, articlePath, tags)).toEqual(
      findContentMemoryLinks(memory, articlePath, tags),
    );
  });
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/lib/memory/contentLinks.test.mjs src/lib/memory/articleLinks.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add src/lib/memory/contentLinks.ts src/lib/memory/contentLinks.test.mjs src/lib/memory/articleLinks.ts src/lib/memory/articleLinks.test.mjs src/lib/memory/index.ts src/lib/memoryData.ts
git commit -m "refactor: generalize content memory links"
```

Expected: commit succeeds.

---

### Task 2: Shared Content Memory Footer Component

**Files:**
- Create: `src/components/ContentMemoryLinks.astro`
- Modify: `src/layouts/ArticleLayout.astro`
- Modify: `src/layouts/AnalysisLayout.astro`
- Modify: `src/layouts/ReviewLayout.astro`

**Interfaces:**
- Consumes: `ContentMemoryLinks` from `../lib/memoryData`.
- Produces:
  - `ContentMemoryLinks.astro` component with props `{ memory?: ContentMemoryLinks }`
  - `ArticleLayout`, `AnalysisLayout`, and `ReviewLayout` props accept `relatedMemory?: ContentMemoryLinks`

**Spec Refs:** S1, S1.11, S1.5.1

- [ ] **Step 1: Create the shared footer component**

Create `src/components/ContentMemoryLinks.astro`:

```astro
---
import type { ContentMemoryLinks } from '../lib/memoryData';

interface Props {
  memory?: ContentMemoryLinks;
}

const { memory } = Astro.props;
const hasMemory = Boolean(memory && memory.total > 0);
const memoryHref = memory?.linked[0]?.memoryHref ?? memory?.related[0]?.memoryHref ?? '/memory/';
---

{hasMemory && memory && (
  <aside class="article-memory" aria-labelledby="content-memory-title">
    <div class="article-memory__header">
      <div>
        <p>Memory</p>
        <h2 id="content-memory-title">이 기록에서 이어지는 판단</h2>
      </div>
      <a href={memoryHref}>Memory 열기</a>
    </div>

    {memory.linked.length > 0 && (
      <section class="article-memory__group" aria-label="Linked memory">
        <h3>Linked memory</h3>
        <div class="article-memory__list">
          {memory.linked.map((thought) => (
            <a class="article-memory__item" href={thought.memoryHref}>
              <h4>{thought.claimKo}</h4>
              <p>{thought.claimEn}</p>
              <div class="article-memory__meta">
                <span>{thought.memoryType}</span>
                {thought.topics.map((topic) => <span>{topic}</span>)}
                <span>{thought.sourceCount === 1 ? '1 source' : `${thought.sourceCount} sources`}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    )}

    {memory.related.length > 0 && (
      <section class="article-memory__group" aria-label="Related memory">
        <h3>Related memory</h3>
        <div class="article-memory__list">
          {memory.related.map((thought) => (
            <a class="article-memory__item" href={thought.memoryHref}>
              <h4>{thought.claimKo}</h4>
              <p>{thought.claimEn}</p>
              <div class="article-memory__meta">
                <span>{thought.memoryType}</span>
                {thought.topics.map((topic) => <span>{topic}</span>)}
                <span>{thought.sourceCount === 1 ? '1 source' : `${thought.sourceCount} sources`}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    )}
  </aside>
)}
```

- [ ] **Step 2: Update `ArticleLayout.astro` to use the shared component**

Modify the frontmatter imports and props in `src/layouts/ArticleLayout.astro`:

```astro
---
import ContentMemoryLinks from '../components/ContentMemoryLinks.astro';
import BaseLayout from './BaseLayout.astro';
import { formatDate, getEntryDate, getEntryTypeLabel } from '../lib/content';
import type { SiteEntry } from '../lib/content';
import type { ContentMemoryLinks as ContentMemoryLinksModel } from '../lib/memoryData';

interface Props {
  entry: SiteEntry;
  relatedMemory?: ContentMemoryLinksModel;
}

const { entry, relatedMemory } = Astro.props;
const date = getEntryDate(entry);
const detail = entry.collection === 'travel'
  ? entry.data.location
  : entry.collection === 'ideas'
    ? entry.data.maturity
    : getEntryTypeLabel(entry);
---
```

Replace the existing inline `{hasRelatedMemory && relatedMemory && (...)}` footer block with:

```astro
      <ContentMemoryLinks memory={relatedMemory} />
```

- [ ] **Step 3: Update `AnalysisLayout.astro` to accept and render memory links**

Modify `src/layouts/AnalysisLayout.astro` frontmatter:

```astro
---
import type { CollectionEntry } from 'astro:content';
import ContentMemoryLinks from '../components/ContentMemoryLinks.astro';
import SourcePanel from '../components/SourcePanel.astro';
import TableOfContents from '../components/TableOfContents.astro';
import BaseLayout from './BaseLayout.astro';
import { formatDate, getEntryDate } from '../lib/content';
import type { ContentMemoryLinks as ContentMemoryLinksModel } from '../lib/memoryData';

interface Props {
  entry: CollectionEntry<'analysis'>;
  relatedMemory?: ContentMemoryLinksModel;
}

const { entry, relatedMemory } = Astro.props;
const date = getEntryDate(entry);
const tocItems = [
  { href: '#summary', label: 'Summary' },
  { href: '#core-argument', label: 'Core argument' },
  { href: '#counterpoints', label: 'Counterpoints' },
  { href: '#takeaways', label: 'Takeaways' },
];
---
```

Add the footer after the prose slot inside the `<article>`:

```astro
      <div class="prose">
        <slot />
      </div>
      <ContentMemoryLinks memory={relatedMemory} />
```

- [ ] **Step 4: Update `ReviewLayout.astro` to accept and render memory links**

Modify `src/layouts/ReviewLayout.astro` frontmatter:

```astro
---
import type { CollectionEntry } from 'astro:content';
import ContentMemoryLinks from '../components/ContentMemoryLinks.astro';
import BaseLayout from './BaseLayout.astro';
import { formatDate, getEntryDate } from '../lib/content';
import type { ContentMemoryLinks as ContentMemoryLinksModel } from '../lib/memoryData';

interface Props {
  entry: CollectionEntry<'reviews'>;
  relatedMemory?: ContentMemoryLinksModel;
}

const { entry, relatedMemory } = Astro.props;
const date = getEntryDate(entry);
---
```

Add the footer after the prose slot inside the `<article>`:

```astro
      <div class="prose">
        <slot />
      </div>
      <ContentMemoryLinks memory={relatedMemory} />
```

- [ ] **Step 5: Run build diagnostics**

Run:

```bash
npm run build
```

Expected: PASS with `0 errors`.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/ContentMemoryLinks.astro src/layouts/ArticleLayout.astro src/layouts/AnalysisLayout.astro src/layouts/ReviewLayout.astro
git commit -m "refactor: share content memory footer"
```

Expected: commit succeeds.

---

### Task 3: Wire All Detail Routes To Content Memory

**Files:**
- Modify: `src/pages/articles/[slug].astro`
- Modify: `src/pages/analysis/[slug].astro`
- Modify: `src/pages/reviews/[slug].astro`
- Modify: `src/pages/ideas/[slug].astro`
- Modify: `src/pages/travel/[slug].astro`

**Interfaces:**
- Consumes: `findContentMemoryLinks(memory, sourcePath, tags)`, `loadPublicMemoryData()`.
- Produces: all public content detail routes pass `relatedMemory` into their layout.

**Spec Refs:** S1, S1.11, S1.5.1

- [ ] **Step 1: Update article detail route to use the content helper**

Modify `src/pages/articles/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import ArticleLayout from '../../layouts/ArticleLayout.astro';
import { findContentMemoryLinks, loadPublicMemoryData } from '../../lib/memory';

export async function getStaticPaths() {
  const entries = await getCollection('articles', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const relatedMemory = findContentMemoryLinks(
  loadPublicMemoryData(),
  `src/content/articles/${entry.id}.mdx`,
  entry.data.tags,
);
---

<ArticleLayout entry={entry} relatedMemory={relatedMemory}>
  <Content components={{ Callout }} />
</ArticleLayout>
```

- [ ] **Step 2: Update analysis detail route**

Modify `src/pages/analysis/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import AnalysisLayout from '../../layouts/AnalysisLayout.astro';
import { findContentMemoryLinks, loadPublicMemoryData } from '../../lib/memory';

export async function getStaticPaths() {
  const entries = await getCollection('analysis', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const relatedMemory = findContentMemoryLinks(
  loadPublicMemoryData(),
  `src/content/analysis/${entry.id}.mdx`,
  entry.data.tags,
);
---

<AnalysisLayout entry={entry} relatedMemory={relatedMemory}>
  <Content components={{ Callout }} />
</AnalysisLayout>
```

- [ ] **Step 3: Update review detail route**

Modify `src/pages/reviews/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import ReviewLayout from '../../layouts/ReviewLayout.astro';
import { findContentMemoryLinks, loadPublicMemoryData } from '../../lib/memory';

export async function getStaticPaths() {
  const entries = await getCollection('reviews', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const relatedMemory = findContentMemoryLinks(
  loadPublicMemoryData(),
  `src/content/reviews/${entry.id}.mdx`,
  entry.data.tags,
);
---

<ReviewLayout entry={entry} relatedMemory={relatedMemory}>
  <Content components={{ Callout }} />
</ReviewLayout>
```

- [ ] **Step 4: Update idea detail route**

Modify `src/pages/ideas/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import ArticleLayout from '../../layouts/ArticleLayout.astro';
import { findContentMemoryLinks, loadPublicMemoryData } from '../../lib/memory';

export async function getStaticPaths() {
  const entries = await getCollection('ideas', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const relatedMemory = findContentMemoryLinks(
  loadPublicMemoryData(),
  `src/content/ideas/${entry.id}.mdx`,
  entry.data.tags,
);
---

<ArticleLayout entry={entry} relatedMemory={relatedMemory}>
  <Content components={{ Callout }} />
</ArticleLayout>
```

- [ ] **Step 5: Update travel detail route**

Modify `src/pages/travel/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import ArticleLayout from '../../layouts/ArticleLayout.astro';
import { findContentMemoryLinks, loadPublicMemoryData } from '../../lib/memory';

export async function getStaticPaths() {
  const entries = await getCollection('travel', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const relatedMemory = findContentMemoryLinks(
  loadPublicMemoryData(),
  `src/content/travel/${entry.id}.mdx`,
  entry.data.tags,
);
---

<ArticleLayout entry={entry} relatedMemory={relatedMemory}>
  <Content components={{ Callout }} />
</ArticleLayout>
```

- [ ] **Step 6: Run validation**

Run:

```bash
npm run validate
```

Expected: PASS with content validation, article quality, memory validation, Vitest, Astro check, and static build all passing.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add 'src/pages/articles/[slug].astro' 'src/pages/analysis/[slug].astro' 'src/pages/reviews/[slug].astro' 'src/pages/ideas/[slug].astro' 'src/pages/travel/[slug].astro'
git commit -m "feat: show memory links across content lanes"
```

Expected: commit succeeds.

---

### Task 4: Documentation And Final Verification

**Files:**
- Modify: `docs/notes/project/architecture-reference.md`
- Modify: `docs/implementation/memory-second-brain.md`

**Interfaces:**
- Consumes: implementation from Tasks 1-3.
- Produces: documentation that describes content-wide memory links and final verification evidence.

- [ ] **Step 1: Update architecture memory code map**

In `docs/notes/project/architecture-reference.md`, replace the Runtime Stack row for memory article links with this row:


```md
| Memory content links | `src/lib/memory/contentLinks.ts` | public content footer linked/related memory matching. |
```

In the Memory Code Map table, replace the memory article links row with these rows:

```md
| Memory content links | `src/lib/memory/contentLinks.ts` | public content footer linked/related memory matching. |
| Memory article compatibility | `src/lib/memory/articleLinks.ts` | compatibility wrapper for article-memory imports. |
```

After the routeable source prefix table, add this paragraph:

```md
Published detail pages in `articles`, `analysis`, `reviews`, `ideas`, and
`travel` can render a public memory footer. The footer uses
`findContentMemoryLinks()` against `src/data/memory.public.json`; direct links
come from exact source path matches, and related links come from tag/topic
matches. Detail pages do not read `memory/**` directly.
```

- [ ] **Step 2: Update memory implementation reference**

In `docs/implementation/memory-second-brain.md`, update the public page behavior
or module responsibility section so it includes these exact code map entries:

```md
`src/lib/memory/contentLinks.ts`
:: Matches any public content source path and tags against the public memory
projection. It returns linked and related thoughts for detail-page footers
without reading `memory/**` directly.

`src/lib/memory/articleLinks.ts`
:: Compatibility wrapper for existing article-memory imports. New route work
should use `findContentMemoryLinks()`.
```

In the `src/lib/memory/` file responsibility paragraph, use this sentence:

```md
Responsibility-based public memory modules for data normalization, lookup,
graph derivation, filters, content links, article compatibility, and page
payloads.
```

In the runtime flow text that currently ends at the memory page, keep the
existing `/memory` flow and add this sentence immediately after it:

```md
The same public projection also feeds content detail footers through
`findContentMemoryLinks()`.
```

- [ ] **Step 3: Run docs diff check**

Run:

```bash
git diff --check -- docs/notes/project/architecture-reference.md docs/implementation/memory-second-brain.md
```

Expected: no output.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run validate
graphify update .
git status --short --ignored
```

Expected:

- `npm run validate` passes.
- `graphify update .` completes.
- `git status --short --ignored` shows only intended tracked documentation/code changes plus ignored generated artifacts, including `graphify-out/` when Graphify touched it.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add docs/notes/project/architecture-reference.md docs/implementation/memory-second-brain.md
git commit -m "docs: document content memory links"
```

Expected: commit succeeds.

---

## Plan Self-Review

Spec coverage:

- Content-wide memory footer support is implemented by Tasks 2 and 3.
- Lane-neutral helper and compatibility wrapper are implemented by Task 1.
- Public projection boundary is enforced by route steps that use `loadPublicMemoryData()` and by documentation in Task 4.
- Matching, ordering, limits, empty data, missing source path, and tie behavior are covered by Task 1 tests.
- Shared footer ownership and quiet rendering are covered by Task 2.
- Documentation updates and final Graphify refresh are covered by Task 4.

Placeholder scan:

- The plan contains no forbidden placeholder markers or unspecified validation steps.
- Every code-changing step includes the concrete code or exact replacement content.
- Every verification step includes exact commands and expected results.

Type consistency:

- `ContentMemoryLink`, `ContentMemoryLinks`, and `findContentMemoryLinks()` are defined in Task 1 and consumed by Tasks 2 and 3.
- `ArticleMemoryLink`, `ArticleMemoryLinks`, and `findArticleMemoryLinks()` remain available through the compatibility wrapper.
- Layout props consistently use `relatedMemory?: ContentMemoryLinksModel`.
