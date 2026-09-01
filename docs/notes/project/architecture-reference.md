# 아키텍처 레퍼런스

`beyondwin`의 현재 공개 built truth는 React Router Framework Mode static prerender,
checksum-addressed `public-release`와 분리된 `public-answer-release`, 그리고 same-origin 한 경로로
연결된 NestJS public-answer runtime이다. `apps/site`가 유일한 renderer이고, `packages/content`와
`packages/contracts`가 source schema, trusted MDX, media, 두 release와 wire contract 검증을 소유한다.
과거 renderer 비교, rollback, Public Atlas 자료는 immutable history이며 현재 실행 경로가 아니다.

## 현재 경계

| 계층 | 구현 소유자 | 책임 |
| --- | --- | --- |
| 공개 renderer | `apps/site` | React 19, React Router 8, route loader, FORM & THOUGHT UI, static export/host |
| source/release | `packages/content` | MDX source parsing, Zod schema, trusted MDX render, media validation/build, release activation/verification |
| public contract | `packages/contracts` | public record/media/release schema와 `isPublicRecord` |
| 공개 원문 | `src/content/<collection>/*.mdx` | 사람이 관리하는 source record. public 여부는 `published && !draft` |
| media source | `src/assets/content/<collection>/<slug>/` | 원본과 `media.yml`; UI 경로가 아니라 provenance bundle |
| public memory input | `src/data/memory.public.json` | 공개 앱이 읽을 수 있는 유일한 memory projection |
| private memory | `memory/**` | projection 입력. public app/release가 직접 읽지 않음 |
| 공개 답변 artifact | `packages/content/src/answer-release` | 승인 corpus를 opaque chunk/evidence와 canonical locator로 materialize하고 active binding을 검증 |
| 공개 답변 runtime | `apps/server` | NestJS 12/Fastify 5 shell, PostgreSQL hybrid retrieval, generation/citation 검증, privacy/rate/cost guard |
| 공개 답변 browser seam | `apps/site/src/ui/search` | release ID binding, one-shot POST coordinator, verified answer 또는 deterministic `SearchResults` |
| delivery | `apps/site/build-static-export.ts`, `apps/site/serve-static.ts` | verified release binding, atomic staging, assets, SEO/404/security headers, static host |

Private Studio, 인증, background worker와 범용 ingestion은 여전히
[ADR-0005](adr/0005-node-react-modular-monolith.md)의 후속 범위다. 현재 server 구현은
ADR-0010의 public-answer vertical slice에 한정된다. ADR-0010은 작업 시 read-only authority로
확인하며 이 변경에서 index나 catalog를 다시 쓰지 않는다.

## route map

route source of truth는 `apps/site/app/routes.ts`와 verified release다.

| 분류 | canonical route | renderer |
| --- | --- | --- |
| home | `/` | `routes/home.tsx` |
| primary index | `/reviews/`, `/articles/`, `/thoughts/`, `/search/` | 각 index/search route |
| primary detail | `/reviews/:slug/`, `/articles/:slug/`, `/thoughts/:slug/` | verified release record detail |
| secondary index | `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/` | secondary shell |
| secondary detail | `/analysis/:slug/`, `/ideas/:slug/`, `/travel/:slug/`, `/tags/:tag/`, `/memory/:slug/` | release-derived route |
| compatibility | `/memory/map/` | `noindex` `/memory/` redirect document |
| delivery | `/sitemap.xml`, `/robots.txt`, `/404.html`, `/_headers` | static export artifact |

현재 verified release에서 sitemap은 release-derived 93 route다. 이 숫자를 source에
하드코딩하지 않고 `fullPublicPaths()`에서 다시 계산한다. 과거 review redirect와 article
compatibility URL은 현재 route contract가 아니다.

## source content schema

single source schema는 `packages/content/src/schemas.ts`다. source collection은
`analysis`, `articles`, `ideas`, `reviews`, `travel`, `thoughts`다. 공통 field는 `title`,
`description`, `createdAt`, `updatedAt`, `tags`, `status`, `draft`, optional `dek`, 최대 세
`relationships`, MDX `body`다. `updatedAt >= createdAt`과 collection canonical href를
검증한다.

| collection | 추가 field |
| --- | --- |
| `analysis` | `sourceUrl`, `sourceTitle`, `comment`, `format` |
| `articles` | optional `recordKind`, `evidenceState`, `featuredMedia` |
| `thoughts` | optional `featuredMedia`; article subtype field 없음 |
| `ideas` | `maturity`; optional `prompt` |
| `reviews` | item/author/ISBN/edition/publisher/verdict/cover state와 optional rating/date/source |
| `travel` | `location`, optional visit/coordinates/lead; published이면 privacy review와 lead 필수 |

release build는 `status: published`이고 `draft: false`인 record만 public contract로 바꾼다.
현재 primary corpus는 article 17, review 18, thought 1이며 example content는 public release에
없다. 생각 `why-i-read-in-the-ai-era`의 canonical route는
`/thoughts/why-i-read-in-the-ai-era/` 하나뿐이다.

## public record와 listing boundary

`packages/contracts/src/content.ts`는 public record union을 소유한다. public record에는
source `status`, `draft`, private locator, raw prompt/job/embedding이 없다. route loader는
verified release만 열고 `recordsForCollection()`으로 canonical public records를 선택한다.
list/home/search payload는 `bodyHtml`, media 전체, relationships, memoryLinks 같은 detail-only
field를 제거하거나 첫 frame에 필요한 asset만 고른다.

primary search inventory는 articles, reviews, thoughts만 포함한다. secondary collection과
memory는 tags/secondary navigation에서는 유지하지만 primary search에서는 제외한다. 검색 loader의
answer authority는 active `contentReleaseId`와 `answerReleaseId` 두 필드뿐이다. legacy answer fixture,
answer text, rollback evidence, raw `bodyHtml`, private locator와 top-level `memory/**`는 loader나 emitted
HTML/JS/JSON에 들어가지 않는다. inventory는 deterministic fallback과 GET reading continuity만
소유하고 provider answer처럼 사용하지 않는다.

검색 stage의 avatar는 immutable content release에 포함된 record media가 아니라 public shell
asset `/images/form-and-thought-agent-avatar-v1.png`다. 단일 decision receipt는
`docs/notes/project/assets/form-and-thought-second-brain-avatar/decision-manifest.yml`, 고정 SHA-256은
`f29c064b1c0f77e5906a9c02e5b8e0a573ae6c44373b99fb75532c90fd481f20`이다. receipt의 권리 상태는
`partially_verified`이고 independent legal review는 `not_measured`다. 이 shell asset 예외는
public record나 private memory boundary를 넓히지 않는다.

## public answer release와 binding

`public-release`는 canonical 글 route/목록/media를, `public-answer-release`는 별도 승인된 retrieval
chunk, opaque evidence ID와 public canonical locator만 소유한다. answer builder는 검증된
`public-release`와 `src/data/public-answer-corpus-approval.v1.json`만 입력으로 사용하고 raw MDX나
top-level `memory/**`를 읽지 않는다. embedding vector, raw provider payload와 private locator는
public artifact가 아니다.

active pointer는 exact `(contentReleaseId, answerReleaseId)` 쌍을 결합한다. site loader, browser
request/response header, runtime catalog, PostgreSQL binding과 evidence가 모두 이 snapshot과 일치해야
한다. 현재 local build의 binding은 content
`24a23fee80ee5324f4a468487c6c9cbb333530bebe09d12c6c88bf37d80d8b8a`, answer
`f45777d1dab18244662b63245bcd48a42ab0338f311f150b7d367e509d054214`다. source, approval,
chunker/normalizer 또는 materialized bytes가 바뀌면 ID도 바뀌므로 운영 문서가 이 값에 의존하지 않고
각 verifier가 active pointer를 다시 연다.

## trusted MDX와 memory

`packages/content/src/mdx/render.tsx`가 source MDX를 분석하고 허용된 component만 HTML로
render한다. release verifier는 source map, private locator, forbidden key, raw prompt/job,
embedding payload를 다시 검사한다.

`scripts/memory/project.mjs`가 private-first memory를 `src/data/memory.public.json`으로
projection한다. 공개 thought는 `confidentiality: public`, `surfaces: [memory-public]`, accepted
review, safe source를 모두 만족해야 한다. `loadPublicMemoryRecords()`는 projection JSON만
public record로 변환하며 top-level `memory/**`를 읽지 않는다.

## media와 승인 경계

각 `media.yml`은 source file, checksum, dimensions, alt, credit, provenance, rights를
기록한다. strict validation과 release build가 같은 parser를 사용한다.

아래 규칙은 immutable content-release media에 적용된다. 검색 avatar 같은 public shell asset은
별도 checksum-bound decision receipt와 그 receipt에 적힌 권리 경계를 따른다.

- repository-generated asset은 canonical required-batch registry,
  checksum-bound decision manifest, 정확히 `controller`와 `independent-visual-reviewer`, approved
  rights review가 모두 필요하다.
- 승인되지 않은 candidate/batch는 public release를 fail closed한다.
- review cover는 source/edition tuple과 정확히 controller + independent-rights-reviewer receipt가
  있어야 byte가 public artifact에 들어간다.
- 현재 release는 29 public assets, review cover asset/approval label 0건이다. strict validation의
  17 review-cover warning은 안전한 text-led 결과와 별개로 unresolved rights evidence를 알린다.

## immutable release flow

1. `npm run public-release:build`가 source, MDX, memory와 media를 검증하고 trusted MDX를
   render하며 responsive AVIF/WebP/fallback을 만든다.
2. release identity policy v2가 renderer boundary
   `mdx-3.1.1-sharp-0.35.3-v5`, sanitized source input, 정렬된 materialized public
   records(`bodyHtml` 포함), 정렬된 asset output/checksum을 함께 canonicalize해 SHA-256
   release id를 계산한다. 따라서 같은 source와 output은 같은 ID이고 renderer output, source,
   renderer version 중 하나라도 바뀌면 새 ID다.
3. exact materialized bytes를 `build/public-releases/<release-id>/`에 기록한다. 같은 ID의 기존
   directory가 한 byte라도 다르면 overwrite하지 않고 fail closed하며, 이전 release도 지우거나
   수정하지 않는다.
4. owner/inode/symlink guard를 통과한 `active.json`을 원자적으로 교체한다.
5. `npm run public-release:verify`가 pointer, manifest, 전체 artifact hash, private boundary,
   dimensions와 checksums를 독립 재검증한다.
6. `npm run site:build`가 exact active release binding을 React build 전후 다시 열고 private
   staging에서 prerender/asset/SEO를 검증한 뒤 `apps/site/build/client`를 publish한다.

`npm run public-release:clean-test`는 cleanup authority가 임의 path, repository root, home,
release root를 지울 수 없음을 확인한다. repository recovery는 Git revision과 immutable
release artifact다. 별도 renderer나 rollback app은 없다.

## public answer runtime과 provider seam

`apps/server`는 NestJS 12의 native DI와 Fastify 5 adapter를 composition/HTTP shell로 사용한다.
`domain`과 `application`은 decorator, Nest/Fastify, PostgreSQL, env/fs/path를 import하지 않는 plain
TypeScript이고 application-owned `Symbol` port를 infrastructure adapter가 구현한다. PostgreSQL은
release-bound FTS/`pg_trgm` lexical top 20과 pgvector exact-cosine top 20을 RRF로 합쳐 중복을 제거하고
최대 6개 evidence를 고른다. query embedding, generation, semantic verification은 각각 한 번뿐이며
자동 retry, repair loop, streaming은 없다.

browser가 호출하는 공개 경로는 query 없는 byte-exact `POST /api/public/ask` 하나다. client는 exact
JSON contract, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`를 사용한다.
local Node proxy는 Host/forwarding/request/response header를 allowlist로 새로 만들고, prepared core
Nginx는 `proxy_hide_header`, `proxy_redirect off`, `server_tokens off`로 승인된 13개 forbidden response
header 이름을 숨긴다. core Nginx가 임의 미래 header를 wildcard allowlist로 막는다고 주장하지 않는다.
다른 `/api/*`, health, database, studio/worker route는 public host에 연결하지 않는다.

runtime은 request-local catalog snapshot과 response release header를 exact active pair에 결합한다.
release mismatch, insufficient evidence, unsupported question, provider disabled/error, malformed or invalid
citation, semantic contradiction, timeout, rate/cost/concurrency limit은 생성 답변 대신 deterministic
search 결과로 귀결된다. claim의 모든 문장은 같은 answer release의 evidence ID를 가져야 하며
canonical locator는 provider output이 아니라 verified catalog가 다시 결합한다.

질문, 답변, excerpt와 provider payload는 application/server log와 telemetry에 남기지 않고 raw
retention은 0일이다. 저장되는 request event는 release prefix, result/error kind, latency/token/count/rate
bucket뿐이며 7일 만료, daily aggregate는 90일 만료다. UI는 질문과 선택된 공개 발췌가 설정된 AI
제공자에게 전달된다는 사실을 제출 전에 공개한다. Responses generation/semantic request의
`store:false`나 fixture mode는 production Zero Data Retention 증거가 아니다. 별도 provider-admin
data-control receipt, provider embedding receipt, edge/backup/deletion/retention/ownership evidence와
실제 production origin이 없으므로 live provider readiness, provider quality, production deploy와 traffic은
`not_measured`이고 권한도 없다.

local mandatory drill은 fixture keyless mode에서 exact browser → local proxy → Nest → disposable
PostgreSQL 경로를 사용한다. redirect trap, status/fallback, raw-question privacy, response/request header
seal, rate limit, navigation/BFCache, abort-ignoring browser deadline과 `pg_sleep` TCP-close cancellation을
실제 process/socket에서 검증한다. fixture vector와 deterministic answer는 production readiness나 hidden
corpus metric을 통과시키지 않는다.

## delivery origin과 static host

`npm run site:build`는 local mode다. canonical/robots에는 reserved
`https://form-thought.local.invalid`를 사용하며 production origin이라고 주장하지 않는다.

production artifact는 다음처럼 normalized exact HTTPS origin을 명시한다.

```bash
FORM_THOUGHT_SITE_ORIGIN=https://example.com npm run site:build:production
```

userinfo, path, query, fragment, HTTP, `.invalid` production origin은 거부한다. 이 저장소에는
승인된 실제 production domain이 없으므로 production canonical origin은 `not_measured`,
production cutover authorization은 `false`다. build나 문서 갱신은 deploy/traffic authority가
아니다.

static export는 absolute canonical/OG, sitemap, robots, branded 404, favicon/manifest와 CSP,
Referrer-Policy, `nosniff`를 만든다. local preview는 `apps/site/serve-static.ts`가 동일한 404와
header contract를 제공한다.

## no-JavaScript boundary

wordmark, primary navigation, list/detail links, article filters와 search form은 canonical
anchor/GET form이다. Home, indexes와 details는 prerender HTML로 읽고 이동할 수 있다.

검색은 `ssr: false` static export다. 하나의 `/search/index.html`은 임의 query별 결과 HTML을
만들 수 없다. JavaScript-off에서 GET은 `/search/?q=...` canonical URL로 이동하지만 query
filtering, input restoration과 질문형 answer flow는 `not satisfied`다. 기본 prerender는 base
composer와 질문/provider 처리 disclosure를 제공하며 이를 임의 질문의 SSR/RAG 답변이라고 부르지
않는다. JavaScript POST는 raw 질문을 URL/history/session storage에 복사하지 않고 실패 결과의 detail
link는 canonical-only다. 직접 GET/reload/popstate/BFCache의 기존 deterministic 결과와 scroll 복원은
location-derived state에서만 이어 간다.

## 주요 명령

```bash
npm ci
npm run site:dev
npm run public-release:build
npm run public-release:verify
npm run public-answer-release:build
npm run public-answer-release:verify
npm run server:index:fixture
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
npx tsx tests/e2e/run-search-provider-stack.mts
npm run validate
```

`npm run validate`의 순서는 agent contract, content, strict media, article quality, memory,
전체 Vitest, workspace typecheck, release build/verify/cleanup, local site build다. public delivery
전체 확인은 exact retained Playwright suite와 `npm run cutover:verify`, public-answer end-to-end는
`tests/e2e/run-search-provider-stack.mts`, clean machine recovery는 `npm run cutover:clean-host`가
소유한다. 이 명령 이름의 `cutover`는 유지된 React-only verifier namespace이며 제거된 renderer
비교를 실행하지 않는다.

## 문서와 역사

현재 문서는 [프로젝트 허브](README.md)다. accepted ADR은 결정 이력이므로 삭제하지 않는다.
Astro, Public Atlas, renderer 비교, cutover 증거는 [레거시 종료 기록](history/README.md)에
있다. 그 문서의 옛 command, path, renderer를 실행 복구하지 않는다. Graphify는 article
subject일 뿐 project operating dependency가 아니다.
