# ADR-0010: 공개 답변 runtime과 answer-release 경계

- Status: accepted
- Date: 2026-08-30
- Last amended: 2026-09-01 after implementation closeout and public-evidence hardening
- Decision owners: user / project
- Supersedes: none
- Superseded by: none
- Amends: ADR-0005의 server framework와 public-host 경계, ADR-0009의 열린 RAG 결정

## Context

`/search/`는 승인된 한 질문에만 검증된 fixture로 답하고 나머지는 immutable public release의
deterministic 검색 결과로 전환한다. 이 UI는 질문, 진행, 답변, 근거 panel과 avatar stage를
이미 소유하지만 실제 retrieval, 생성 답변, citation 검증과 공개 API는 없다.

ADR-0005는 `apps/server`를 Fastify modular monolith로 두고 public host는 `apps/site`에만
연결하도록 정했다. ADR-0009는 실제 provider, privacy, retention, abuse protection과 평가
기준을 후속 결정으로 남겼다. 공개 질문에 실제로 답하려면 이 두 경계를 좁고 검증 가능한
형태로 보완해야 한다.

공개 여부도 하나의 boolean으로는 부족하다. 원문 전체를 글 route로 공개하지 않더라도,
사람이 선택한 일부 문장을 공개 답변의 근거로 사용할 수 있기 때문이다. 반대로 공개 글도
질문 검색에서는 제외할 수 있어야 한다. "답변에만 사용"은 비공개가 아니라 공개 범위가
좁은 상태이므로 방문자와 운영자 모두에게 그 사실을 숨기면 안 된다.

## Decision

### 첫 vertical slice

첫 구현 범위는 `public-answer-release + apps/server + /search provider`다. Private Studio,
인증, 범용 ingestion, background queue와 전체 knowledge graph는 포함하지 않는다.

```text
verified public release
  -> immutable public-answer-release
  -> PostgreSQL hybrid index bound to that release
  -> NestJS application on Fastify
  -> POST /api/public/ask
  -> /search/ answer or deterministic fallback
```

### 공개 범위

소유자가 보는 공개 범위는 세 가지 용어로 고정한다.

1. `비공개`: public release와 answer release 어디에도 들어가지 않는다.
2. `답변 근거로 공개`: 원문 route와 목록에는 나오지 않지만 사람이 승인한 evidence capsule은
   공개 answer release에 포함된다. 이 capsule은 공개 정보이며 안정된 `/evidence/<id>/`
   locator로 열 수 있고 `noindex`다.
3. `글로 공개`: canonical detail route와 목록에 공개한다. 별도의 `검색에 포함` boolean으로
   public answer corpus 참여 여부를 선택하며 기본값은 제외다. 게시 승인을 LLM 재사용·외부
   provider 전송 승인으로 간주하지 않는다.

첫 vertical slice는 현재 공개된 articles, reviews, thoughts 중 record ID와 source checksum이
고정된 별도 승인 allowlist의 record만 `검색에 포함`으로 materialize한다. 생략된 필드는 false다.
새 answer-only capsule, 기존 비공개 내용이나 새 공개 글을 자동 승격하지 않는다. Answer-only
authoring UI는 Private Studio 후속 범위지만 schema와 release 경계는 이번 slice에서 고정한다.

### 두 개의 공개 artifact

기존 `public-release`와 새 `public-answer-release`를 물리적으로 분리한다.

- `public-release`: 글 route, 목록, media와 현재 static site의 source of truth.
- `public-answer-release`: 공개 승인된 chunk, opaque evidence ID, public locator와 retrieval
  input만 포함한다.
- answer release builder는 raw MDX나 top-level `memory/**`를 읽지 않고, 검증된 public release와
  별도로 승인된 answer-only capsule만 입력으로 받는다.
- `answerReleaseId`는 source release identity, chunker/normalizer version과 materialized file
  checksum으로 결정한다.
- embedding vector와 provider payload는 public artifact에 넣지 않는다. PostgreSQL row는
  `answerReleaseId + chunkId + checksum + provider + model + dimensions`에 결합한다.

### server framework와 dependency rule

`apps/server`는 **NestJS 12 application을 Fastify 5 adapter 위에서 실행**한다. Nest는 HTTP,
configuration, lifecycle과 dependency composition shell이다. Clean architecture의 내부 계층은
framework-independent로 유지한다.

```text
Nest controller / guard / pipe / infrastructure adapter
                         -> application use case
                         -> domain model
```

- domain과 application은 plain TypeScript이며 decorator를 포함해 Nest, Fastify, PostgreSQL,
  Zod, `process.env`를 import하지 않는다.
- port interface는 application이 소유하고 Nest module은 `Symbol` token으로 adapter를 연결한다.
- use case는 module의 `useFactory` provider에서 port를 받아 조립한다. `@Injectable()`은 controller와
  infrastructure adapter에만 허용한다.
- business logic에서 `ModuleRef`, service locator, global module과 request-scoped provider를 쓰지
  않는다.
- use-case unit test는 Nest testing container 없이 constructor로 직접 조립한다.
- browser와 server의 wire schema는 `packages/contracts`의 strict Zod contract 하나를 사용한다.

### public runtime topology

ADR-0005의 public-host 경계에 다음 한 가지 예외만 추가한다.

- public host는 same-origin `POST /api/public/ask`만 `apps/server`로 proxy한다.
- proxy는 browser `Origin`/`Sec-Fetch-Site`를 보존하고 release/cache/security 응답 header만
  allowlist로 전달하며 downstream close 시 loopback upstream을 취소한다.
- 다른 `/api/*`, health, studio, database와 worker route는 public host에 노출하지 않는다.
- browser는 provider에 직접 연결하지 않으며 API key와 provider URL을 받지 않는다.
- public endpoint는 JSON same-origin request만 받으며 CORS와 cookie/auth를 사용하지 않는다.
  browser `Origin`과 `Sec-Fetch-Site`를 검증하고 billable cross-site submission을 거부한다.
- server는 loopback bind가 기본이다. 첫 slice production은 normalized exact proxy IP allowlist와
  edge-only reachability가 없으면 시작하지 않는다. hop-count trust와 `trustProxy: true`는 금지한다.
- server는 exact `(contentReleaseId, answerReleaseId)` binding이 검증되지 않으면 시작하지 않는다.
- release mismatch 중에는 생성 답변을 내지 않고 deterministic search로 복구한다.

### retrieval과 생성

- 요청은 `version`, `question`, `contentReleaseId`, `answerReleaseId`를 포함한다.
- lexical top 20과 vector top 20을 각각 구해 reciprocal rank fusion으로 합치고 중복 제거 후 최대
  6개 evidence를 선택한다.
- lexical score는 PostgreSQL FTS와 `pg_trgm` 중 큰 값을 사용해 한국어 substring/character
  유사도를 보완한다. Vector 검색은 작은 첫 corpus에서 pgvector exact cosine distance를 쓴다.
- 첫 embedding adapter는 `text-embedding-3-large`를 사용하되 model ID, dimensions와 content
  checksum을 index receipt에 고정한다. DB binding과 cache는 fixture/provider source와 exact
  embedding receipt hash도 고정하며 fixture vector는 production readiness를 통과하지 못한다.
- provider embedding receipt는 immutable external artifact이며 release/approval/data-control/pricing
  hash, ordered chunk/vector checksum, token/cost totals, vector-set checksum과 DB index checksum을
  결합한다. Activation, readiness와 live evaluation은 DB/report에 적힌 hash만 믿지 않고 이
  artifact를 strict-reopen해 다시 검증한다.
- 첫 answer adapter는 OpenAI Responses API의 pinned model
  `gpt-5.4-mini-2026-03-17`을 native `fetch`로 호출한다. `store: false`, tools 없음,
  `reasoning.effort: none`, Structured Outputs와 최대 output 500 tokens를 사용한다.
- provider는 질문, 선택된 공개 excerpt와 opaque evidence ID만 받는다. canonical path, private
  dependency, filesystem path와 raw source는 받지 않는다.
- 모델은 `{claims: [{text, evidenceIds}]}`만 반환한다. canonical locator는 server가 pinned
  answer release에서 다시 결합한다.

OpenAI 공식 문서는 Responses API가 `store` 제어와 JSON Schema Structured Outputs를 제공한다고
명시한다. 이 결정은 provider output을 신뢰한다는 뜻이 아니라, deterministic verifier 앞의
한 adapter를 고정한다는 뜻이다.

### 검증과 실패

answer는 다음 검증을 모두 통과해야 browser에 전달된다.

- 모든 evidence ID가 같은 answer release에 존재한다.
- locator와 checksum이 manifest와 일치한다.
- 모든 claim이 적어도 하나의 evidence를 인용한다.
- 인용되지 않은 문장, dangling citation, corpus 밖 URL과 HTML/Markdown을 거부한다.
- critical claim citation coverage는 100%여야 한다.
- semantic verifier가 evidence와 직접 모순되는 claim을 찾으면 전체 answer를 폐기한다.

retrieval 1회, generation 1회, verification 1회만 허용하며 model repair loop와 자동 retry는
없다. insufficient evidence, timeout, provider error, malformed output, citation failure,
release mismatch와 rate limit은 모두 같은 질문의 deterministic search로 전환한다. 실패한 POST
본문을 자동으로 GET URL에 복사하지 않는다.

### privacy, retention과 abuse protection

- server와 application log는 raw question, answer, excerpt와 provider payload를 기록하지 않는다.
- raw question/answer의 durable retention은 0일이다.
- release ID, result kind, latency bucket, token/count bucket과 error code 같은 비식별 metadata는
  7일 보관한다.
- 집계 품질/운영 metric은 90일 보관한다.
- production provider project는 Zero Data Retention 또는 동등한 계약이 확인돼야 한다.
  boolean 환경값이나 `store:false`로 이 gate를 대체하지 않는다. 별도 승인된 provider-admin
  data-control receipt의 endpoint, evidence checksum, verifier/custodian identity hash,
  verified/expiry 시각을 검증한다. Operations receipt는 별도 deployer identity hash와 그 canonical
  hash를 결합하며 deployer/verifier/custodian가 동일한 identity이면 거부한다.
- request body 4 KiB, 질문 1–500 Unicode code points, provider input 6000 tokens, evidence context
  4000 tokens, output 500 tokens, hard timeout 12초를 적용한다.
- network key별 burst 3, 20초당 1 refill, 시간당 20, 일당 40; global 일당 150;
  generation concurrency 4, queue 8, queue wait 2초를 적용한다.
- raw IP를 저장하지 않고 rotating HMAC network key를 사용한다. 운영자 bypass는 없다.
- quota는 embedding, generation, semantic verification의 예상 token/cost를 첫 provider call 전에
  원자적으로 reserve한다. daily token/cost hard cap, provider project spend cap과 kill switch를
  모두 통과해야 한다.
- client disconnect는 incomplete request 또는 아직 끝나지 않은 response close만 취소로 본다.
  PostgreSQL 취소는 지원되지 않는 `QueryConfig.signal`을 가정하지 않고, checked-out worker의
  `statement_timeout`과 별도 control connection의 `pg_cancel_backend`를 사용한다.

### 고정 평가와 rollout

평가셋은 public development 20문항과 hidden release 60문항으로 나눈다. Hidden set은 answerable
30, unanswerable 12, adversarial 12, robustness 6이다.

Live provider hidden 평가는 같은 provider embedding adapter로 승인 corpus를 먼저 새로 색인하고,
active binding과 report에 `embedding_source=provider`와 exact embedding receipt hash를 결합한 뒤에만
hidden 문항을 연다. Fixture 또는 provenance가 다른 binding은 metric 계산 전에 거부한다.

절대 실패 조건은 private leak, invalid canonical locator, prompt-injection success, critical
contradiction, blank response/fallback failure가 각각 1건 이상인 경우다. 정량 gate는 Hit@3
27/30, Recall@5 0.90, nDCG@5 0.85, citation correctness 0.97, citation coverage 0.95,
critical citation 1.00, grounded answer 0.95, abstention 12/12, adversarial defense 12/12,
robustness 5/6이다.

rollout은 offline evaluation, synthetic shadow, owner-only, 10%, 50%, 100% 순서다. 각 단계는
앞선 gate를 통과해야 하며 feature flag 하나로 즉시 fixture/search-only 모드로 돌아간다.
Production deploy, domain과 traffic cutover는 별도 권한이다.

첫 checksum-approved corpus는 현재 승인 fixture thought 1건으로 제한한다. 이 vertical slice는
실제 end-to-end 동작을 증명하지만 corpus-wide metric과 traffic rollout readiness는 `not_measured`다.
추가 record 승인과 hidden evaluation 통과 전에는 owner-only를 넘지 않는다.

### 공개 UX

기존 FORM & THOUGHT의 warm paper, terracotta, deep brown, serif editorial tone과 승인 avatar를
유지한다. 질문 중에는 실제 retrieval record를 avatar 주변의 typographic paper card로 모으고,
검증된 evidence ID만 red thread로 연결한다. 답변 완료 시 card가 기존 evidence rail/panel로
정리된다.

- 의미와 조작은 DOM/CSS/SVG가 소유한다.
- optional Three.js는 avatar 종이 면의 깊이/접힘과 pointer 반응 같은 장식에만 사용하며
  `aria-hidden`이다.
- semantic citation, text, focus, hit target과 navigation을 canvas에 넣지 않는다.
- mobile은 normal-flow vertical evidence trail로 바꾸고, reduced motion과 저성능 환경에서는
  WebGL을 로드하지 않는다.
- 첫 구현에는 Three.js를 넣지 않는다. CSS 3D가 필요한 깊이와 DOM hit-testing을 제공하며,
  WebGL은 별도 성능/장애/accessibility 결정 없이는 도입하지 않는다.
- prototype은 search main의 visual composition만 결정한다. 실제 `SiteShell`, skip link, header,
  canonical GET/no-JS search, `SearchResults`, conditional rendering과 portal dialog 동작을 보존한다.
- 현재 승인 avatar 원본은 1,872,261 bytes라 512 KiB first-frame image budget을 통과하지 못한다.
  원본에서 만든 AVIF/WebP derivative의 provenance/rights와 checksum을 별도로 승인하고 기록하기
  전에는 production 구현을 완료로 판정하지 않는다.

## Decision evidence

- 사용자는 Private Studio 전체보다 `apps/server + public corpus retrieval + /search provider`를
  첫 vertical slice로 추천했고 이를 승인했다.
- 사용자는 비공개, 답변 근거 공개, 글 공개와 검색 제외를 직관적인 공개 범위로 나누는 방향을
  승인했다.
- 사용자는 현재 편집 tone과 avatar를 유지하면서 더 스타일리시하고 탐색감 있는 interactive
  화면을 요청했고, 기존 avatar가 paper field 안에서 기록과 연결되는 clickable prototype을
  검토한 뒤 승인했다.
- 사용자는 NestJS가 제공하는 DI를 활용하는 구조를 명시적으로 승인했다.
- Repository evidence: 현재 `/search/`에는 fixture, state machine, evidence dialog와 deterministic
  search fallback이 있고 `packages/content`에는 content-addressed public release verifier가 있다.
- Research evidence: Nest 공식 문서는 providers/custom tokens/module encapsulation과 Fastify
  adapter를 지원한다. OWASP RAG와 prompt-injection guidance는 retrieved content를 untrusted data로
  취급하고 access control, output validation과 monitoring을 권고한다.

## Consequences

- 공개 질문은 실제 외부 처리와 비용이 있는 runtime 기능이 되지만 private corpus와 자동
  publication은 계속 분리된다.
- Nest 관련 runtime dependency와 PostgreSQL/pgvector 운영 surface가 추가된다.
- public host가 한 개의 API path를 server에 연결하므로 ADR-0005의 기존 격리보다 공격면이
  넓어진다. 좁은 proxy, fail-closed binding, rate limit과 즉시 rollback이 그 비용이다.
- answer-only는 검색에 보이지 않는 비공개 상태가 아니라 명시적 공개 상태다. UI copy와 review
  receipt가 이를 분명히 해야 한다.
- LLM의 schema 준수는 citation 진실성을 증명하지 않는다. deterministic and semantic validation
  이후에만 answer를 공개한다.
- 첫 slice는 microservice, Redis, external vector database, ORM, provider SDK, streaming answer,
  conversation history와 tool use를 추가하지 않는다.

## Alternatives considered

### 순수 Fastify와 수동 constructor injection

가장 작고 투명하지만 이후 Studio/auth/worker가 같은 server에 들어올 때 module lifecycle과
composition 규칙을 프로젝트가 직접 유지해야 한다. Nest를 바깥 shell로만 제한하는 쪽을
채택했다.

### Nest decorator를 domain/application까지 사용

초기 코드는 짧지만 business logic이 framework container와 testing module에 결합된다. Clean
architecture와 교체 가능성을 해치므로 거부했다.

### private 전체를 검색한 뒤 public result만 filtering

retrieval, prompt와 log 단계에서 이미 private 정보가 노출될 수 있다. 검증된 공개 projection만
검색한다.

### 공개 여부 하나와 검색 포함 여부 하나만 사용

원문은 공개하지 않고 일부 evidence만 공개하는 사용 사례를 표현하지 못한다. 세 상태와 공개 글의
검색 toggle을 채택했다.

### Three.js가 전체 질문/근거 UI를 소유

시각적 효과는 크지만 접근성, selection, canonical navigation, mobile 성능과 유지보수 비용이
과도하다. 의미는 DOM에 두고 WebGL은 optional decoration으로 제한한다.

## Open questions

- answer-only capsule을 처음으로 승인할 실제 record와 excerpt. 승인 전까지 0건으로 유지한다.
- production provider project의 ZDR 계약, 실제 secret 주입과 production origin.
- 운영 traffic cutover와 비용 budget. 구현과 local/live-key owner smoke는 deploy 권한이 아니다.

## Implementation record and local evidence

- 공개 clone의 현재 built truth는 [DESIGN.md](../../../../DESIGN.md),
  [architecture reference](../architecture-reference.md)와 [agent runbook](../agent-runbook.md)이다.
- answer release/contracts, Nest runtime과 `/search/` integration은 main의 `0d5e45d`까지 구현·검증하고
  위 built-truth 문서에 반영했다. Production deploy와 traffic cutover는 여전히 별도 권한이다.
- 상세 설계 원본은 public repository에 포함하지 않는 local-only evidence
  `docs/superpowers/specs/2026-08-30-public-second-brain-rag-design.md`
  (`sha256:0044d6be24aad98e31d254955bae905689f4f8a357b17a4f6931fe85d7d334fe`)다.
- 승인 visual authority 원본도 local-only evidence
  `.superpowers/brainstorm/79951-1788068678/content/search-interaction-v4.html`
  (`sha256:58da89047594951c51c07a523dc879f85d036fb55ca2860e3ecf560fe855d76e`)다.
  Public clone에서 필요한 결정과 제약은 이 ADR 본문에 완결되게 보존한다.

## Sources

- [Nest providers](https://docs.nestjs.com/providers)
- [Nest custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [Nest modules](https://docs.nestjs.com/modules)
- [Nest Fastify adapter](https://docs.nestjs.com/techniques/performance)
- [OpenAI Responses API create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [OpenAI Responses structured output types](https://developers.openai.com/api/reference/cli/resources/beta/subresources/responses)
- [OpenAI GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [OpenAI text-embedding-3-large](https://developers.openai.com/api/docs/models/text-embedding-3-large)
- [Node.js HTTP lifecycle](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html)
- [node-postgres Client API](https://node-postgres.com/apis/client)
- [OWASP RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
