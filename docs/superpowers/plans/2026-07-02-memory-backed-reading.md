# Memory-Backed Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quiet article footer that surfaces directly linked and topic-related public memory thoughts after article bodies.

**Architecture:** Keep matching logic in `src/lib/memoryData.ts`, where public memory normalization and lookup already live. Article routes select related memory from `src/data/memory.public.json`, pass a small render model into `ArticleLayout`, and the layout renders a static footer when matches exist.

**Tech Stack:** Astro, TypeScript, MDX content collections, Vitest, static JSON projection, existing global CSS.

## Global Constraints

- Article pages must read only `src/data/memory.public.json`, never `memory/**` directly.
- Scope is article detail pages only; do not add this to reviews, analysis, ideas, or travel pages.
- Direct source matches use exact source path equality, such as `src/content/articles/<slug>.mdx`.
- Related fallback uses case-insensitive exact equality between article tags and memory topics.
- The total footer result is capped at four thoughts.
- The UI must stay visually secondary to the prose and avoid hero, gradient, nested card, or heavy marketing patterns.
- Run `graphify update .` after code changes.

---

## File Structure

Modify these files:

| File | Responsibility |
| --- | --- |
| `src/lib/memoryData.test.mjs` | Unit tests for article-memory matching behavior. |
| `src/lib/memoryData.ts` | Export `findArticleMemoryLinks()` and render model types. |
| `src/pages/articles/[slug].astro` | Load public memory and pass article-specific related memory to the layout. |
| `src/layouts/ArticleLayout.astro` | Render the optional article memory footer after the MDX body. |
| `src/styles/global.css` | Add quiet, responsive footer styles using existing design tokens. |

No new runtime dependency is needed.

---

### Task 1: Article Memory Helper

**Files:**
- Modify: `src/lib/memoryData.test.mjs`
- Modify: `src/lib/memoryData.ts`

**Interfaces:**
- Consumes: `MemoryPublicData`, `MemoryThought`, `MemorySource`.
- Produces:
  - `ArticleMemoryLink`
  - `ArticleMemoryLinks`
  - `findArticleMemoryLinks(memory: MemoryPublicData, articlePath: string, articleTags?: string[], limit?: number): ArticleMemoryLinks`

- [ ] **Step 1: Add the helper import to the test file**

In `src/lib/memoryData.test.mjs`, update the import block to include `findArticleMemoryLinks`:

```js
import { describe, expect, it } from 'vitest';
import {
  buildMemoryLookup,
  emptyMemoryData,
  findArticleMemoryLinks,
  normalizeMemoryData,
  resolveMemorySourceHref,
} from './memoryData.ts';
```

- [ ] **Step 2: Add focused failing tests**

Append these tests inside the existing `describe('memory data helpers', () => { ... })` block in `src/lib/memoryData.test.mjs`, after the current final test:

```js
  it('finds memory directly linked to an article source path', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      [],
    );

    expect(result).toEqual({
      linked: [
        {
          slug: 'routing-problem',
          claimKo: '컨텍스트 품질은 라우팅 문제다.',
          claimEn: 'Context quality is a routing problem.',
          memoryType: 'semantic',
          topics: ['ai-workflow'],
          sourceCount: 2,
          matchCount: 0,
        },
      ],
      related: [],
      total: 1,
    });
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
    const memory = makeMemory({
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

  it('sorts related thoughts by match count and keeps projection order for ties', () => {
    const memory = makeMemory({
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
    });

    const result = findArticleMemoryLinks(memory, '', ['ai-workflow', 'codex']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'two-matches',
      'one-match-first',
      'one-match-second',
    ]);
  });
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: the test run fails because `findArticleMemoryLinks` is not exported from `src/lib/memoryData.ts`.

- [ ] **Step 4: Add the helper implementation**

In `src/lib/memoryData.ts`, insert this code after `buildMemoryLookup()` and before `loadPublicMemoryData()`:

```ts
export interface ArticleMemoryLink {
  slug: string;
  claimKo: string;
  claimEn: string;
  memoryType: string;
  topics: string[];
  sourceCount: number;
  matchCount: number;
}

export interface ArticleMemoryLinks {
  linked: ArticleMemoryLink[];
  related: ArticleMemoryLink[];
  total: number;
}

const defaultArticleMemoryLimit = 4;

function normalizeMemoryMatchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toArticleMemoryLink(thought: MemoryThought, matchCount: number): ArticleMemoryLink {
  return {
    slug: thought.slug,
    claimKo: thought.claimKo,
    claimEn: thought.claimEn,
    memoryType: thought.memoryType,
    topics: thought.topics,
    sourceCount: thought.sources.length,
    matchCount,
  };
}

export function findArticleMemoryLinks(
  memory: MemoryPublicData,
  articlePath: string,
  articleTags: string[] = [],
  limit = defaultArticleMemoryLimit,
): ArticleMemoryLinks {
  const boundedLimit = Math.max(0, limit);

  if (boundedLimit === 0 || memory.thoughts.length === 0) {
    return { linked: [], related: [], total: 0 };
  }

  const linkedSourceIds = new Set(
    memory.sources
      .filter((source) => articlePath && source.path === articlePath)
      .map((source) => source.id),
  );
  const linkedThoughtSlugs = new Set<string>();
  const linked: ArticleMemoryLink[] = [];

  if (linkedSourceIds.size > 0) {
    for (const thought of memory.thoughts) {
      if (!thought.sources.some((sourceId) => linkedSourceIds.has(sourceId))) {
        continue;
      }

      linkedThoughtSlugs.add(thought.slug);
      linked.push(toArticleMemoryLink(thought, 0));

      if (linked.length === boundedLimit) {
        break;
      }
    }
  }

  const remainingLimit = boundedLimit - linked.length;

  if (remainingLimit === 0) {
    return { linked, related: [], total: linked.length };
  }

  const normalizedTags = new Set(
    articleTags
      .map(normalizeMemoryMatchValue)
      .filter(Boolean),
  );

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
    .map(({ thought, matchCount }) => toArticleMemoryLink(thought, matchCount));

  return {
    linked,
    related,
    total: linked.length + related.length,
  };
}
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: PASS, including the new article-memory helper tests.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/lib/memoryData.ts src/lib/memoryData.test.mjs
git commit -m "feat: add article memory matching helper"
```

Expected: commit succeeds with only the helper and test files staged.

---

### Task 2: Article Route And Layout Rendering

**Files:**
- Modify: `src/pages/articles/[slug].astro`
- Modify: `src/layouts/ArticleLayout.astro`

**Interfaces:**
- Consumes: `findArticleMemoryLinks()` and `ArticleMemoryLinks` from Task 1.
- Produces: `ArticleLayout` accepts `relatedMemory?: ArticleMemoryLinks` and renders a footer when `relatedMemory.total > 0`.

- [ ] **Step 1: Update the article route to prepare related memory**

Replace `src/pages/articles/[slug].astro` with:

```astro
---
import { getCollection, render } from 'astro:content';
import Callout from '../../components/Callout.astro';
import ArticleLayout from '../../layouts/ArticleLayout.astro';
import { findArticleMemoryLinks, loadPublicMemoryData } from '../../lib/memoryData';

export async function getStaticPaths() {
  const entries = await getCollection('articles', ({ data }) => !data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const articleMemory = findArticleMemoryLinks(
  loadPublicMemoryData(),
  `src/content/articles/${entry.id}.mdx`,
  entry.data.tags,
);
---

<ArticleLayout entry={entry} relatedMemory={articleMemory}>
  <Content components={{ Callout }} />
</ArticleLayout>
```

- [ ] **Step 2: Update the article layout props and footer render**

Replace `src/layouts/ArticleLayout.astro` with:

```astro
---
import BaseLayout from './BaseLayout.astro';
import { formatDate, getEntryDate, getEntryTypeLabel } from '../lib/content';
import type { SiteEntry } from '../lib/content';
import type { ArticleMemoryLinks } from '../lib/memoryData';

interface Props {
  entry: SiteEntry;
  relatedMemory?: ArticleMemoryLinks;
}

const { entry, relatedMemory } = Astro.props;
const date = getEntryDate(entry);
const detail = entry.collection === 'travel'
  ? entry.data.location
  : entry.collection === 'ideas'
    ? entry.data.maturity
    : getEntryTypeLabel(entry);
const hasRelatedMemory = Boolean(relatedMemory && relatedMemory.total > 0);
---

<BaseLayout title={`${entry.data.title} · beyondwin`} description={entry.data.description}>
  <div class="shell article-shell">
    <article class="article-body">
      <div class="article-kicker">
        <span>{detail}</span>
        <span>{formatDate(date)}</span>
      </div>
      <h1>{entry.data.title}</h1>
      <p class="description">{entry.data.description}</p>
      {entry.data.tags.length > 0 && (
        <ul class="tag-list article-tag-list" aria-label="Tags">
          {entry.data.tags.map((tag) => <li>{tag}</li>)}
        </ul>
      )}
      <div class="prose">
        <slot />
      </div>

      {hasRelatedMemory && relatedMemory && (
        <aside class="article-memory" aria-labelledby="article-memory-title">
          <div class="article-memory__header">
            <div>
              <p>Memory</p>
              <h2 id="article-memory-title">이 글에서 이어지는 판단</h2>
            </div>
            <a href="/memory/">Memory 열기</a>
          </div>

          {relatedMemory.linked.length > 0 && (
            <section class="article-memory__group" aria-label="Linked memory">
              <h3>Linked memory</h3>
              <div class="article-memory__list">
                {relatedMemory.linked.map((thought) => (
                  <article class="article-memory__item">
                    <h4>{thought.claimKo}</h4>
                    <p>{thought.claimEn}</p>
                    <div class="article-memory__meta">
                      <span>{thought.memoryType}</span>
                      {thought.topics.map((topic) => <span>{topic}</span>)}
                      <span>{thought.sourceCount === 1 ? '1 source' : `${thought.sourceCount} sources`}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {relatedMemory.related.length > 0 && (
            <section class="article-memory__group" aria-label="Related memory">
              <h3>Related memory</h3>
              <div class="article-memory__list">
                {relatedMemory.related.map((thought) => (
                  <article class="article-memory__item">
                    <h4>{thought.claimKo}</h4>
                    <p>{thought.claimEn}</p>
                    <div class="article-memory__meta">
                      <span>{thought.memoryType}</span>
                      {thought.topics.map((topic) => <span>{topic}</span>)}
                      <span>{thought.sourceCount === 1 ? '1 source' : `${thought.sourceCount} sources`}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </aside>
      )}
    </article>
  </div>
</BaseLayout>
```

- [ ] **Step 3: Run Astro type/build check**

Run:

```bash
npm run build
```

Expected: PASS with no Astro diagnostics. The build output includes article routes and `/memory/index.html`.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add 'src/pages/articles/[slug].astro' src/layouts/ArticleLayout.astro
git commit -m "feat: render article memory footer"
```

Expected: commit succeeds with only the route and layout files staged.

---

### Task 3: Footer Styling

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: the `.article-memory*` markup from Task 2.
- Produces: responsive, quiet article footer styles using existing tokens.

- [ ] **Step 1: Add article memory footer CSS**

In `src/styles/global.css`, add this block after `.article-body .description` and before `.review-cover`:

```css
.article-memory {
  display: grid;
  gap: 18px;
  max-width: 72ch;
  margin-top: clamp(42px, 7vw, 72px);
  border-top: 1px solid var(--line);
  padding-top: 24px;
}

.article-memory__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.article-memory__header p {
  margin: 0 0 6px;
  color: var(--primary-ink);
  font-size: 12px;
  font-weight: 780;
  text-transform: uppercase;
}

.article-memory__header h2 {
  margin: 0;
  color: var(--ink-strong);
  font-size: clamp(22px, 3vw, 28px);
  line-height: 1.18;
  letter-spacing: 0;
  text-wrap: balance;
}

.article-memory__header a {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--line-strong);
  color: var(--ink-strong);
  font-size: 13px;
  font-weight: 760;
  text-decoration: none;
}

.article-memory__header a:hover {
  border-color: var(--primary);
  color: var(--primary-ink);
}

.article-memory__group {
  display: grid;
  gap: 10px;
}

.article-memory__group h3 {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 780;
  text-transform: uppercase;
}

.article-memory__list {
  display: grid;
  gap: 10px;
}

.article-memory__item {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 16px;
}

.article-memory__item h4 {
  margin: 0 0 8px;
  color: var(--ink-strong);
  font-size: 18px;
  line-height: 1.32;
  letter-spacing: 0;
  text-wrap: pretty;
}

.article-memory__item p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.58;
}

.article-memory__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.article-memory__meta span {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 720;
  padding: 5px 7px;
}
```

- [ ] **Step 2: Add the mobile adjustment**

Inside the existing `@media (max-width: 720px)` block in `src/styles/global.css`, add this rule near the other article rules:

```css
  .article-memory__header {
    flex-direction: column;
  }
```

- [ ] **Step 3: Run build to verify CSS and markup compile**

Run:

```bash
npm run build
```

Expected: PASS with no Astro diagnostics.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add src/styles/global.css
git commit -m "style: add article memory footer styles"
```

Expected: commit succeeds with only `src/styles/global.css` staged.

---

### Task 4: Final Verification And Graph Refresh

**Files:**
- Modify generated graph files under `graphify-out/` if `graphify update .` reports changes.

**Interfaces:**
- Consumes: all implementation from Tasks 1-3.
- Produces: fully verified working tree with graph refreshed after code changes.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS. The output should report all Vitest files passing.

- [ ] **Step 2: Run the full repository validation gate**

Run:

```bash
npm run validate
```

Expected: PASS. The command should complete content validation, article quality, memory validation, Vitest, Astro check, and static build.

- [ ] **Step 3: Refresh Graphify**

Run:

```bash
graphify update .
```

Expected: command exits 0. If graph files changed, inspect them and include the generated graph update in the final verification commit.

- [ ] **Step 4: Inspect a linked-memory article in the built output**

Run:

```bash
rg -n "이 글에서 이어지는 판단|Linked memory|Related memory" dist/articles
```

Expected: at least one built article route contains `이 글에서 이어지는 판단`. A route with direct source mapping should include `Linked memory`.

- [ ] **Step 5: Inspect a no-match route or fallback behavior**

Run:

```bash
rg -n "이 글에서 이어지는 판단" dist/articles/hermes-agent-persistent-worker-runtime/index.html || true
```

Expected: if this article has no exact source and no tag/topic fallback in the current projection, the command prints nothing. If it has tag/topic fallback, it prints the footer text and the page is still valid. Either outcome is acceptable as long as the helper rules explain it.

- [ ] **Step 6: Check final diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. `git status --short` shows only intended implementation files and any `graphify-out/` generated updates.

- [ ] **Step 7: Commit final verification artifacts if needed**

If `graphify update .` changed generated graph files, run:

```bash
git add graphify-out
git commit -m "chore: refresh graphify after article memory footer"
```

Expected: commit succeeds with only graph refresh files staged. If graphify changed no files, skip this commit.

- [ ] **Step 8: Report final result**

Include:

- Helper tests added and passing.
- Article footer behavior implemented.
- `npm run validate` result.
- `graphify update .` result.
- Any graph files committed or confirmation that none changed.

---

## Self-Review Notes

- Spec coverage: Tasks 1-3 cover helper, matching, article-only rendering, compact footer UI, and styling. Task 4 covers validation and graph refresh.
- Boundary: No task reads `memory/**` from public routes.
- Scope: Reviews, analysis, ideas, and travel are explicitly untouched.
- Type consistency: `ArticleMemoryLinks` is defined in Task 1 and consumed by Task 2.
