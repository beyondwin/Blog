# Memory Corpus Review And Deep Links Design

## Status

Approved umbrella direction on 2026-07-05.

This umbrella combines two adjacent improvements:

1. Public memory corpus review queue.
2. Shareable `/memory/` deep links and article-to-memory node links.

## Context

`beyondwin` now has a private-first memory pipeline and a graph-first public
workbench:

```text
memory/thoughts/*.md
memory/edges.jsonl
memory/sources.jsonl
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/lib/memoryData.ts
  -> src/pages/memory.astro
```

The public workbench is functioning and validated. At the time of this design,
`npm run validate` passes across content validation, article quality, memory
projection validation, 55 tests, Astro check, and static build.

The current projection is intentionally small: 7 public thoughts, 12 topics,
25 edges, and 7 sources. Running `npm run memory:seed` generates 46 private
review candidates into the ignored local queue file
`memory/review/seed-candidates.jsonl`.

That means the next bottleneck is not graph rendering. The bottleneck is turning
existing articles, reviews, docs, and analysis into reviewed public memory
thoughts without weakening the private/public boundary. Once the corpus grows,
deep links make the graph useful from article pages, bookmarks, and future
navigation surfaces.

## Goal

Create a safe static workflow for reviewing memory candidates, promoting selected
ones into public thoughts, and linking directly to relevant nodes or filters on
`/memory/`.

Success means:

- A local operator can inspect generated memory candidates without opening the
  raw JSONL file.
- A selected candidate can be promoted into `memory/thoughts/*.md` with explicit
  public export fields, source validation, deterministic formatting, and a clear
  reviewed date.
- Promotion refuses duplicate slugs and invalid source paths before writing.
- Public projection still exports only accepted public thoughts with
  `memory-public` surface.
- Article memory cards link to their exact `/memory/` thought node instead of
  only opening the generic memory page.
- `/memory/` can initialize from URL state for selected nodes, topic filters,
  source filters, lens, search, memory type, and edge type.
- Changing selected node or filters updates URL state without a server runtime.
- Reset clears both UI state and URL state.
- The implementation remains static, deterministic, and verifiable with the
  existing validation stack.

## Non-Goals

This umbrella does not add:

- login or account state,
- web-based memory editing UI,
- database-backed memory,
- RAG, embeddings, LLM calls, citations, or answer generation,
- admin analytics,
- automatic public publication of every seed candidate,
- automatic edge inference,
- changes to the thought frontmatter schema version,
- changes to the public export gate,
- changes to graph layout physics.

Candidate review remains an explicit local workflow. The system may generate
candidate files and reports, but it must not silently publish private or
unreviewed material.

## Product Direction

The work has two connected surfaces.

### 1. Local Review Queue

The review queue is a command-line workflow for the site owner or an agent
working locally:

```bash
npm run memory:seed
npm run memory:review -- report
npm run memory:review -- promote <slug> --reviewed-at 2026-07-05
npm run memory:project
npm run validate
```

`memory:seed` remains the source of generated candidate records. The new
review command reads the ignored JSONL queue and existing thought files, then
provides:

- queue summary by topic, source kind, and candidate status,
- a local markdown report for reading candidates in a human-friendly format,
- duplicate detection against existing `memory/thoughts/*.md`,
- promotion of one candidate by slug into a public thought markdown file,
- validation of promoted source paths before write,
- a dry-run mode for showing the generated thought without writing.

The local report should also stay ignored. It is review material, not a durable
public artifact. Durable public memory remains `memory/thoughts/*.md`,
`memory/edges.jsonl`, `memory/sources.jsonl`, and
`src/data/memory.public.json`.

### 2. URL-Addressable Memory Workbench

`/memory/` should support URL state for retrieval and sharing.

Supported URL forms:

```text
/memory/?node=thought%3Aagent-harnesses-are-operating-systems
/memory/?topic=topic%3Aai-workflow
/memory/?source=source%3Asrccontentarticleslazycodex-agent-harness-analysismdx
/memory/?lens=sources&node=source%3Asrccontentarticleslazycodex-agent-harness-analysismdx
/memory/?q=workflow&type=semantic&edge=supports
```

The URL state is progressive enhancement. The static HTML remains useful without
JavaScript, and the browser script applies URL state after loading the embedded
public memory payload.

Article memory cards should use these URLs:

- direct linked thoughts point to `/memory/?node=thought%3A<slug>`,
- related thoughts also point to their node,
- the article memory header points to the first linked thought, then the first
  related thought, then `/memory/` if no thought is present.

## Architecture

Keep the current private-first projection pipeline. Add two small layers around
it:

```text
docs/content/articles/reviews/analysis
  -> scripts/memory/seed.mjs
  -> memory/review/seed-candidates.jsonl       (ignored local queue)
  -> scripts/memory/review.mjs                 (new review/promote CLI)
  -> memory/thoughts/*.md                      (durable reviewed thought)
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/lib/memoryData.ts                     (public model + href helpers)
  -> article pages and /memory/ URL state
```

### File Responsibilities

| File | Responsibility |
| --- | --- |
| `scripts/memory/review.mjs` | Load candidate JSONL, summarize queue state, render local review report, promote one candidate into a validated public thought markdown file. |
| `scripts/memory.review.test.mjs` | Verify candidate loading, duplicate detection, report rendering, dry-run output, promotion, validation failures, and CLI behavior. |
| `package.json` | Add the `memory:review` command. |
| `.gitignore` | Ignore generated local memory review markdown reports. |
| `scripts/memory/seed.mjs` | Remains the candidate generator. Only change it if tests expose missing collection coverage or unstable fields. |
| `scripts/memory/project.mjs` | Remains the public projection gate. No new export condition is added. |
| `src/lib/memoryData.ts` | Add public memory deep-link helpers and extend article-memory link records with node ids and hrefs. |
| `src/lib/memoryData.test.mjs` | Verify generated memory hrefs, article-memory hrefs, and URL filter parsing helpers. |
| `src/pages/articles/[slug].astro` | Pass existing article memory data through unchanged except for new href fields. |
| `src/layouts/ArticleLayout.astro` | Render article memory items as links to exact `/memory/` nodes. |
| `src/pages/memory.astro` | Read URL state, initialize selected node and filters, update URL state on interaction, and clear state on reset. |
| `docs/notes/project/publishing-workflows.md` | Document the review and promotion workflow. |
| `docs/notes/project/architecture-reference.md` | Document the new review command and URL-addressable memory behavior. |
| `docs/implementation/memory-second-brain.md` | Update the implementation reference for candidate review and deep links. |

## Review Queue Contract

The queue command reads candidates with the same shape produced by
`scripts/memory/seed.mjs`:

```js
{
  schema_version: 1,
  slug: 'example-slug',
  claim_ko: 'Korean claim or title',
  claim_en: 'English claim or title',
  memory_type: 'semantic',
  origin: 'kws',
  confidentiality: 'private',
  surfaces: [],
  topics: ['topic'],
  theses: [],
  sources: [{ kind: 'article', path: 'src/content/articles/example.mdx', title: 'Example' }],
  review: { status: 'candidate' },
  seed: { source: 'astro-content', summary: '...' }
}
```

Promotion transforms exactly one candidate into a public thought markdown file:

```yaml
schema_version: 1
slug: example-slug
claim_ko: "Korean claim or title"
claim_en: "English claim or title"
memory_type: semantic
origin: kws
confidentiality: public
surfaces: [memory-public, article-ready]
topics: [topic]
theses: []
sources:
  - kind: article
    path: src/content/articles/example.mdx
    title: "Example"
review:
  status: accepted
  reviewed_at: 2026-07-05
```

The body is based on the candidate seed summary when present. If the summary is
empty, the body states the source title and requires a human edit before the
thought should be considered high-quality. This is still public-safe because the
source and title are already present in the candidate. The command must not make
private claims beyond the candidate data.

The command refuses to write when:

- the candidate slug does not exist,
- `memory/thoughts/<slug>.md` already exists,
- any existing thought already uses the slug,
- the candidate schema is invalid,
- a local source path is unsafe or does not exist,
- the output path would leave `memory/thoughts/`,
- `--reviewed-at` is missing or not shaped as `YYYY-MM-DD`.

## Deep Link Contract

`src/lib/memoryData.ts` should expose render-safe helpers:

```ts
export interface MemoryDeepLinkState {
  selectedNodeId?: string;
  query?: string;
  activeLens?: string;
  activeTopicIds?: string[];
  activeSourceIds?: string[];
  activeMemoryTypes?: string[];
  activeEdgeTypes?: string[];
}

export function createMemoryNodeHref(nodeId: string): string;
export function createMemoryFilterHref(filters: MemoryDeepLinkState): string;
export function parseMemoryDeepLinkParams(
  params: URLSearchParams,
  model: MemoryGraphModel,
): MemoryDeepLinkState;
```

The helpers should only accept ids that exist in the current graph model when
parsing. Unknown ids are ignored. Invalid lens values fall back to `all`. Empty
strings are ignored. Repeated params are supported for `topic`, `source`, `type`,
and `edge`.

The browser script in `src/pages/memory.astro` should mirror these rules so the
static page initializes and updates consistently.

## Data Flow

### Candidate Review

```text
npm run memory:seed
  -> writes ignored seed-candidates.jsonl

npm run memory:review -- report
  -> reads candidate JSONL and existing thoughts
  -> writes ignored queue markdown report

npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD
  -> validates candidate and sources
  -> writes memory/thoughts/<slug>.md

npm run memory:project
  -> writes src/data/memory.public.json
```

### Article-To-Memory Link

```text
article page
  -> findArticleMemoryLinks(publicMemory, articlePath, tags)
  -> ArticleMemoryLink includes nodeId and memoryHref
  -> ArticleLayout renders linked cards as anchors
  -> reader opens /memory/?node=thought%3A...
  -> memory page selects the node and opens the detail drawer
```

## Error Handling

- Missing queue file: report command exits non-zero with a message that tells
  the operator to run `npm run memory:seed`.
- Empty queue: report command writes a valid empty report and exits zero.
- Duplicate slug: promotion exits non-zero and writes nothing.
- Invalid candidate source: promotion exits non-zero and writes nothing.
- Invalid deep link node/filter id: ignore only that URL value and keep the page
  usable.
- Unknown selected node after a projection change: fall back to
  `graph.selectedFallback`.
- Browser history unavailable: UI still works; URL update is skipped.

## Accessibility And UX

- Article memory cards remain readable as ordinary links.
- `/memory/` selection from URL must update the same visible drawer used by
  mouse and keyboard selection.
- URL-initialized filters must also set `aria-pressed` on corresponding filter
  controls.
- Reset buttons must clear active filter controls and remove query params.
- The graph is not the only navigation path; list, library, and sources panels
  remain available.
- Text must not overlap controls or cards at desktop and mobile widths.

## Tests

Add focused test coverage for:

- review candidate loading from JSONL,
- queue summary counts by topic and source kind,
- duplicate slug detection,
- report markdown rendering,
- dry-run promoted thought markdown,
- successful promotion into `memory/thoughts/*.md`,
- promotion refusal for unknown slug, duplicate slug, invalid date, and missing
  source path,
- CLI output for `report` and `promote --dry-run`,
- `createMemoryNodeHref`,
- `createMemoryFilterHref`,
- deep-link parsing with unknown ids ignored,
- article memory link results including `nodeId` and `memoryHref`,
- `/memory/` browser smoke for URL-selected node and topic filter.

## Verification

Minimum verification:

```bash
npm test -- scripts/memory.review.test.mjs
npm test -- src/lib/memoryData.test.mjs
npm run memory:seed
npm run memory:review -- report
npm run validate
git diff --check
```

If implementation changes code files, run:

```bash
graphify update .
```

`graphify-out/` is ignored, so graph freshness is command evidence.

Browser verification should cover:

- `/memory/?node=thought%3Aagent-harnesses-are-operating-systems`,
- `/memory/?topic=topic%3Aai-workflow`,
- an article page with linked memory cards,
- mobile `/memory/` with selected node drawer,
- reset from a URL-initialized state.

## Acceptance Criteria

- `npm run memory:review -- report` produces a human-readable local review
  report from the generated queue.
- `npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD` writes one
  validated public thought and refuses unsafe writes.
- Promoted thoughts pass `npm run memory:validate`.
- Article memory cards link to exact `/memory/` thought nodes.
- `/memory/` initializes selected node and filters from URL params.
- `/memory/` writes current selected/filter state back to the URL without page
  reloads.
- Reset clears UI and URL state.
- Public routes still read only `src/data/memory.public.json`.
- Private/local queue artifacts remain ignored.
- `npm run validate`, `git diff --check`, and graph refresh after code changes
  pass.

## Future Work

- Add an explicit edge review command after the thought corpus is larger.
- Add richer corpus health reports by topic coverage and stale source age.
- Add public topic landing links from home and tag pages.
- Add a browser-based review UI only if the CLI workflow becomes too slow.
- Consider Ask/RAG only after corpus size, citation coverage, auth, and answer
  review requirements are specified separately.
