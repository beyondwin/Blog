# Content Memory Links Design

Date: 2026-07-08
Status: approved design
Scope: extend public memory links from article-only pages to all public content lanes

## Context

`beyondwin` is an Astro static publishing system built around typed MDX
collections, validation scripts, and a private-first public memory projection.

The current public memory flow is:

```text
memory/thoughts/*.md
memory/edges.jsonl
memory/sources.jsonl
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> /memory and article memory links
```

The public/private boundary is already correct: public routes read only
`src/data/memory.public.json` through memory helper modules. They must not read
or parse `memory/**` directly.

The current gap is product-level rather than correctness-level. Article detail
pages can show public memory in a footer, but analysis, review, idea, and travel
detail pages do not. The architecture already treats all public content lanes as
routeable memory sources:

- `src/content/articles/` -> `/articles/`
- `src/content/analysis/` -> `/analysis/`
- `src/content/ideas/` -> `/ideas/`
- `src/content/reviews/` -> `/reviews/`
- `src/content/travel/` -> `/travel/`

This means memory reuse is available in the projection model but exposed only on
one reading surface.

## Goals

- Extend memory footer support from articles to analysis, reviews, ideas, and
  travel notes.
- Generalize the article-specific helper into a content-neutral helper.
- Preserve the existing article footer behavior and matching rules.
- Keep memory links quiet: render the footer only when matching public memory
  exists.
- Keep the implementation static and public-projection-only.
- Add focused tests that make the matching behavior safe to reuse across lanes.

## Non-Goals

- Do not change public memory projection eligibility.
- Do not expose private memory source files to any route or layout.
- Do not redesign the `/memory/` workbench.
- Do not add runtime recommendation, embeddings, search indexing, or server
  behavior.
- Do not create a new content lane.
- Do not change source-grounded article quality rules.
- Do not force memory blocks onto pages with no relevant public thoughts.

## User Experience

Every public content detail page keeps its current reading flow. After the main
MDX body, the page renders a compact memory footer only when public memory is
linked or related.

The footer remains secondary to the content. It is not a hero, sidebar takeover,
or recommendation feed. It should feel like a useful closing note:

- direct source matches appear as `Linked memory`,
- tag/topic fallback matches appear as `Related memory`,
- each item links to the corresponding `/memory/?node=...` deep link,
- the footer links back to the full `/memory/` surface,
- no block appears when there are no matching thoughts.

The visible section title should stay close to the current article wording:
`이 기록에서 이어지는 판단`. This works across articles, analysis, reviews,
ideas, and travel notes without making every lane sound technical.

## Matching Rules

The generalized helper receives:

- normalized `MemoryPublicData`,
- the current content source path, such as
  `src/content/reviews/black-swan.mdx`,
- the content tags,
- an optional result limit.

The helper returns render-ready `linked` and `related` groups.

### Linked Memory

A thought is linked when:

1. A memory source has `path` exactly equal to the current content source path.
2. The thought's `sources` array contains that source id.

Linked memory has highest priority because it represents an explicit source
relationship in the public projection.

### Related Memory

A thought is related when:

1. It was not already included as linked memory.
2. At least one content tag matches at least one memory topic.

Tag/topic matching is case-insensitive exact equality after normalization. It
must not use substring matching, fuzzy matching, or inferred semantic expansion
in this version.

### Ordering And Limits

- Linked thoughts appear before related thoughts.
- Related thoughts sort by the number of matching tags/topics, descending.
- Ties preserve the projection order from `memory.thoughts`.
- The total result is capped at four thoughts by default.
- If linked thoughts fill the cap, no related fallback thoughts are shown.

## Architecture

The article-specific concept should become content-neutral while keeping the
existing public import surface stable.

Target module shape:

```text
src/lib/memory/
  contentLinks.ts   # lane-neutral content -> memory matching
  articleLinks.ts   # compatibility wrapper that delegates to contentLinks.ts
  index.ts          # exports the public memory helper surface

src/lib/memoryData.ts
  # compatibility re-export for existing imports
```

`contentLinks.ts` owns matching and render-model construction. It should not
know about Astro rendering or layout classes.

The detail routes own lane-specific source path construction:

```text
src/content/<collection>/<slug>.mdx
```

The layout owns presentation through a shared Astro component. Extract the
existing footer markup into a component such as `ContentMemoryLinks.astro` and
use it from `ArticleLayout.astro`, `AnalysisLayout.astro`, and
`ReviewLayout.astro`. The component receives only the render model and does not
load memory data itself.

## Data Contract

The public render model should use content-neutral names:

```ts
interface ContentMemoryLink {
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

interface ContentMemoryLinks {
  linked: ContentMemoryLink[];
  related: ContentMemoryLink[];
  total: number;
}
```

The helper should expose:

```ts
findContentMemoryLinks(
  memory: MemoryPublicData,
  sourcePath: string,
  tags?: string[],
  limit?: number,
): ContentMemoryLinks
```

Compatibility remains for existing imports:

```ts
findArticleMemoryLinks(...)
```

The compatibility function delegates to `findContentMemoryLinks()` so behavior
cannot drift.

## Data Flow

Each detail route follows the same pattern:

1. Load public memory with `loadPublicMemoryData()`.
2. Build the source path for the current collection entry.
3. Call `findContentMemoryLinks(memory, sourcePath, entry.data.tags)`.
4. Pass the result into the layout, which forwards it to the shared footer
   component.
5. Render no footer when `total === 0`.

The page must not query `memory/thoughts`, `memory/edges.jsonl`, or
`memory/sources.jsonl` directly.

## Layout Responsibilities

The footer should have one owner. The preferred owner is a shared component,
because article, analysis, and review layouts currently differ.

The component should:

- render a wrapping `aside` only when `total > 0`,
- show `Linked memory` only when linked thoughts exist,
- show `Related memory` only when related thoughts exist,
- use each thought's `memoryHref`,
- keep focusable links and readable text wrapping,
- avoid nested cards and large decorative UI.

The component should not:

- load memory data,
- infer source paths,
- decide matching rules,
- render private source paths.

## Error Handling

- Empty public memory data returns `{ linked: [], related: [], total: 0 }`.
- A missing or empty source path skips linked matching and allows tag fallback.
- Missing or empty tags produce linked-only results.
- Unknown source ids cannot produce linked memory. The same thought can still
  be related by topic when its public topics match the content tags.
- Invalid public projection shape should continue to be normalized by
  `normalizeMemoryData()` before matching.
- A page with no matching public thoughts renders exactly like it does today.

## Accessibility And Design Constraints

- The memory footer appears after the content body in normal document flow.
- All memory items are normal links with visible focus behavior.
- Text wraps on mobile and does not rely on fixed-height cards.
- The design remains quiet and reading-first.
- The footer must not use gradients, decorative blobs, nested cards, or a
  marketing-style recommendation section.
- The component should reuse existing `.article-memory` styles unless a small
  class rename improves clarity without broad CSS churn.

## Tests

Add focused tests for the generalized helper:

- exact source path matching works for at least one non-article lane,
- article behavior remains compatible with the previous helper,
- tag/topic fallback is case-insensitive,
- linked thoughts are not duplicated in related results,
- total results are capped at four,
- empty memory returns no links,
- missing source path still allows tag fallback,
- related ties preserve projection order.

If a shared component is extracted, Astro build coverage is enough for this
iteration; browser automation is not required unless the implementation changes
visible interaction.

## Verification

Minimum implementation verification:

```bash
npm run test
npm run validate
graphify update .
```

Because this changes code files, `graphify update .` is required after
implementation. `graphify-out/` is generated navigation and should remain
unstaged unless the repository policy changes.

Manual route checks should include:

- one article with existing memory links,
- one non-article page with direct or tag-related memory,
- one page with no memory links to confirm the footer stays hidden.

## Rollout Plan

This is a single bounded feature. It should not be split into separate
subprojects unless implementation reveals layout duplication that cannot be
handled with a small shared component.

Recommended implementation sequence:

1. Add `contentLinks.ts` and compatibility exports.
2. Move or extend tests from article-only matching to content matching.
3. Extract the shared footer component.
4. Wire all detail routes to the helper.
5. Update project docs that describe article-only memory links.
6. Run the verification gate.

## Future Extensions

After this lands, later work can improve ranking with memory edge structure,
show memory topic entry points on index pages, or make `/memory/` highlight the
origin content lane. Those are intentionally outside this version.
