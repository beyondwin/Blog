# 아키텍처 레퍼런스

`beyondwin`은 Astro 기반 정적 출판 시스템이다. 핵심은 typed MDX collection, script validation, private-first memory projection이다.

## Runtime Stack

| Layer | File | Responsibility |
| --- | --- | --- |
| Astro config | `astro.config.mjs` | Astro 설정. MDX integration을 등록한다. |
| Content schemas | `src/content.config.ts` | collection별 frontmatter 계약. |
| Pages | `src/pages/` | 정적 route와 collection detail route. |
| Layouts | `src/layouts/` | base, article, analysis, review page shell. |
| Components | `src/components/` | header, card, badge, callout, source panel, table of contents. |
| Content helpers | `src/lib/content.ts` | collection metadata, 날짜 선택, route href, tag, sorting. |
| Memory public data | `src/lib/memory/publicData.ts` | public memory JSON type, empty fallback, normalize, public JSON load. |
| Memory lookup | `src/lib/memory/lookup.ts` | source route resolution and thought/topic/source/edge lookup maps. |
| Memory graph model | `src/lib/memory/graphModel.ts` | graph nodes, edges, facets, deterministic positions. |
| Memory filters | `src/lib/memory/filters.ts` | lens/filter matching and `/memory/` deep-link helpers. |
| Memory content links | `src/lib/memory/contentLinks.ts` | public content footer linked/related memory matching. |
| Memory page payload | `src/lib/memory/pagePayload.ts` | serializable `/memory` detail drawer and client payload data. |
| Memory compatibility | `src/lib/memoryData.ts` | temporary re-export surface for existing imports. |
| Global styles | `src/styles/global.css` | token, layout, prose, component, responsive CSS. |
| Content source | `src/content/` | 공개 MDX 콘텐츠. |
| Memory source | `memory/` | public projection의 입력. private draft는 commit하지 않는다. |
| Docs library | `docs/` | source, curated note, index, generated navigation placeholder. |

## Content Collections

모든 collection은 아래 shared field를 가진다.

| Field | Type | Constraint |
| --- | --- | --- |
| `title` | string | required, non-empty |
| `description` | string | required, non-empty |
| `createdAt` | date | `z.coerce.date()` |
| `updatedAt` | date | `z.coerce.date()`, `updatedAt >= createdAt` |
| `tags` | string[] | default `[]`, item은 non-empty |
| `status` | enum | `review`, `published`, `archived`; default `review` |
| `draft` | boolean | default `false`; public selection에서는 `false`여야 한다. |

공개 콘텐츠의 유일한 조건은 `status === "published" && draft === false`, 즉
`published && !draft`다. `review`, `archived`, 그리고 `draft: true`는 모두
public listing, tag, home selection에서 제외한다.

### `analysis`

Path: `src/content/analysis/`

| Field | Type | Constraint |
| --- | --- | --- |
| `sourceUrl` | URL | required |
| `sourceTitle` | string | required, non-empty |
| `comment` | string | required, non-empty |
| `format` | enum | `research-report`, `essay`, `visual-page` |

### `articles`

Path: `src/content/articles/`

추가 field는 없다. 단, `tags`에 `source-grounded`가 있으면 [scripts/article-quality.mjs](../../../scripts/article-quality.mjs)의 추가 gate를 통과해야 한다.

### `ideas`

Path: `src/content/ideas/`

| Field | Type | Constraint |
| --- | --- | --- |
| `maturity` | enum | `seed`, `sketch`, `proposal`; Astro schema default는 `sketch` |

현재 [scripts/validate-content.mjs](../../../scripts/validate-content.mjs)는 ideas에서 `maturity`를 required field로 검사한다. 새 파일에는 명시한다.

### `reviews`

Path: `src/content/reviews/`

| Field | Type | Constraint |
| --- | --- | --- |
| `itemType` | enum | `book`, `article`, `tool`, `course`, `other` |
| `itemTitle` | string | required, non-empty |
| `itemAuthor` | string 또는 string[] | published review에서 required |
| `isbn13` | string | published review에서 required, ISBN-13 형식 |
| `publisher` | string | published review에서 required |
| `verdict` | string | published review에서 required, non-empty |
| `coverState` | enum | published review에서 `verified` 또는 `hold` required |
| `coverMedia` | media id | `coverState: verified`에서 required, `hold`에서 forbidden |
| `rating` | number | optional, 0-5 |
| `completedAt` | date | optional, display date 우선순위 1 |
| `sourceUrl` | URL | optional |

### `travel`

Path: `src/content/travel/`

| Field | Type | Constraint |
| --- | --- | --- |
| `location` | string | required, non-empty |
| `visitedAt` | date | optional, display date 우선순위 1 |
| `privacyReviewed` | boolean | published travel에서 `true` required |
| `leadMedia` | media id | published travel에서 required |

## Route Map

| Route | Source | Behavior |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | 최신 article/analysis featured, lane count, tag rack, latest list, memory count. |
| `/articles/` | `src/pages/articles/index.astro` | article listing. |
| `/articles/[slug]/` | `src/pages/articles/[slug].astro` | published non-draft article detail. |
| `/analysis/` | `src/pages/analysis/index.astro` | analysis listing. |
| `/analysis/[slug]/` | `src/pages/analysis/[slug].astro` | published non-draft analysis detail. |
| `/reviews/` | `src/pages/reviews/index.astro` | review listing. |
| `/reviews/[slug]/` | `src/pages/reviews/[slug].astro` | published non-draft review detail. |
| `/reviews/the-life-you-can-save/` | `astro.config.mjs` redirect | `/reviews/doing-good-better/`로 보내는 static meta-refresh compatibility page. HTTP 301을 보장하지 않는다. |
| `/ideas/` | `src/pages/ideas/index.astro` | idea listing. |
| `/ideas/[slug]/` | `src/pages/ideas/[slug].astro` | published non-draft idea detail. |
| `/travel/` | `src/pages/travel/index.astro` | travel listing. |
| `/travel/[slug]/` | `src/pages/travel/[slug].astro` | published non-draft travel detail. |
| `/tags/` | `src/pages/tags/index.astro` | all public content tag index. |
| `/tags/[tag]/` | `src/pages/tags/[tag].astro` | tag-filtered public content listing. |
| `/memory/` | `src/pages/memory.astro` | generated public memory projection. |

## Structured Content Foundation Contracts

콘텐츠와 media asset은 별도 경로를 공유한다.

- MDX: `src/content/<collection>/<slug>.mdx`
- media bundle: `src/assets/content/<collection>/<slug>/`
- manifest: 같은 bundle의 `media.yml`

`media.yml`은 `version: 1`과 `items`를 가진다. 각 item은 `id`, canonical
relative `file`, `kind`, `alt`, optional `caption`, `credit`, 정확히 하나의
`sourceUrl` 또는 `sourcePath`, `verifiedAt`, `rightsNote`, `checksum`을 기록한다.
optional `width`와 `height`는 함께 선언하며 실제 raster header와 일치해야 한다. `book-cover`는
여기에 `sourceUrl`, ISBN-13 `isbn13`, `edition`을 추가로 요구한다. manifest와
validator는 path traversal, manifest 밖의 asset, remote image hotlink, missing/
orphaned asset, duplicate checksum, media reference mismatch를 거부한다.

기존 Naver review 18개는 remote `coverImage`를 제거하고 구조화 서지로 옮겼다.
17개는 판본 식별용 local cover와 provenance manifest를 가지며, 재배포 권한이
별도로 확인되지 않았다는 warning은 의도적으로 유지한다.
`devotion-of-suspect-x`는 동일 판본 source image가 300px 최소 폭에 못 미쳐
`coverState: "hold"`이고 `coverMedia`가 없다. 냉정한 이타주의자 review의
canonical content와 asset slug는 `doing-good-better`다. 역사적 verdict는 원문과
동일한 후보를 작성자가 승인한 뒤 적용했으며 importer는 새 verdict를 자동으로
승인하지 않는다.

UI는 asset 경로나 manifest를 직접 해석하지 않는다. `src/lib/content/viewModels.ts`
가 제공하는 summary/detail model과 이미 resolve된 `ResolvedMedia`를 소비하고,
media resolution은 `src/lib/content/mediaRegistry.ts`에서 한 번만 한다. 공개
선택과 home의 중복 제거는 `src/lib/content/publication.ts`에 있다. 이는 후속
route/layout 디자인 구현이 사용할 handoff 경계이며, 해당 구현은 이 계약을
다시 만들거나 private memory를 읽으면 안 된다.

모든 public list/detail/home/search/tag surface는 shared selector 또는 그 selector를
사용하는 public aggregator를 거친다. `getStaticPaths()`도 `published && !draft`를
요구하므로 `review`와 `archived` entry의 detail route를 만들지 않는다.

실제 article source 16개는 모두 보존되어 있다. 그중 12개만 현재 public이며,
`agents-md-vs-agent-skills-evidence`, `aws-static-frontend-serverless-bff`,
`shared-ai-conversation-evidence-boundaries`, `uncle-bob-ai-code-review-evidence`
4개는 `status: review`로 publication authorization을 기다린다. migration 위험을
해결하라는 요청은 이 4개를 publish하라는 승인으로 해석하지 않는다.

## Content Helper Contracts

[src/lib/content.ts](../../../src/lib/content.ts)의 public behavior:

- `collectionMeta`: 각 collection의 label, nav label, description, href.
- `primaryCollections`: `articles`, `reviews`, `ideas`, `travel`.
- `getEntryDate(entry)`: review는 `completedAt`, travel은 `visitedAt`, 나머지는 `createdAt`.
- `getEntryHref(entry)`: `/${entry.collection}/${entry.id}/`.
- `getEntryTypeLabel(entry)`: analysis `format`은 title case로 변환하고, 나머지는 collection label을 쓴다.
- `formatDate(date)`: `ko` locale로 날짜를 표시한다.
- `estimateReadingMinutes(text)`: 260 words per minute 기준, 최소 1분.
- `getContentByCollection(collection)`: `published && !draft`만 최신순 정렬.
- `getAllContent()`: 모든 collection을 병합해 최신순 정렬.
- `getHomeSections()`: home page용 collection별 entry 배열.
- `getAllTags()`: 공개 콘텐츠 tag를 중복 제거 후 locale sort.

## Memory Projection Contract

입력:

- `memory/thoughts/*.md`
- `memory/edges.jsonl`
- `memory/sources.jsonl`

출력:

- `src/data/memory.public.json`

public route:

- `/memory/`

`/memory`는 `memory/**`를 직접 읽지 않는다. [src/lib/memory/publicData.ts](../../../src/lib/memory/publicData.ts)가 generated JSON을 읽고 normalize하며, [src/lib/memory/lookup.ts](../../../src/lib/memory/lookup.ts)가 source link를 resolve한다.

### Thought Eligibility

thought는 아래 조건을 모두 만족해야 export된다.

- `schema_version`이 `1`.
- `confidentiality`가 `public`.
- `surfaces`에 `memory-public` 포함.
- `review.status`가 `accepted`.
- `sources`가 비어 있지 않음.
- local source path가 repo 내부의 안전한 relative path.
- external source URL이 `http` 또는 `https`.

### Allowed Memory Values

| Field | Allowed values |
| --- | --- |
| `memory_type` | `semantic`, `procedural`, `reflective`, `episodic` |
| `origin` | `kws`, `external`, `synthesized` |
| `confidentiality` | `private`, `public` |
| `review.status` | `candidate`, `accepted`, `needs_review`, `rejected` |
| edge `type` | `supports`, `extends`, `instantiates`, `refines`, `contradicts`, `related`, `topic-tag`, `thesis-tag` |

Projection exclusion reasons:

- `private`
- `notAccepted`
- `notPublicSurface`
- `missingSource`
- `invalidSource`
- `unsupportedSchema`

## Memory Code Map

| Layer | File | Responsibility |
| --- | --- | --- |
| Memory public data | `src/lib/memory/publicData.ts` | `MemoryPublicData`, empty fallback, normalization, public JSON loading. |
| Memory lookup | `src/lib/memory/lookup.ts` | source href resolution and thought/topic/source/edge lookup maps. |
| Memory graph model | `src/lib/memory/graphModel.ts` | graph nodes, edges, facets, deterministic positions. |
| Memory filters | `src/lib/memory/filters.ts` | lens/filter matching and `/memory/` deep-link helpers. |
| Memory content links | `src/lib/memory/contentLinks.ts` | public content footer linked/related memory matching. |
| Memory article compatibility | `src/lib/memory/articleLinks.ts` | compatibility wrapper for article-memory imports. |
| Memory page payload | `src/lib/memory/pagePayload.ts` | serializable `/memory` detail drawer and client payload data. |
| Memory compatibility | `src/lib/memoryData.ts` | temporary re-export surface for existing imports. |

`/memory/` is a static sentence sheet; thought pages live at `/memory/[slug]/`.
the Astro page renders static markup and embeds the public memory payload.

routeable source prefix:

| Source prefix | Public route |
| --- | --- |
| `src/content/articles/` | `/articles/` |
| `src/content/analysis/` | `/analysis/` |
| `src/content/ideas/` | `/ideas/` |
| `src/content/reviews/` | `/reviews/` |
| `src/content/travel/` | `/travel/` |

Published detail pages in `articles`, `analysis`, `reviews`, `ideas`, and
`travel` can render a public memory footer. The footer uses
`findContentMemoryLinks()` against `src/data/memory.public.json`; direct links
come from exact source path matches, and related links come from tag/topic
matches. Detail pages do not read `memory/**` directly.

## Script Reference

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run dev` | `astro dev` | local dev server. |
| `npm run build` | `astro check && astro build` | type check와 static build. |
| `npm run preview` | `astro preview` | built site preview. |
| `npm test` | `vitest run` | 전체 test 실행. |
| `npm run sync` | `node scripts/sync.mjs` | sync workflow entry point. |
| `npm run content:new -- <article\|review\|scene\|idea> ...` | `node scripts/create-content-entry.mjs` | collision-safe draft MDX와 empty `media.yml` bundle을 함께 scaffold한다. |
| `npm run article:new` | `node scripts/create-article-packet.mjs` | evidence packet과 article draft 생성. |
| `npm run media:validate` | `node scripts/validate-media.mjs` | content media manifest, provenance, asset, reference를 non-strict mode로 검사한다. legacy `coverImage`는 warning만 낸다. |
| `node scripts/import-naver-reviews.mjs --output <new-local-intake-directory>` | `scripts/import-naver-reviews.mjs` | 원문 title/body/date/source를 보존한 review/draft intake와 비공개 cover 조사 JSON을 신규 directory에 생성한다. |
| `npm run article:quality` | `node scripts/article-quality.mjs` | source-grounded article shape 검사. |
| `npm run memory:seed` | `node scripts/memory/seed.mjs` | memory review candidate 생성. |
| `npm run memory:review -- report` | `node scripts/memory/review.mjs report` | generated memory candidates를 읽기 쉬운 local review report로 만든다. |
| `npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD` | `node scripts/memory/review.mjs promote` | 선택한 candidate를 검증된 public thought markdown으로 승격한다. |
| `npm run memory:project` | `node scripts/memory/project.mjs` | `src/data/memory.public.json` 생성. |
| `npm run memory:validate` | `node scripts/memory/project.mjs --validate` | public memory 입력 검증. JSON은 쓰지 않는다. |
| `npm run validate` | chained command | content, strict media, article quality, memory, tests, build 전체 gate. |

## Validation Gates

### `scripts/validate-content.mjs`

검사 항목:

- collection별 required frontmatter.
- `status` enum.
- `tags` array 여부.
- analysis `format`.
- ideas `maturity`.
- `sourceUrl`, `coverImage` URL shape.
- blockquote 한 줄 25단어 이하.

주의: 이 스크립트는 `.mdx` 파일만 수집한다. Astro content schema는 `.md`도 허용하지만, 현재 repository content는 `.mdx` 기준으로 운영한다.

### `scripts/article-quality.mjs`

`source-grounded` article 검사 항목:

- 필수 Korean section heading.
- placeholder marker 없음.
- duplicate `##` heading 없음.
- 첫 heading 전에 thesis paragraph 존재.
- `## 확인한 자료` section에 최소 하나의 URL.

### `scripts/memory/project.mjs --validate`

검사 항목:

- thought frontmatter schema.
- source path safety와 existence.
- public thought edge endpoint validity.
- projection eligibility count.

### `scripts/validate-media.mjs`

`npm run media:validate`는 필요할 때 쓰는 non-strict 진단이다. legacy
`coverImage`는 warning을 내지만 exit 0을 유지한다. 기본 완료 명령인
`npm run validate`는 정확히 `npm run media:validate -- --strict`를 호출하므로 이
warning을 error로 승격한다. 검증은 각 `media.yml`의 required provenance field,
안전한 canonical path, checksum, referenced file, orphan file, 중복 선언,
content media ID를 함께 검사한다.

## Queue Parser

[scripts/queue.mjs](../../../scripts/queue.mjs)는 [queue.md](../../../queue.md)의 작업 항목을 읽는다.

- item line: `- [ ] https://...` 또는 `- [x] https://...`
- metadata line: 두 칸 이상 indent 후 `key: value`
- code fence 내부는 무시한다.
- unchecked이고 `status: blocked`가 아닌 항목이 queued item이다.
- unchecked item에 `comment:`가 없으면 문제로 보고한다.
- `output:`은 `.mdx`로 끝나야 한다.
- `pr:`은 `https://` URL이어야 한다.

## Test Files

| Test | Coverage |
| --- | --- |
| `scripts/article-factory.test.mjs` | packet generation, input classification, slug generation, scaffold shape. |
| `scripts/article-quality.test.mjs` | source-grounded article quality gate. |
| `scripts/queue.test.mjs` | queue parser and metadata validation. |
| `scripts/site-content.test.mjs` | brand shell, imported Naver review contracts, review layout constraints. |
| `scripts/memory.schema.test.mjs` | thought parsing, schema validation, exclusion reasons, edge validation. |
| `scripts/memory.seed.test.mjs` | memory seed candidate generation. |
| `scripts/memory.project.test.mjs` | public memory projection, exclusion counts, broken-source failure, JSON output. |
| `src/lib/memory/*.test.mjs` | public memory data, lookup, graph model, filters, content links, article compatibility, and page payload behavior. |
| `src/lib/memoryData.test.mjs` | compatibility re-export behavior. |

## Docs Layers

`docs/`는 curated library다.

- `_inbox/`: local unsorted intake.
- `raw/`: source capture.
- `notes/`: curated docs.
- `_index/`: catalog and topic metadata.
- `wiki/`: generated navigation.
