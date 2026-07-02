# Memory-Backed Reading Design

## Status

Approved for planning on 2026-07-02.

## Context

`beyondwin` already has a private-first public memory projection:

```text
memory/thoughts/*.md
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/pages/memory.astro
```

The `/memory/` route exposes public thoughts, topics, source links, and
relationships. Article pages currently do not reuse that projection. A reader
can finish an article without seeing the public memory that was extracted from
that article or related to the same topic.

This design adds a small article footer that connects published articles back
to public memory. It keeps the existing public/private boundary: article pages
read only `src/data/memory.public.json`, never `memory/**` directly.

## Goals

- Show public memory at the end of article detail pages when relevant.
- Prefer exact source links from memory projection over looser recommendations.
- Keep the article reading experience quiet and text-first.
- Add the matching logic in a reusable helper instead of embedding it in
  Astro markup.
- Make the first version small enough to verify with unit tests and the
  existing validation gate.

## Non-Goals

- Do not change the `/memory/` workbench interaction model.
- Do not expose private memory source files to public routes.
- Do not add related memory to reviews, analysis, ideas, or travel pages in
  this version.
- Do not build a full recommendation engine or graph traversal UI.
- Do not add runtime server behavior; this remains static-site rendering.

## User Experience

Article detail pages render the article normally. After the MDX body, the page
may show a compact footer block.

The block appears only when at least one public thought is relevant to the
current article. It stays visually secondary to the article body and should not
interrupt reading.

The block contains up to four thoughts. Each thought shows:

- Korean claim.
- English claim or short fallback text.
- Memory type and topic chips.
- A small source count.

The block should include a link to `/memory/` so readers can continue exploring
the full memory map. Individual thoughts do not need their own routes in this
version because `/memory/` currently owns the workbench interaction.

Suggested visible labels:

- Section title: `이 글에서 이어지는 판단`
- Directly linked group label: `Linked memory`
- Topic fallback group label: `Related memory`

If there are no matching thoughts, the layout renders no memory footer.

## Matching Rules

The matching helper receives:

- The normalized `MemoryPublicData`.
- The current article source path, such as
  `src/content/articles/hermes-agent-persistent-worker-runtime.mdx`.
- The article's tags.

The helper returns render-ready groups with `linked` and `related` thoughts.

### Linked Memory

A thought is linked when:

1. A memory source has `path` exactly equal to the current article source path.
2. The thought's `sources` array contains that source id.

Linked thoughts are highest priority.

### Related Memory

A thought is related when:

1. It was not already included as linked memory.
2. At least one article tag matches at least one memory topic.

Tag and topic matching is case-insensitive. Matching uses exact normalized
string equality, not substring matching.

### Ordering And Limits

- Linked thoughts appear before related thoughts.
- Related thoughts sort by the number of matching tags/topics, descending.
- Ties keep the projection order from `memory.thoughts`.
- The total result is capped at four thoughts.
- If linked thoughts fill the cap, no related fallback thoughts are shown.

## Architecture

Add the matching logic to `src/lib/memoryData.ts`, next to the existing public
memory normalization, source resolution, and lookup helpers.

The article route performs data selection:

1. Load public memory with `loadPublicMemoryData()`.
2. Build the article source path from the static article slug.
3. Call the new related-memory helper with article path and tags.
4. Pass the result into `ArticleLayout`.

`ArticleLayout.astro` performs rendering:

1. Render the normal article shell and MDX slot.
2. If related memory groups are non-empty, render the compact footer block.
3. Keep all markup static and accessible.

This keeps responsibilities clear:

| Module | Responsibility |
| --- | --- |
| `src/lib/memoryData.ts` | Normalize memory data and select related public thoughts. |
| `src/pages/articles/[slug].astro` | Prepare article-specific data for the layout. |
| `src/layouts/ArticleLayout.astro` | Render article content and optional memory footer. |
| `src/styles/global.css` | Style the footer in the existing quiet reading system. |

## Data Contract

The helper should expose a small render model. A concrete implementation may
name it differently, but it should contain these concepts:

```ts
interface ArticleMemoryLink {
  slug: string;
  claimKo: string;
  claimEn: string;
  memoryType: string;
  topics: string[];
  sourceCount: number;
  matchCount: number;
}

interface ArticleMemoryLinks {
  linked: ArticleMemoryLink[];
  related: ArticleMemoryLink[];
  total: number;
}
```

The render model should not expose raw private memory paths. It may include
public source counts and public thought fields from `memory.public.json`.

## Error Handling

- Empty or partial public memory data returns an empty result.
- Missing source records do not break rendering.
- Thoughts with unknown source ids can still be related by topic, but cannot be
  linked by exact source path.
- Missing article tags produce linked-only results.
- If the helper receives an empty article path, it skips linked matching and
  only evaluates tag/topic fallback.

## Accessibility And Design Constraints

- The footer must be reachable in normal document flow after the article body.
- Links and buttons must have visible focus states through existing global
  styles or new styles.
- The footer must not use a large hero, card-heavy marketing layout, gradient
  blob, or nested card pattern.
- Text must wrap cleanly on mobile.
- The block should remain visually secondary to the prose.

## Tests

Add focused tests for the helper behavior:

- Exact article source path produces `linked` memory.
- Article tag and memory topic matching is case-insensitive.
- Linked thoughts do not appear again in `related`.
- Total results are capped at four.
- Empty memory returns no links.
- Related thoughts sort by match count while preserving projection order for
  ties.

Existing tests may live in `src/lib/memoryData.test.mjs`; adding the helper
tests there keeps the memory data contract in one place.

## Verification

Minimum verification after implementation:

```bash
npm run test
npm run validate
```

Because implementation will modify code files, refresh the graph after the code
change:

```bash
graphify update .
```

For visual confidence, inspect at least one article with linked memory and one
article without linked memory. The first should show the footer, and the second
should either show topic fallback or no block.

## Future Extensions

This version is intentionally article-only. A later version can reuse the same
helper shape for reviews, analysis, ideas, or travel by passing a source path
and tags from those detail routes.

Potential later improvements:

- Deep-link from `/memory/` to a selected thought.
- Show relationship labels for linked thoughts.
- Use graph relationships for fallback ranking.
- Add a content report showing which articles have public memory links.
