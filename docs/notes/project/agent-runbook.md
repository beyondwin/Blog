# Agent Runbook

이 runbook은 agent를 현재 React-only `FORM & THOUGHT` source, edit surface와 검증 명령으로
보낸다. 개념 설명은 [project docs hub](README.md), [architecture reference](architecture-reference.md),
[Design built truth](../../../DESIGN.md)을 읽는다.

## 시작 순서

1. `git status --short --branch`로 기존 변경을 보존한다.
2. root `AGENTS.md`와 수정 subtree의 `AGENTS.md`를 읽는다.
3. 제품·architecture·data/publication·durable UX 작업이면 ADR index와 ADR-0007을 읽는다.
4. route/UI는 `site-change`, content/research는 `research-and-publish`, docs/memory는
   `archive-and-memory` skill을 사용한다.
5. focused RED/GREEN 뒤 `npm run validate`와 필요한 browser matrix를 실행한다.

과거 renderer, parity, rollback, Public Atlas와 Graphify 문서는 history다. current command와
owner는 `package.json`, `apps/site`, `packages/content`, `packages/contracts`에서 확인한다.

## task routing

| 작업 | 먼저 읽기 | 실제 owner |
| --- | --- | --- |
| 공개 architecture 질문 | `architecture-reference.md` | `apps/site`, `packages/content`, `packages/contracts` |
| route/layout/style | `DESIGN.md`, ADR-0007 | `apps/site/app`, `apps/site/src/ui` |
| ordinary article/thought | `publishing-workflows.md` | `src/content`, `packages/content/src/schemas.ts` |
| source-grounded article | workflow + evidence packet | article MDX, `docs/notes/article-factory/` |
| review | workflow + cover rights section | review MDX와 matching media bundle |
| immutable release/media | architecture reference | `packages/content`, `packages/contracts`, content asset bundle |
| queue analysis | `SYNC.md`, workflow | `queue.md`, `scripts/queue.mjs`, analysis MDX |
| public memory | architecture + memory implementation doc | `memory/**`, projector, `src/data/memory.public.json` |
| curated docs | `docs/AGENTS.md`, docs index rules | `docs/notes`, catalog/topics/INDEX |
| production artifact | architecture origin section | approved origin + `site:build:production`; deploy는 별도 권한 |

## edit and verification matrix

| change | editable surface | minimum evidence |
| --- | --- | --- |
| docs-only durable note | note + catalog/topics/INDEX | `npm run agent:check`, `git diff --check`, final `npm run validate` |
| content | exact MDX + its media bundle/evidence | `npm run validate`, rendered route |
| source-grounded content | above + source packet | article quality, source check, rendered route |
| public memory | exact private inputs + projection JSON | `npm run memory:validate`, `npm run validate`, `/memory/` |
| route/UI | exact route/component/CSS/test owners | focused test, `npm run validate`, desktop/mobile browser |
| release/media | exact schema/builder/approval owners | adversarial focused tests, strict media, build/verify/clean |
| delivery | static exporter/host/verifier owners | unit, site build, actual host/404/headers, retained Playwright |

## structured content handoff

Current scaffolds are created from repository root.

```bash
npm run content:new -- <article|review|scene|idea> ...
npm run article:new -- ...
npm run media:validate
npm run validate
```

The CLI name `scene` is only a retained input alias for a private-review travel record; it does not
create the removed public scene experience. Every scaffold is `status: review`, `draft: true`.

`packages/content/src/schemas.ts` owns source records. Public selection is exactly
`status === "published" && draft === false`. The current primary corpus is 17 articles, 18 reviews
and one thought. Examples are excluded. `why-i-read-in-the-ai-era` is only a thought.

Each asset stays under `src/assets/content/<collection>/<slug>/` with `media.yml`. Generated media
needs a canonical required batch, controller + independent visual approval and approved rights
review. Review cover bytes additionally need exact edition identity and controller + independent
rights approval. Warning/hold/unverified covers stay text-led.

## release and local site

```bash
npm run public-release:build
npm run public-release:verify
npm run public-release:clean-test
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
```

`site:build` is local evidence. Do not invent `FORM_THOUGHT_SITE_ORIGIN`. A production build requires
an explicitly approved normalized HTTPS origin; current production origin is `not_measured` and
authorization is `false`.

## public/private and search boundaries

- Public app/release reads `src/data/memory.public.json`, never top-level `memory/**`.
- Public release rejects status/draft, private locator, raw prompt/job, source map and embedding leaks.
- Primary navigation/search is reviews, articles, thoughts, search only.
- Secondary analysis/ideas/travel/tags/memory routes remain canonical outside primary search.
- No-JS anchors and GET forms remain functional. Static `/search/` cannot generate arbitrary
  query-specific HTML; JS-off preserves canonical URL and base discovery, not filtering/input restore.
- Publishing, memory promotion, cover approval and generated-media approval require explicit authority.

## browser completion

Visible work uses a separate local port and checks 1440×900, relevant calibrated reference width,
768px, 390×844 and 320px. Record URL, viewport, release id, screenshot/hash, console, accessibility,
overflow and reference ID. Include keyboard-only, menu containment/restore, reduced motion, no-JS,
long titles, HOLD cover, image failure, table/code and actual static-host 404. Unrun means
`not_measured`.

## docs and ADR rules

Adding or moving a durable note updates `docs/_index/catalog.yml`, `docs/_index/topics.yml` when its
stable topic changes, and `docs/INDEX.md`. An ADR change also updates the ADR index. Preserve rejected
and superseded decisions as history; do not rewrite them into current instructions.

## common failures

- Parsing source MDX or `media.yml` in a UI component instead of consuming the verified release.
- Treating a scaffold, risk fix, release build or local static build as publication/deploy authority.
- Hiding 17 cover-rights warnings because the safer public release contains no cover bytes.
- Claiming no-JS search filtering on a single static `/search/index.html`.
- Inventing a production domain or treating `.invalid` as production evidence.
- Running only unit tests for a visible route change.
- Restoring removed renderer/comparison tools from historical notes.
