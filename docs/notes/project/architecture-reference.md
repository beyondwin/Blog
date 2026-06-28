# Project Architecture Reference

`beyondwin` is a personal publishing system implemented as a static Astro site
with typed MDX collections, script-based content validation, and a reviewed
memory projection.

## Runtime Stack

| Layer | File | Responsibility |
| --- | --- | --- |
| Astro config | `astro.config.mjs` | Astro site configuration. |
| Content schemas | `src/content.config.ts` | Typed collection frontmatter contracts. |
| Pages | `src/pages/` | Static routes and collection detail routes. |
| Layouts | `src/layouts/` | Shared page shells for base pages, articles, analysis, and reviews. |
| Components | `src/components/` | Reusable visual units such as header, cards, badges, callouts, source panels, and table of contents. |
| Content helpers | `src/lib/content.ts` | Collection metadata, sorting, dates, links, tags, and home sections. |
| Memory loader | `src/lib/memoryData.ts` | Normalizes generated public memory JSON for Astro pages. |
| Global styles | `src/styles/global.css` | Design tokens, layout, prose, component, and responsive rules. |
| Content files | `src/content/` | Public MDX source for articles, reviews, ideas, travel notes, and analysis. |
| Public memory source | `memory/` | Reviewed public thoughts, edges, and source files. Private drafts must stay out of Git. |
| Docs library | `docs/` | Archive docs, curated notes, source captures, metadata, and generated navigation placeholders. |

## Content Collections

All collections share:

| Field | Type | Constraint |
| --- | --- | --- |
| `title` | string | Required, non-empty. |
| `description` | string | Required, non-empty. |
| `createdAt` | date | Coerced by Astro/Zod. |
| `updatedAt` | date | Coerced by Astro/Zod. |
| `tags` | string array | Defaults to `[]`; every item must be non-empty. |
| `status` | enum | `review`, `published`, or `archived`; defaults to `review`. |
| `draft` | boolean | Defaults to `false`; draft entries are excluded from route output. |

### `analysis`

Path: `src/content/analysis/`

Extra fields:

| Field | Type | Constraint |
| --- | --- | --- |
| `sourceUrl` | URL | Required. |
| `sourceTitle` | string | Required, non-empty. |
| `comment` | string | Required, non-empty. |
| `format` | enum | `research-report`, `essay`, or `visual-page`. |

### `articles`

Path: `src/content/articles/`

No extra fields beyond the shared fields. Articles tagged `source-grounded`
must also pass the article quality gate.

### `ideas`

Path: `src/content/ideas/`

Extra field:

| Field | Type | Constraint |
| --- | --- | --- |
| `maturity` | enum | `seed`, `sketch`, or `proposal`; defaults to `sketch`. |

### `reviews`

Path: `src/content/reviews/`

Extra fields:

| Field | Type | Constraint |
| --- | --- | --- |
| `itemType` | enum | `book`, `article`, `tool`, `course`, or `other`. |
| `itemTitle` | string | Required, non-empty. |
| `itemAuthor` | string | Optional. |
| `rating` | number | Optional, 0 through 5. |
| `completedAt` | date | Optional; used as the display date when present. |
| `sourceUrl` | URL | Optional. |
| `coverImage` | URL | Optional. |

### `travel`

Path: `src/content/travel/`

Extra fields:

| Field | Type | Constraint |
| --- | --- | --- |
| `location` | string | Required, non-empty. |
| `visitedAt` | date | Optional; used as the display date when present. |

## Route Map

| Route | Source | Behavior |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | Home article desk, featured entry, start-here list, lane index, topic rack, latest entries, and memory count. |
| `/articles/` | `src/pages/articles/index.astro` | Article collection listing. |
| `/articles/[slug]/` | `src/pages/articles/[slug].astro` | Static detail pages for non-draft article entries. |
| `/analysis/` | `src/pages/analysis/index.astro` | Analysis collection listing. |
| `/analysis/[slug]/` | `src/pages/analysis/[slug].astro` | Static detail pages for non-draft analysis entries. |
| `/reviews/` | `src/pages/reviews/index.astro` | Review collection listing. |
| `/reviews/[slug]/` | `src/pages/reviews/[slug].astro` | Static detail pages for non-draft review entries. |
| `/ideas/` | `src/pages/ideas/index.astro` | Idea collection listing. |
| `/ideas/[slug]/` | `src/pages/ideas/[slug].astro` | Static detail pages for non-draft idea entries. |
| `/travel/` | `src/pages/travel/index.astro` | Travel collection listing. |
| `/travel/[slug]/` | `src/pages/travel/[slug].astro` | Static detail pages for non-draft travel entries. |
| `/tags/` | `src/pages/tags/index.astro` | Tag index from all public content. |
| `/tags/[tag]/` | `src/pages/tags/[tag].astro` | Tag-filtered public content listing. |
| `/memory/` | `src/pages/memory.astro` | Public memory workbench, library, and sources view from generated JSON. |

## Content Helper Contracts

`src/lib/content.ts` owns route-agnostic content behavior:

- `collectionMeta` defines labels, nav labels, descriptions, and collection hrefs.
- `primaryCollections` is `articles`, `reviews`, `ideas`, and `travel`.
- `getEntryDate(entry)` returns `completedAt` for reviews, `visitedAt` for
  travel, and `createdAt` otherwise.
- `getEntryHref(entry)` returns `/${entry.collection}/${entry.id}/`.
- `getEntryTypeLabel(entry)` converts analysis formats to title-case labels and
  otherwise uses the collection label.
- `formatDate(date)` formats dates with Korean locale.
- `estimateReadingMinutes(text)` uses 260 words per minute and never returns
  less than 1.
- `getContentByCollection(collection)` filters out drafts and sorts newest
  first by `getEntryDate`.
- `getAllContent()` merges all collections and sorts newest first.
- `getHomeSections()` returns each collection separately for the home page.
- `getAllTags()` returns unique tags from public content sorted by locale.

## Memory Projection Contract

Public source:

- `memory/thoughts/*.md`
- `memory/edges.jsonl`
- `memory/sources.jsonl`
- local `memory/review/*.jsonl` review drafts are ignored and should not be committed

Public projection:

- `src/data/memory.public.json`

The public page reads only the generated projection through
`src/lib/memoryData.ts`. Do not commit private memory drafts to the public repo.

### Thought Eligibility

A thought is exported only when:

- `schema_version` is `1`.
- `confidentiality` is `public`.
- `surfaces` includes `memory-public`.
- `review.status` is `accepted`.
- `sources` is non-empty.
- local source paths are safe relative paths and resolve inside the repo.
- external source URLs use `http` or `https`.

### Allowed Memory Values

| Field | Allowed values |
| --- | --- |
| `memory_type` | `semantic`, `procedural`, `reflective`, `episodic` |
| `origin` | `kws`, `external`, `synthesized` |
| `confidentiality` | `private`, `public` |
| `review.status` | `candidate`, `accepted`, `needs_review`, `rejected` |
| edge `type` | `supports`, `extends`, `instantiates`, `refines`, `contradicts`, `related`, `topic-tag`, `thesis-tag` |

## Script Reference

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run dev` | `astro dev` | Start local Astro dev server. |
| `npm run build` | `astro check && astro build` | Type-check and build the static site. |
| `npm run preview` | `astro preview` | Preview the built site. |
| `npm test` | `vitest run` | Run all tests. |
| `npm run sync` | `node scripts/sync.mjs` | Sync workflow entry point. |
| `npm run article:new` | `node scripts/create-article-packet.mjs` | Create an evidence packet and article draft. |
| `npm run article:quality` | `node scripts/article-quality.mjs` | Validate source-grounded article shape. |
| `npm run memory:seed` | `node scripts/memory/seed.mjs` | Generate memory review candidates. |
| `npm run memory:project` | `node scripts/memory/project.mjs` | Generate `src/data/memory.public.json`. |
| `npm run memory:validate` | `node scripts/memory/project.mjs --validate` | Validate public memory projection without rewriting JSON. |
| `npm run validate` | chained command | Run content validation, article quality, memory validation, tests, and build. |

## Validation Gates

`scripts/validate-content.mjs` checks:

- required frontmatter fields per collection,
- `status` enum values,
- `tags` is an array,
- `format` for analysis,
- `maturity` for ideas,
- `sourceUrl` and `coverImage` URL shape,
- blockquote length at or below 25 words.

`scripts/article-quality.mjs` checks source-grounded articles for:

- required Korean section headings,
- no placeholder markers,
- no duplicate `##` headings,
- thesis paragraph before the first heading,
- at least one URL in `## 확인한 자료`.

`scripts/memory/project.mjs --validate` checks:

- thought frontmatter schema,
- source path safety and existence,
- edge endpoint validity for public thoughts,
- projection eligibility counts.

## Test Files

| Test | Coverage |
| --- | --- |
| `scripts/article-factory.test.mjs` | Article packet generation, input classification, slug generation, source-grounded scaffold shape. |
| `scripts/article-quality.test.mjs` | Source-grounded article quality gate behavior. |
| `scripts/queue.test.mjs` | Queue item parsing and queue metadata validation. |
| `scripts/site-content.test.mjs` | Brand shell, imported Naver review contracts, review layout constraints. |
| `scripts/memory.schema.test.mjs` | Memory thought parsing, schema validation, exclusion reasons, edge validation. |
| `scripts/memory.seed.test.mjs` | Memory seed candidate generation. |
| `scripts/memory.project.test.mjs` | Public memory projection, exclusion counts, broken-source failures, JSON output formatting. |
| `src/lib/memoryData.test.mjs` | Public memory data normalization and loading fallback behavior. |

## Docs And Graph Layers

`docs/` is the source library:

- `_inbox/` is local unsorted intake and ignored in the public repo.
- `raw/` preserves source captures locally and is ignored unless promoted.
- `notes/` stores curated docs.
- `_index/` stores catalog and topic metadata.
- `wiki/` is generated navigation.
- `_graph/` documents generated graph artifacts.

`graphify-out/` is a generated knowledge graph. Read
`graphify-out/GRAPH_REPORT.md` before architecture questions. If
`graphify-out/wiki/index.md` exists, use it as the graph navigation entry point.
