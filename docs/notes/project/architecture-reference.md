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
| Memory loader | `src/lib/memoryData.ts` | public memory JSON normalize, source href resolve, lookup build. |
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
| `updatedAt` | date | `z.coerce.date()` |
| `tags` | string[] | default `[]`, item은 non-empty |
| `status` | enum | `review`, `published`, `archived`; default `review` |
| `draft` | boolean | default `false`; route/listing에서 제외 |

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
| `itemAuthor` | string | optional |
| `rating` | number | optional, 0-5 |
| `completedAt` | date | optional, display date 우선순위 1 |
| `sourceUrl` | URL | optional |
| `coverImage` | URL | optional |

### `travel`

Path: `src/content/travel/`

| Field | Type | Constraint |
| --- | --- | --- |
| `location` | string | required, non-empty |
| `visitedAt` | date | optional, display date 우선순위 1 |

## Route Map

| Route | Source | Behavior |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | 최신 article/analysis featured, lane count, tag rack, latest list, memory count. |
| `/articles/` | `src/pages/articles/index.astro` | article listing. |
| `/articles/[slug]/` | `src/pages/articles/[slug].astro` | non-draft article detail. |
| `/analysis/` | `src/pages/analysis/index.astro` | analysis listing. |
| `/analysis/[slug]/` | `src/pages/analysis/[slug].astro` | non-draft analysis detail. |
| `/reviews/` | `src/pages/reviews/index.astro` | review listing. |
| `/reviews/[slug]/` | `src/pages/reviews/[slug].astro` | non-draft review detail. |
| `/ideas/` | `src/pages/ideas/index.astro` | idea listing. |
| `/ideas/[slug]/` | `src/pages/ideas/[slug].astro` | non-draft idea detail. |
| `/travel/` | `src/pages/travel/index.astro` | travel listing. |
| `/travel/[slug]/` | `src/pages/travel/[slug].astro` | non-draft travel detail. |
| `/tags/` | `src/pages/tags/index.astro` | all public content tag index. |
| `/tags/[tag]/` | `src/pages/tags/[tag].astro` | tag-filtered public content listing. |
| `/memory/` | `src/pages/memory.astro` | generated public memory projection. |

## Content Helper Contracts

[src/lib/content.ts](../../../src/lib/content.ts)의 public behavior:

- `collectionMeta`: 각 collection의 label, nav label, description, href.
- `primaryCollections`: `articles`, `reviews`, `ideas`, `travel`.
- `getEntryDate(entry)`: review는 `completedAt`, travel은 `visitedAt`, 나머지는 `createdAt`.
- `getEntryHref(entry)`: `/${entry.collection}/${entry.id}/`.
- `getEntryTypeLabel(entry)`: analysis `format`은 title case로 변환하고, 나머지는 collection label을 쓴다.
- `formatDate(date)`: `ko` locale로 날짜를 표시한다.
- `estimateReadingMinutes(text)`: 260 words per minute 기준, 최소 1분.
- `getContentByCollection(collection)`: draft 제외 후 최신순 정렬.
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

`/memory`는 `memory/**`를 직접 읽지 않는다. [src/lib/memoryData.ts](../../../src/lib/memoryData.ts)가 generated JSON을 normalize하고 source link를 resolve한다.

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

## Memory Data Loader

[src/lib/memoryData.ts](../../../src/lib/memoryData.ts)는 다음을 제공한다.

- `emptyMemoryData`: generated JSON이 없거나 일부 field가 없을 때 fallback.
- `normalizeMemoryData(value)`: partial JSON을 완전한 `MemoryPublicData`로 만든다.
- `resolveMemorySourceHref(source)`: `src/content/<collection>/<slug>.mdx` source를 public route로 바꾼다.
- `buildMemoryLookup(memory)`: thought, topic, source, edge lookup map을 만든다.
- `loadPublicMemoryData()`: Astro `import.meta.glob`으로 `src/data/memory.public.json`을 읽는다.

routeable source prefix:

| Source prefix | Public route |
| --- | --- |
| `src/content/articles/` | `/articles/` |
| `src/content/analysis/` | `/analysis/` |
| `src/content/ideas/` | `/ideas/` |
| `src/content/reviews/` | `/reviews/` |
| `src/content/travel/` | `/travel/` |

## Script Reference

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run dev` | `astro dev` | local dev server. |
| `npm run build` | `astro check && astro build` | type check와 static build. |
| `npm run preview` | `astro preview` | built site preview. |
| `npm test` | `vitest run` | 전체 test 실행. |
| `npm run sync` | `node scripts/sync.mjs` | sync workflow entry point. |
| `npm run article:new` | `node scripts/create-article-packet.mjs` | evidence packet과 article draft 생성. |
| `npm run article:quality` | `node scripts/article-quality.mjs` | source-grounded article shape 검사. |
| `npm run memory:seed` | `node scripts/memory/seed.mjs` | memory review candidate 생성. |
| `npm run memory:project` | `node scripts/memory/project.mjs` | `src/data/memory.public.json` 생성. |
| `npm run memory:validate` | `node scripts/memory/project.mjs --validate` | public memory 입력 검증. JSON은 쓰지 않는다. |
| `npm run validate` | chained command | content, article quality, memory, tests, build 전체 gate. |

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
| `src/lib/memoryData.test.mjs` | public memory data normalization and fallback behavior. |

## Docs And Graph Layers

`docs/`는 curated library다.

- `_inbox/`: local unsorted intake.
- `raw/`: source capture.
- `notes/`: curated docs.
- `_index/`: catalog and topic metadata.
- `wiki/`: generated navigation.
- `_graph/`: graph artifact notes.

`graphify-out/`은 generated knowledge graph다. architecture/codebase 질문 전에는 [graphify-out/GRAPH_REPORT.md](../../../graphify-out/GRAPH_REPORT.md)를 읽는다. `graphify-out/wiki/index.md`가 생기면 graph navigation entry point로 사용한다.
