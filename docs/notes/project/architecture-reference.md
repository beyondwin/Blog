# 아키텍처 레퍼런스

`beyondwin`의 현재 공개 built truth는 React Router Framework Mode static prerender와
checksum-addressed immutable public release다. `apps/site`가 유일한 renderer이고,
`packages/content`와 `packages/contracts`가 source schema, trusted MDX, media와 release
검증을 소유한다. 과거 renderer 비교, rollback, Public Atlas 자료는 immutable history이며
현재 실행 경로가 아니다.

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
| delivery | `apps/site/build-static-export.ts`, `apps/site/serve-static.ts` | verified release binding, atomic staging, assets, SEO/404/security headers, static host |

PostgreSQL, Fastify API, studio와 worker는 [ADR-0005](adr/0005-node-react-modular-monolith.md)의
장기 architecture target이다. 이 공개 사이트 구현이 그 server-side target까지 구현했다는
뜻은 아니다.

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
memory는 tags/secondary navigation에서는 유지하지만 primary search에서는 제외한다. 검색
loader는 이 inventory와 공개 thought의 문장을 build-time에 대조한 최소 answer fixture만
직렬화한다. raw `bodyHtml`, private locator와 top-level `memory/**`는 질문 UI에 전달하지 않는다.
현재는 승인된 sample question만 이 fixture로 답하고, 나머지 질문은 deterministic search
result로 분기한다. RAG/LLM provider는 아직 존재하지 않는다.

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
filtering, input restoration과 질문형 answer flow는 `not satisfied`다. 기본 prerender는
질문 composer와 승인된 sample만 제공하며 이를 임의 질문의 SSR/RAG 답변이라고 부르지 않는다.

## 주요 명령

```bash
npm ci
npm run site:dev
npm run public-release:build
npm run public-release:verify
npm run site:build
npm run site:preview -- --host 127.0.0.1 --port 4391
npm run validate
```

`npm run validate`의 순서는 agent contract, content, strict media, article quality, memory,
전체 Vitest, workspace typecheck, release build/verify/cleanup, local site build다. public delivery
전체 확인은 exact retained Playwright suite와 `npm run cutover:verify`, clean machine recovery는
`npm run cutover:clean-host`가 소유한다. 이 명령 이름의 `cutover`는 유지된 React-only verifier
namespace이며 제거된 renderer 비교를 실행하지 않는다.

## 문서와 역사

accepted ADR과 evidence는 삭제하지 않는다. ADR-0002/3/4/6과 ADR-0005의 renderer-retention
절, 과거 comparison/cutover evidence는 역사적 판단을 설명한다. 현재 작업자는 그 문서의
옛 command, path, renderer를 실행 복구하지 않고 ADR-0007, 이 reference, `DESIGN.md`와 실제
package scripts를 따른다. Graphify는 article subject일 뿐 project operating dependency가 아니다.
