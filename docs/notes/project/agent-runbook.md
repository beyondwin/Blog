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

과거 renderer, parity, rollback, Public Atlas 문서는 [레거시 종료 기록](history/README.md)이다.
Graphify는 article 주제이지 프로젝트 도구가 아니다. current command와 owner는
`package.json`, `apps/site`, `packages/content`, `packages/contracts`에서 확인한다.

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
| public answer runtime | answer-release/contracts + `apps/server` + search seam | focused contract/server/site tests, disposable Postgres, mandatory fixture stack |
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
npm run public-answer-release:build
npm run public-answer-release:verify
npm run public-answer-release:clean-test
npm run server:index:fixture
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
```

`site:build` is local evidence. Do not invent `FORM_THOUGHT_SITE_ORIGIN`. A production build requires
an explicitly approved normalized HTTPS origin; current production origin is `not_measured` and
authorization is `false`.

Public-answer local drill은 production key 없이 fixture mode와 disposable PostgreSQL을 사용한다.

```bash
npx tsx scripts/cutover/verify-public-answer-nginx.mts
npx tsx tests/e2e/run-search-provider-stack.mts
```

두 번째 명령만 browser → exact local proxy → Nest/Fastify → PostgreSQL의 mandatory integration
receipt다. Playwright `route`/`fulfill`, API mock, direct preview 또는 component fixture로 대신하지 않는다.
runner는 owned port/process group/temp root/Compose project를 만들고 success, 모든 status/fallback,
navigation/BFCache, redirect, header/privacy, rate-limit, abort-ignoring 8초 deadline과 slow-SQL backend
cancellation을 검사한 뒤 성공·실패·signal에서 정리한다. 실제 provider key/call은 금지한다.

## public/private and search boundaries

- Public app/release reads `src/data/memory.public.json`, never top-level `memory/**`.
- Public release와 분리된 public-answer release는 verified public release와 checksum 승인 allowlist만
  읽으며 private locator, raw prompt/job/provider payload, vector와 source map을 emitted artifact에 넣지 않는다.
- `/search/` loader의 answer authority는 exact `contentReleaseId`, `answerReleaseId` 두 필드다. legacy
  answer fixture/rollback evidence나 answer text를 loader에 다시 넣지 않는다.
- Primary navigation/search is reviews, articles, thoughts, search only.
- Secondary analysis/ideas/travel/tags/memory routes remain canonical outside primary search.
- No-JS anchors and GET forms remain functional. Static `/search/` cannot generate arbitrary
  query-specific HTML; JS-off preserves canonical URL and base discovery, not filtering/input restore.
- 명시적 POST는 raw question을 URL/history/session storage에 쓰지 않고 failure link를 canonical-only로
  만든다. 직접 GET/location restore의 기존 deterministic result와 scroll continuity만 유지한다.
- 질문/답변/excerpt의 durable retention은 0일이고 log/telemetry에는 redacted bucket만 남긴다.
  `store:false`, fixture mode와 local proof를 production ZDR, live-provider quality 또는 deploy readiness로
  표현하지 않는다.
- Publishing, memory promotion, cover approval and generated-media approval require explicit authority.

## browser completion

Visible work uses a separate local port and checks 1440×900, relevant calibrated reference width,
768px, 390×844, 320px와 720×450/DPR 2. Record URL, viewport, 두 release ID, screenshot/hash,
console, accessibility, overflow and reference ID. `/search/`는 idle/answer/fallback, keyboard submit,
44×44 target, 2px focus, citation/source switching, evidence dialog와 mobile menu containment/restore,
reduced motion/data saver/coarse pointer, no-JS, second-submit/popstate/BFCache를 포함한다. 일반 route는
긴 title, HOLD cover, image failure, table/code와 actual static-host 404를 유지한다. Unrun means
`not_measured`.

현재 avatar 원본 PNG는 `1,872,261 bytes`다. 별도 derivative approval/rights receipt가 없으면
AVIF/WebP promotion은 `not_authorized`, responsive `<picture>`/PNG-not-fetched/512 KiB production cell은
`not_measured`로 남긴다. 대신 승인 비의존 JS/CSS, layout, fixture stack gate를 계속 실행하며 test를
약화하지 않는다.

## docs and ADR rules

Adding or moving a durable note updates `docs/_index/catalog.yml`, `docs/_index/topics.yml` when its
stable topic changes, and `docs/INDEX.md`. An ADR change also updates the ADR index. Preserve rejected
and superseded decisions as history; 끝난 전환 기록은 `docs/notes/project/history/`에 두고 현재
지침으로 다시 쓰지 않는다.

## common failures

- Parsing source MDX or `media.yml` in a UI component instead of consuming the verified release.
- Treating a scaffold, risk fix, release build or local static build as publication/deploy authority.
- Hiding 17 cover-rights warnings because the safer public release contains no cover bytes.
- Claiming no-JS search filtering on a single static `/search/index.html`.
- Inventing a production domain or treating `.invalid` as production evidence.
- Running only unit tests for a visible route change.
- Restoring removed renderer/comparison tools from historical notes.
- ignore된 로컬 폴더를 `git add -f`로 추적하거나, `/Users/실제계정`, 개인 메일, 네이버 계정 ID를 커밋하는 것.
