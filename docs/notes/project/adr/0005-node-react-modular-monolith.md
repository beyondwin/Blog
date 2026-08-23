# ADR-0005: Node/React 모듈러 모놀리스와 분리된 공개 projection

- Status: accepted
- Date: 2026-08-23
- Last amended: 2026-08-24
- Decision owners: user / project
- Supersedes: none
- Superseded by: none

## Context

현재 `beyondwin`은 Astro와 typed MDX collection으로 79개 정적 페이지를 생성한다. 공개 조건, media provenance, private memory projection, no-JS navigation, reduced motion, 정확한 focus/scroll 복귀는 이미 테스트와 browser evidence로 고정돼 있다.

다음 제품 단계는 공개 읽기 화면만 바꾸는 일이 아니다. 한 명의 소유자가 자료를 수집하고 검토하는 비공개 작업실, 인증, PostgreSQL, 검색과 RAG, 수집·변환·임베딩 background job, 명시적 공개 release가 필요하다. 사용자는 서버를 Node.js로, 화면을 React와 TypeScript로 구성하고, 품질을 최우선으로 하되 필요 이상의 운영 복잡도는 만들지 않도록 승인했다.

기존 [ADR-0001](0001-private-first-knowledge-product.md)은 private-first product와 curated public projection을, [ADR-0003](0003-visual-storyworld-experience-model.md)은 공개와 비공개 renderer/허용 field의 분리를 고정했지만 runtime, persistence, retrieval, deployment topology는 열린 질문으로 남겼다. 이 ADR은 그 빈칸을 채운다.

## Decision

### 제품 용어

현재 제품 문서와 새 UI에서는 역할을 바로 알 수 있는 다음 용어를 사용한다.

| 표준 용어 | 의미 | 과거 문서의 용어 |
| --- | --- | --- |
| 공개 사이트 | 방문자가 공개된 글, 책, 문장, media를 탐색하고 읽는 영역 | Public Atlas |
| 내 작업실 | 소유자가 자료를 수집하고 작성·검토·공개하는 비공개 영역 | Private Studio / Material Field |
| 다시 보기 | 잊힌 비공개 자료를 다시 제안하는 작업실 기능 | Resurface |
| 탐색 화면 | 공개 자료의 관계를 장면으로 둘러보는 화면 | Visual Storyworld |

과거 ADR과 승인 evidence의 이름은 역사적 맥락으로 보존한다. 새 문서와 사용자-facing copy에서는 위 표준 용어를 사용한다.

### 애플리케이션과 runtime

하나의 TypeScript repository 안에 다음 세 실행 단위를 둔다.

1. `apps/site`: Next.js App Router를 우선 후보로 검증하는 공개 사이트. 비교 게이트에서 탈락하면 React Router Framework Mode를 사용한다.
2. `apps/studio`: Vite와 React Router Data Mode 기반 비공개 작업실 SPA.
3. `apps/server`: Fastify HTTP entry와 Node worker entry를 공유하는 modular monolith.

Node 24 LTS와 npm workspaces를 사용한다. `apps/server`의 API와 worker는 별도 process로 실행할 수 있지만 같은 domain/application/database module을 직접 공유하며 서로 HTTP로 호출하지 않는다.

공개 사이트의 Next.js 사용은 다음 제한을 갖는다.

- 공개 content route를 build time에 prerender한다.
- React Server Component를 기본으로 사용하고 실제 interaction만 좁은 client boundary로 둔다.
- Route Handler, Server Action, business BFF, private DB connection, auth, ISR을 초기 범위에서 사용하지 않는다.
- 첫 vertical slice는 같은 framework-neutral contract와 asset으로 Next.js와 React Router Framework Mode에 각각 구현하고, 기존 Astro를 parity baseline으로 삼아 route HTML, metadata, MDX, responsive media, no-JS navigation, client JavaScript, LCP, interaction을 비교한다.
- Next.js가 React Router 구현보다 최소 두 품질 항목에서 측정 가능한 이점을 보이지 않으면 sunk cost 없이 public renderer도 React Router Framework Mode로 통일한다.

### 공개 renderer 품질 게이트

2026-08-24에 공개 renderer 비교의 수치 budget과 측정 protocol을 다음과 같이 accepted decision으로 고정했다.

- Mandatory budget은 route/viewport별 `CLS <= 0.05`, `LCP <= 같은 Astro baseline + 10%`, 세 detail route의 initial JavaScript `<= 110 KiB gzip`이다.
- Mandatory contract는 canonical metadata, title/description/Open Graph, heading과 본문, no-JS href, external provenance/source href, media dimensions와 responsive contract를 보존하고 console error, hydration error, serious/critical axe finding, private-path leak, viewport overflow가 각각 0이어야 한다.
- 비교 route는 `/`, `/articles/why-i-read-in-the-ai-era/`, `/reviews/black-swan/`, `/memory/agent-harnesses-are-operating-systems/` 네 개로 제한한다.
- viewport는 desktop `1440x960`, mobile `390x844`를 사용한다. 각 route/viewport에서 discarded warm-up 1회 뒤 production output의 cold sample 5회를 기록한다. Sample마다 새 browser context를 만들고 HTTP cache를 비운다.
- Route/viewport metric은 median과 median absolute deviation(MAD)을 함께 기록한다. Candidate advantage는 정해진 margin뿐 아니라 두 candidate 중 큰 MAD의 2배도 초과해야 한다.
- Initial JavaScript byte는 각 cold sample에서 executable inline script와 중복 제거한 initial executable response를 각각 gzip level 9로 압축한 byte 수의 합이다. `script` response뿐 아니라 JavaScript MIME response, Next bootstrap inline script, `.rsc`/`text/x-component` payload를 포함하고 JSON 등 non-executable script는 제외한다.
- 세 build sample은 매번 renderer output과 renderer-local cache를 명시적으로 제거한 뒤 시작한다. Report는 build command, working directory, 삭제한 repository-contained path를 sample마다 기록하며 final artifact는 마지막 clean build hash와 일치해야 한다. Astro baseline은 `dist`와 `node_modules/.astro`만 제거한다.
- Evidence schema v2에서는 정확히 다섯 raw cold sample을 authoritative input으로 삼아 median/MAD, issue union, overflow, byte aggregate, build summary를 다시 계산한다. Stored summary가 raw evidence와 다르거나 sample/route/viewport가 빠지거나 추가되면 fail-closed한다.
- Private boundary는 HTML만이 아니라 owned output root의 JavaScript, CSS, JSON, source map과 binary를 포함한 전체 artifact file set에 repository 공통 policy를 적용한다. Symlinked root/file은 거부하고 artifact-relative evidence를 남긴다.
- Responsive-image evidence와 image-byte advantage는 표시 크기가 양수인 image 중 response가 성공하고 decode되며 natural/declared dimensions, aspect ratio, declared source와 `currentSrc`, response format이 일치하는 image만 포함한다. 표시되지 않는 decorative duplicate는 비교 집합에서 제외하고, 보이는 broken image는 mandatory failure다.
- Next.js의 네 advantage category는 (1) LCP가 10%와 75ms를 모두 초과해 개선, (2) gzip JavaScript가 15%와 10 KiB를 모두 초과해 감소, (3) 같은 표시 dimensions/format의 responsive-image transfer가 15%를 초과해 감소, (4) 세 clean build가 같은 route/asset contract를 만들면서 median build time이 20%를 초과해 개선되는 경우다.
- Browser pin은 committed `package-lock.json`의 `@playwright/test` `1.62.1`이 결정하는 Chromium `151.0.7922.34`, revision `1234`다. Pin과 실제 실행 version이 다르면 report를 만들지 않는다.
- Astro 측정값은 [tracked baseline fixture](../../../../tests/fixtures/parity/astro-renderer-baseline.json)에 보존한다. Real capture는 candidate commit, renderer별 root/manifest/build command/output, manifest hash, artifact hash, browser pin, 전체 renderer harness source-set hash, exact protocol을 기록하며 comparison 시 현재 local evidence와 다시 대조한다. 이 chain은 repository를 재작성할 수 있는 operator에 대한 암호학적 증명이 아니라 같은 local checkout 안의 accidental/stale/forged evidence를 fail-closed하는 bounded trust다. Next.js와 React Router의 실제 candidate report가 모두 생기기 전에는 renderer selection을 차단하며 synthetic fixture는 selector CLI의 입력으로 허용하지 않는다.

### host와 인증 경계

- 공개 host는 공개 사이트 process에만 연결한다.
- 작업실 host는 정적 React asset을 제공하고 같은 origin의 `/api/*`를 Fastify로 proxy한다.
- browser는 별도 API origin을 직접 호출하지 않는다. CORS를 기본적으로 사용하지 않는다.
- API 전용 subdomain은 CLI나 automation 요구가 생길 때까지 외부에 공개하지 않는다.
- session cookie는 `Secure`, `HttpOnly`, `Path=/`, no `Domain`인 host-only `__Host-` cookie를 사용하고 parent domain cookie를 금지한다.
- PostgreSQL, worker, private object storage는 Docker private network 안에 둔다.

### 데이터와 공개 경계

PostgreSQL 하나를 canonical application database로 사용한다. 초기 검색은 relational filter, `pg_trgm`, PostgreSQL full-text search, pgvector exact search를 조합한다. 별도 search/vector/graph database는 측정된 한계가 생기기 전까지 도입하지 않는다.

공개 사이트는 canonical private table을 조회하지 않는다. 사람이 승인한 field만 allowlist로 조립한 immutable, versioned public release artifact를 소비한다. 공개 site build/runtime에는 private DB credential, raw source, embedding, prompt, private path를 제공하지 않는다.

공개는 다음 상태 전이로만 일어난다.

```text
draft/review
  -> human approval
  -> validation run
  -> release building
  -> release ready
  -> atomic active-release switch
```

공개 취소도 기존 release를 수정하지 않고 새 release를 활성화한다. public search와 public RAG는 private result를 조회한 뒤 filtering하지 않고, release-scoped public projection만 검색한다.

### job, object, AI 경계

Background job은 PostgreSQL-backed Graphile Worker를 사용한다. Redis와 별도 broker는 도입하지 않는다. Queue delivery를 exactly-once로 가정하지 않으며 ingestion, embedding, AI, publication handler는 content hash, provider/model, prompt version, release id를 포함한 business idempotency receipt를 가진다.

Media와 source bytes는 처음에는 content-addressed filesystem에 저장한다. PostgreSQL은 checksum, MIME, size, dimensions, provenance, rights-review state와 binding을 보관한다. API와 worker만 private object root에 접근하고 public site는 활성 public release asset만 read-only로 소비한다. Multi-host 요구가 생기면 같은 interface 뒤를 S3-compatible storage로 바꿀 수 있다.

AI output과 retrieval result는 suggestion이다. Canonical revision, relation approval, publication approval을 직접 변경할 수 없다. 외부 문서와 retrieved text는 instruction이 아니라 untrusted data로 취급한다.

### repository 구조

```text
apps/
  site/
  studio/
  server/
packages/
  domain/
  contracts/
  content/
  publication/
  db/
  ui/
tools/
  migrate-content/
tests/
  contract/
  integration/
  e2e/
deploy/
  compose.yml
  reverse-proxy/
  backup/
```

`packages/ui`는 CSS token과 실제로 공유되는 accessible primitive만 가진다. App shell, router, API client, public 탐색 화면, 작업실 feature를 억지로 공통화하지 않는다. Nx, Turborepo, Kubernetes, service mesh는 현재 도입하지 않는다.

## Decision evidence

- 2026-08-23 사용자 결정: 서버는 Node.js, 화면은 React와 TypeScript로 구성한다.
- 2026-08-23 사용자 결정: 공개 사이트뿐 아니라 내 작업실, 인증, DB, 검색/RAG, background job까지 확장 가능한 구조로 설계한다.
- 2026-08-23 사용자 결정: 한 명의 소유자가 사용하는 개인용 시스템이며 multi-tenant SaaS는 현재 범위가 아니다.
- 2026-08-23 사용자 결정: 한 Docker host에서 시작하되 process를 나중에 분리할 수 있어야 한다.
- 2026-08-23 사용자 결정: 품질을 최우선으로 하되 품질에 기여하지 않는 복잡도는 도입하지 않는다.
- 2026-08-24 사용자 결정: renderer mandatory budget, 네 advantage threshold, median/MAD protocol을 승인하고 중간 승인 checkpoint 없이 보수적인 재현성 기준으로 고정한다.
- Evidence schema v2로 다시 캡처한 Astro browser baseline은 `dist`와 `node_modules/.astro`를 각 sample 전에 비우고 세 build 모두 동일 artifact hash `sha256:665bfcb58b569c1795d0942d6ee6b060b6424b1cfbac8196cb400529e727d22a`를 만들었으며 build median `7,256ms`, MAD `68ms`를 기록했다. 40개 cold sample에서 console/hydration/image/private-path/overflow issue는 0이었고 full-artifact private-boundary hit도 0이었다. 기존 mobile home의 serious color-contrast finding 1건은 candidate가 승계해서는 안 되는 baseline evidence로 보존했다.
- 공식 Next.js 문서는 self-hosting, build-time params, MDX와 image optimization을 지원하지만 Route Handler를 완전한 backend replacement로 설명하지 않는다.
- 공식 React Router 문서는 Data Mode SPA와 Framework Mode SSR/prerender를 구분한다.
- Fastify response schema와 plugin encapsulation은 public/private DTO와 vertical module 경계에 적합하다.
- PostgreSQL과 pgvector는 relational, text, vector retrieval을 한 transaction system 안에서 시작할 수 있다.
- Graphile Worker는 PostgreSQL transaction과 함께 job을 enqueue할 수 있지만 at-least-once handler가 필요하다.
- 저장소 inspection에서 Astro 결합점은 content collection, `astro/zod`, `CollectionEntry`, `astro:assets`, `ImageMetadata`, `import.meta.glob`, 29개 `.astro` file로 확인됐다. Corpus는 41개 MDX record다.

## Consequences

### 얻는 것

- 공개 application과 private data의 capability boundary가 import convention이 아니라 release artifact와 credential로 분리된다.
- React/TypeScript를 사용하면서 공개 읽기와 비공개 작업의 서로 다른 rendering 요구를 존중한다.
- API와 worker는 process isolation을 가지되 domain rule과 transaction을 중복 구현하지 않는다.
- PostgreSQL 하나로 시작해 backup, migration, search, job 운영 surface를 줄인다.
- Astro 제거를 big-bang rewrite가 아니라 parity가 증명된 마지막 단계로 미룬다.

### 지불하는 비용

- 초기에는 Next.js와 Vite/React Router 두 frontend toolchain을 유지한다.
- immutable public release를 만들고 검증하는 publication pipeline이 필요하다.
- DB와 filesystem은 atomic transaction을 공유하지 않으므로 orphan cleanup과 restore verification이 필요하다.
- job handler, AI call, publication build는 duplicate execution을 견뎌야 한다.
- Next.js public vertical slice가 품질 gate를 통과하지 못하면 public renderer 결정을 다시 적용해야 한다.

### 구현 제약

- public package는 `db`, private `domain` repository, private API contract를 import할 수 없다.
- External intake를 runtime에 arbitrary MDX로 compile하지 않는다.
- `published && !draft`, public memory allowlist, media provenance/rights, route canonical behavior를 migration gate로 보존한다.
- `memory/**`, private object, source map, raw prompt/job payload가 public build context와 log에 들어가지 않는 negative test를 둔다.
- backup 존재가 아니라 clean-host restore와 public smoke가 성공해야 복구 가능하다고 본다.

## Alternatives considered

### Next.js full stack

Public과 작업실, API를 한 Next.js application으로 합치면 시작은 빠르지만 private boundary, job, long-running ingestion, API contract가 UI framework convention에 결합한다. Next.js Route Handler를 backend replacement로 사용하지 않는다.

### Next.js를 두 frontend에 사용

공개 사이트에는 prerender, server component, image pipeline의 이점이 있지만 작업실 SPA에는 두 번째 Next runtime과 server/client boundary가 필요하지 않다. Vite와 React Router Data Mode를 사용한다.

### React Router를 두 frontend에 사용

하나의 frontend ecosystem이라는 장점이 있다. 하지만 현재 공개 corpus에서 deterministic responsive image pipeline과 low-hydration reading route를 직접 소유해야 한다. 첫 Next.js vertical slice가 실제 이점을 증명하지 못할 경우의 승인된 fallback으로 둔다.

### Microservices

한 명이 운영하는 현재 규모에서 network boundary, distributed transaction, deployment/observability surface만 늘린다. API와 worker는 같은 modular monolith의 다른 entry point로 유지한다.

### 별도 Redis, vector DB, graph DB

현재 corpus와 single-host deployment에서 별도 stateful system의 backup, restore, consistency 비용을 정당화할 측정값이 없다. PostgreSQL의 한계가 확인된 뒤 추가한다.

## Open questions

- 단일 owner의 첫 인증 방식을 password bootstrap, external OIDC, passkey 중 무엇으로 할지.
- 공개 vertical slice에서 Next.js와 React Router 중 어느 renderer가 accepted gate를 실제로 통과하고 선택되는지. Task 6-7 candidate evidence 전에는 미정이다.
- 허용 RPO/RTO와 PostgreSQL dump 이후 PITR 도입 시점.
- public release build를 local worker, CI, 별도 build process 중 어디서 실행할지.
- exact dependency version과 update cadence. `latest` range는 사용하지 않는다.

## Follow-up

- [Node/React 모듈러 모놀리스 상세 설계](../node-react-modular-monolith-design.md)를 구현 가능한 boundary와 migration gate의 source로 사용한다.
- 첫 implementation plan은 parity manifest와 framework-neutral content package부터 시작한다.
- public vertical slice는 홈, article, review, memory route를 포함하고 Next.js 유지/React Router 통일 decision gate를 실행한다.
- Astro는 route, content, media, browser parity와 rollback evidence가 모두 통과한 뒤 마지막에 제거한다.

## Primary references

- https://nextjs.org/docs/app/guides/self-hosting
- https://nextjs.org/docs/app/guides/backend-for-frontend
- https://nextjs.org/docs/app/guides/mdx
- https://reactrouter.com/start/modes
- https://reactrouter.com/start/framework/rendering
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- https://fastify.dev/docs/latest/Reference/Plugins/
- https://www.postgresql.org/docs/current/textsearch.html
- https://github.com/pgvector/pgvector
- https://worker.graphile.org/docs
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
