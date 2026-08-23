# Node/React 모듈러 모놀리스 상세 설계

- Status: approved design, not implemented
- Date: 2026-08-23
- Governing decision: [ADR-0005](adr/0005-node-react-modular-monolith.md)
- Current built truth: Astro/MDX static site
- Target: Node.js server, React/TypeScript UI, PostgreSQL-backed private workspace and curated public release

## 1. 목적

이 설계는 현재 Astro 사이트를 즉시 삭제하는 문서가 아니다. 기존 공개 route와 content/media/memory 계약을 검증 가능한 방식으로 보존하면서 다음 목표 구조로 이동하기 위한 경계와 순서를 정의한다.

- 방문자가 읽는 공개 사이트.
- 한 명의 소유자가 자료를 수집하고 작성·검토·공개하는 내 작업실.
- 인증, database, 검색과 RAG를 제공하는 Node API.
- URL/PDF/media 수집, parsing, embedding, AI, public release를 처리하는 background worker.
- private canonical data에서 사람이 승인한 field만 내보내는 immutable public projection.

품질을 보호하는 복잡성만 허용한다. Public/private credential 분리, durable job, idempotency, backup/restore, browser parity는 유지한다. Redis, microservice, 별도 vector DB처럼 아직 측정값이 없는 운영 surface는 만들지 않는다.

## 2. 표준 용어

| 용어 | 사용 위치 | 설명 |
| --- | --- | --- |
| 공개 사이트 | 제품·설계·운영 문서 | 방문자가 공개된 자료를 탐색하고 읽는 surface |
| 내 작업실 | 제품·설계·운영 문서 | 소유자의 private authoring, review, publication surface |
| 다시 보기 | 내 작업실 feature | 잊힌 자료를 다시 제안하고 유지·연결·숨김을 결정하는 기능 |
| 탐색 화면 | 공개 사이트 UI | 승인된 자료 사이의 관계를 장면으로 둘러보는 화면 |
| public release | 구현·운영 문서 | 한 시점에 공개 가능한 allowlisted data와 asset의 immutable artifact |

`Public Atlas`, `Private Studio`, `Material Field`, `Resurface`, `Visual Storyworld`는 과거 ADR과 승인 evidence를 찾기 위한 historical alias로만 남긴다.

## 3. 현재 상태와 migration 표면

현재 build는 Astro content collection과 route convention에 의존한다.

- 41개 MDX record와 29개 `.astro` file.
- `src/content.config.ts`의 schema와 `astro/zod`.
- `astro:content`의 `getCollection`, `render`, `getStaticPaths`.
- `astro:assets`, `ImageMetadata`, `import.meta.glob`을 사용하는 media registry.
- `published && !draft` selector.
- `memory/**`에서 `src/data/memory.public.json`으로 이어지는 private-first projection.
- media checksum, dimension, provenance, rights, HOLD state validation.
- 공개 탐색 화면의 no-JS canonical links, reduced motion, exact focus/scroll return.

새 구조는 이 동작을 application rule로 추출해야 한다. Astro API 이름만 React API로 번역하고 기존 rule을 흩어 놓는 방식은 허용하지 않는다.

## 4. 시스템 경계

```text
Internet
   |
reverse proxy / TLS
   |-- <public-host> ----------> apps/site
   |                              |-- public release only
   |
   `-- <studio-host> ----------> apps/studio static assets
          |
          `-- /api/* -----------> apps/server HTTP entry
                                      |
                                      |-- PostgreSQL
                                      `-- private object storage

Docker private network
   |-- apps/server worker entry ------ PostgreSQL / private objects / AI / web
   |-- migrator ---------------------- schema owner role
   `-- backup ------------------------ encrypted off-host backup
```

`<public-host>`와 `<studio-host>`의 실제 hostname은 배포 설정에서 정한다. 초기 운영은 한 Docker host다. Reverse proxy만 80/443을 공개한다. PostgreSQL과 worker에는 external ingress가 없다. API와 worker는 같은 image 또는 package에서 서로 다른 command로 실행할 수 있지만 process lifecycle은 분리한다.

## 5. 애플리케이션 설계

### `apps/site`: 공개 사이트

책임:

- 공개 listing/detail/tag/search/memory route.
- 공개 탐색 화면과 article/review reading surface.
- canonical metadata, sitemap, robots, Open Graph data.
- public release asset과 allowlisted view model rendering.

금지:

- private database credential.
- login/session 처리.
- private API contract import.
- runtime arbitrary MDX compilation.
- Next Route Handler, Server Action, business BFF.
- private search 후 visibility filtering.

초기 Next.js 규칙:

- App Router와 Node 24 LTS.
- content route는 `generateStaticParams`로 build-time prerender.
- reading route는 Server Component가 기본.
- 탐색 화면처럼 browser state가 필요한 부분만 leaf Client Component.
- `next/image` 또는 deterministic generated media index가 기존 dimensions/checksum/provenance contract를 잃지 않아야 한다.
- Cache Components, ISR, dynamic public DB query는 초기 범위 밖이다.

### `apps/studio`: 내 작업실

Vite와 React Router Data Mode의 SPA다. Route module은 화면 orchestration만 맡고 canonical rule은 `packages/domain`과 API에 둔다.

첫 기능 순서:

1. session bootstrap과 명시적 logout.
2. material list/detail.
3. source intake와 job status.
4. revision edit와 optimistic concurrency conflict recovery.
5. AI suggestion review.
6. validation result와 explicit publish approval.
7. release status와 rollback.

Studio는 현재 page의 `/api`와 같은 same-origin path로 API를 호출한다. 브라우저가 API subdomain을 직접 사용하지 않는다.

### `apps/server`: Fastify API와 Node worker

두 composition root를 가진다.

```text
src/http.ts    -> Fastify, auth, route schema, transaction boundary
src/worker.ts  -> Graphile Worker task registry, heartbeat, graceful shutdown
```

API와 worker는 `packages/domain`, `packages/db`, `packages/publication`을 공유한다. 내부 HTTP로 domain operation을 재호출하지 않는다.

Fastify route는 request와 response schema를 모두 선언한다. Response schema는 database row가 아니라 명시적 DTO allowlist다. OpenAPI 또는 schema-derived client는 이 contract에서 만든다.

## 6. Package boundary

### `packages/domain`

- record identity와 revision.
- lifecycle과 publication eligibility.
- relation reason, human/AI origin, review status.
- validation result와 release state transition.
- framework, HTTP, database에 의존하지 않는 pure rule.

### `packages/contracts`

- private API request/response schema.
- public release schema.
- schema version과 compatibility rule.
- database row type이나 private internal error를 export하지 않는다.

### `packages/content`

- filesystem-era MDX/frontmatter loader.
- normalized content hash.
- current schema/default와 `published && !draft` preservation.
- allowed MDX component registry.
- headings, reading text, route inventory.
- generated media index.

### `packages/publication`

- validation orchestration.
- allowlisted public DTO 조립.
- rendered body와 asset manifest 생성.
- immutable release staging, verification, activation.
- active release rollback.

### `packages/db`

- timestamped forward-only migration.
- repository와 transaction helper.
- PostgreSQL FTS, `pg_trgm`, pgvector query.
- runtime role과 migrator role 분리.

### `packages/ui`

- CSS design token.
- focus treatment, button, dialog처럼 실제로 양쪽에서 같은 accessible primitive.
- router, app shell, API client, 탐색 화면과 작업실 feature는 포함하지 않는다.

## 7. 데이터 모델

처음부터 모든 subtype을 nullable column으로 펼치지 않는다. Stable identity와 revision을 정규화하고 collection-specific metadata는 validated JSONB로 시작한다.

Foundation table:

- `app_users`, `sessions`.
- `records`, `record_revisions`.
- `relations`.
- `sources`, `source_versions`, `record_sources`.
- `media_objects`, `record_media`.
- `validation_runs`.
- `publication_releases`, `publication_items`, `publication_assets`, `publication_pointer`.
- `legacy_imports`.
- `api_idempotency_keys`.
- `audit_events`.

Ingestion/RAG 단계에서 추가:

- `ingestion_runs`.
- `chunks`.
- `embeddings`.
- `ai_runs`, `ai_suggestions`.

Embedding row는 provider, exact model, dimensions, content hash를 key로 가진다. Model 변경 시 기존 vector를 덮어쓰지 않는다.

## 8. Publication과 public projection

Public release는 private row의 view가 아니라 별도 artifact다.

```text
canonical revision
  -> human-approved publication intent
  -> deterministic validation
  -> allowlisted DTO
  -> rendered body + public asset manifest
  -> staging verification
  -> ready release
  -> atomic pointer switch
```

Release는 최소한 다음을 기록한다.

- release id와 schema/renderer version.
- source revision ids와 hashes.
- allowlisted public content payload.
- public asset checksum과 paths.
- validation run id.
- approver와 approval time.
- build result와 activation time.

Public site에는 raw private path, rejected relation, AI prompt/response, embedding, private source title, internal ids를 보내지 않는다. Negative fixture는 build artifact와 source map까지 검사한다.

## 9. Job과 idempotency

Graphile Worker task 예시:

- `ingest-source`.
- `extract-document`.
- `index-chunks`.
- `embed-chunks`.
- `generate-suggestion`.
- `build-public-release`.
- `verify-public-release`.

Queue key만으로 exactly-once를 주장하지 않는다. Handler마다 business receipt를 둔다.

```text
ingest:{source-id}:{source-hash}
embed:{chunk-hash}:{provider}:{model}
ai:{purpose}:{input-hash}:{prompt-version}:{model}
publish:{release-id}
```

Job payload에는 raw document, credential, full prompt를 넣지 않고 ids와 hashes만 둔다. Bounded retry, backoff, permanent failure state, manual retry/cancel action을 제공한다.

## 10. Search와 RAG

검색은 작은 corpus에 맞춰 순차적으로 확장한다.

1. Exact title/slug/tag filter.
2. `pg_trgm` similarity와 substring search.
3. PostgreSQL `simple` text configuration의 실제 한국어/영어 corpus 평가.
4. pgvector exact similarity.
5. lexical/vector rank fusion.
6. 데이터 규모와 latency/recall measurement가 필요할 때만 HNSW.

Retrieval quality는 고정 evaluation corpus로 측정한다. Private와 public query는 table 또는 release scope부터 분리한다. Retrieved source는 prompt의 instruction 영역과 구조적으로 분리하고, AI가 publication이나 destructive tool을 직접 실행하지 못하게 한다.

## 11. Media와 object storage

초기 storage layout:

```text
private-objects/sha256/ab/<digest>
public-releases/<release-id>/assets/...
```

Write order:

1. Same-filesystem temporary file에 size limit을 적용해 stream.
2. MIME magic, raster dimensions, decompression/page limit 검사.
3. SHA-256 계산.
4. Flush 후 content-addressed path로 atomic rename.
5. PostgreSQL metadata/reference 저장.

DB failure 뒤 orphan blob은 retention 기간 후 수거한다. Reference가 있는데 blob이 없는 상태보다 안전하다. Checksum은 byte identity이지 redistribution right 증명이 아니므로 기존 rights note와 HOLD state를 보존한다.

## 12. 인증과 web security

확정된 경계:

- signup, organization, RBAC, multi-tenancy 없음.
- sole owner는 offline bootstrap으로 만든다.
- opaque server-side session.
- `Secure`, `HttpOnly`, `Path=/`, no `Domain`인 host-only `__Host-` SameSite cookie.
- unsafe method의 exact Origin 검증과 CSRF protection.
- login rate limit, session rotation/revocation, idle/absolute timeout.
- auth header, cookie, raw prompt/source/job payload log redaction.

Password, external OIDC, passkey 중 첫 login method는 implementation plan 전에 별도 선택한다.

## 13. Backup, restore, observability

초기 backup:

- nightly `pg_dump -Fc`와 globals dump.
- content-addressed private objects와 public releases의 encrypted off-host copy.
- DB dump hash, object manifest, schema version, active release id를 하나의 backup manifest로 기록.
- 주기적으로 disposable environment에서 restore하고 object reference와 public smoke를 검증.

RPO가 dump interval보다 짧아져야 할 때만 WAL/PITR을 추가한다.

초기 observability:

- Fastify Pino JSON log와 request id.
- job id, task, attempt, record/revision/release id.
- `/health/live`, `/health/ready`.
- worker heartbeat, oldest runnable job age, retry/permanent failure count.
- AI usage/cost와 error class.
- PostgreSQL connection과 slow query.
- login, revoke, approve, publish, rollback, restore audit event.

OpenTelemetry collector stack은 cross-process trace 필요가 측정될 때까지 보류한다.

## 14. Migration strategy

### Phase 0: parity manifest

- Current public route inventory와 canonical/trailing-slash behavior.
- HTML metadata, heading, links, redirect.
- public content count와 normalized frontmatter/body hash.
- media manifest/asset checksum.
- public memory JSON.
- desktop/mobile/no-JS/reduced-motion/focus-return browser baseline.

### Phase 1: framework-neutral contract

- `packages/domain`, `packages/contracts`, `packages/content`를 Astro와 무관하게 추출.
- Current Astro와 새 loader가 동일 inventory/default/publication/media result를 내는 golden test.
- `astro/zod`, `CollectionEntry`, `ImageMetadata`, `import.meta.glob`을 public contract 밖으로 제거.

### Phase 2: public renderer decision slice

같은 framework-neutral contract와 asset을 사용해 Next.js App Router와 React Router Framework Mode로 다음 최소 route slice를 각각 shadow 구현한다. 두 spike는 동일한 production 조건에서 build하고 측정하며, 선택되지 않은 spike는 migration code로 가져가지 않는다.

- `/` 탐색 화면.
- article detail 하나.
- review detail 하나.
- memory detail 하나.

Gate:

- canonical HTML/metadata와 no-JS links.
- media dimensions, responsive source, fallback, provenance.
- desktop/mobile keyboard, reduced motion, exact return.
- clean console와 hydration error 없음.
- declared JavaScript, LCP, CLS budget.
- private build-context leak 0.

Next.js가 React Router 구현보다 최소 두 품질 항목에서 측정 가능한 이점을 주지 않으면 public도 React Router Framework Mode로 통일한다. 이 결정은 선호도가 아니라 동일 route, content, asset, browser matrix의 측정 결과로 남긴다.

### Phase 3: public shadow and cutover

- Listing/detail/tag/search/memory 전체 route 이동.
- Production build를 noncanonical host에 배포.
- Astro output과 route, metadata, screenshot, link, accessibility, performance 비교.
- Reverse proxy switch로 atomic cutover.
- Astro image와 last good release를 rollback 대상으로 유지.

### Phase 4: private runtime

- Fastify/API, PostgreSQL, worker, session bootstrap.
- Filesystem content를 canonical로 유지한 read-only DB mirror.
- Import ledger와 count/hash/public projection reconciliation.
- 작업실의 한 low-risk lane부터 DB authoring.

### Phase 5: canonical source cutover

- Collection별 migration epoch를 기록.
- Epoch 이전은 file canonical, 이후는 DB revision canonical.
- DB에서 deterministic file snapshot을 단방향 export할 수 있지만 export는 live input이 아니다.
- Bidirectional last-write-wins sync를 만들지 않는다.

### Phase 6: public release와 Astro 제거

- Immutable release build/verify/activate/rollback 검증.
- DB canonical content의 public route parity와 clean-host restore 검증.
- Scaffold, validator, docs, browser gate를 새 stack으로 이식.
- Observation window 뒤 Astro dependency, config, `.astro` file을 제거.

## 15. Acceptance gates

### Contract

- Current public inventory와 route parity.
- Missing `draft`가 현재와 동일하게 `false`로 normalize.
- `published && !draft` 외 상태의 public absence.
- private memory/source/path/prompt/embedding leak fixture.
- Media checksum/dimensions/provenance/rights/HOLD parity.

### Browser

- Desktop와 mobile responsive route.
- Keyboard와 visible focus.
- JavaScript-disabled public navigation.
- Reduced motion.
- Exact focus와 horizontal viewport return.
- Long Korean/English title, empty data, image failure.
- Chromium, Firefox, WebKit.

### Runtime

- API request/response schema와 auth rejection.
- Real PostgreSQL migration/integration test.
- Job retry/crash/idempotency.
- Publication activation/rollback atomicity.
- Clean-host backup restore와 public smoke.
- Public host에서 studio API/private object 접근 불가.

## 16. 의도적으로 보류하는 것

- Redis/BullMQ.
- Separate vector/search database.
- Graph database.
- Kafka/event bus.
- Temporal/workflow engine.
- Kubernetes/service mesh.
- Nx/Turborepo.
- MinIO solely to emulate S3.
- Multi-tenant organization/RBAC/RLS.
- Collaborative CRDT editing.
- Runtime arbitrary MDX.
- Autonomous AI publication.
- Full observability platform.

각 항목은 성능, 기능, 복구, 운영 병목이 실제 measurement로 확인될 때 새 ADR로 검토한다.

## 17. 구현 계획 전에 남은 선택

1. 단일 owner의 첫 인증 방식.
2. Public renderer slice의 수치 budget.
3. Backup RPO/RTO.
4. Public release build runner.
5. Dependency exact versions와 update SLA.

이 다섯 선택은 전체 architecture를 다시 여는 질문이 아니다. 각 implementation task에서 필요한 시점에 좁은 ADR 또는 plan decision으로 고정한다.

## 참고한 공식 자료

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js backend for frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Next.js MDX](https://nextjs.org/docs/app/guides/mdx)
- [React Router modes](https://reactrouter.com/start/modes)
- [React Router rendering strategies](https://reactrouter.com/start/framework/rendering)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify plugins](https://fastify.dev/docs/latest/Reference/Plugins/)
- [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [Graphile Worker](https://worker.graphile.org/docs)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP LLM prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/)
