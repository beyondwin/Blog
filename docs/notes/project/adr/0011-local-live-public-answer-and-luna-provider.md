# ADR-0011: 로컬 live 공개 답변 runtime과 Luna 단일 provider

- Status: accepted
- Date: 2026-09-02
- Decision owners: user / project
- Supersedes: none
- Superseded by: none
- Amends: ADR-0010의 active answer model, provider evidence와 owner-local 실행 경계

## Context

`/search/` client는 same-origin `POST /api/public/ask`를 호출하지만 일반 `site:preview`는 GET/HEAD만
허용하는 static host다. 따라서 static preview만 연 로컬 환경에서는 질문이 Nest/Fastify,
PostgreSQL retrieval과 provider에 도달하지 않고 405로 끝난다.

ADR-0010의 provider path는 production 안전 경계를 먼저 고정했다. Provider mode는 ZDR
data-control receipt와 live embedding receipt를 요구하고, 최초 answer model은
`gpt-5.4-mini-2026-03-17`, `reasoning.effort: none`으로 고정했다. 이 경계는 production 준비에는
유효하지만 owner가 API key로 실제 로컬 RAG 상호작용을 검증하는 한 명령을 제공하지 않는다.

사용자는 owner-local 실제 상호작용, GPT-5.6 Luna high, process 환경변수 secret, 독립 질문,
월 USD 1 상한과 local non-ZDR disclosure를 승인했다. GPT-5.4 provider 호환성은 유지하지 않되
deterministic fallback과 keyless fixture 검증은 유지하기로 했다.

## Decision

### 단일 owner-local live runtime

`npm run public-answer:local:live` 한 명령이 verified release, disposable PostgreSQL/pgvector,
Nest/Fastify provider runtime, static preview와 same-origin local proxy의 전체 수명주기를 소유한다.
기존 서버나 port를 채택·종료·재설정하지 않으며 loopback 가용 port만 사용한다. Readiness가 exact
content/answer release pair를 검증한 뒤에만 브라우저 origin을 제공한다.

정상 종료, startup 실패, SIGINT와 SIGTERM에서 proxy, preview, API, database를 역순 정리한다.
소유 process 종료를 확인하지 못하면 destructive database cleanup을 수행하지 않고 retained state를
명시한다.

### Luna 단일 provider policy

Active generation과 semantic verification은 OpenAI Responses API의 `gpt-5.6-luna`,
`reasoning.effort: high`를 사용한다. `store:false`, tools 없음, strict Structured Outputs와 기존
bounded output을 유지한다. Query와 corpus embedding은 `text-embedding-3-large`를 유지한다.

Model, reasoning, pricing identity, request contract와 evaluation identity는 하나의 provider policy로
고정한다. GPT-5.4 active constant, pricing entry, protocol fixture, receipt allowlist와 compatibility
activation은 제거한다. 과거 GPT-5.4 receipt는 새 policy에서 fail closed하며 migration하지 않는다.
과거 ADR wording은 결정 이력으로만 보존한다.

### Local non-ZDR provenance

Owner-local live mode는 `store:false`를 사용하지만 ZDR이라고 주장하지 않는다. 별도
`local-non-zdr` authorization과 embedding provenance를 사용하고 검색 화면에 이 경계를 표시한다.
이 local evidence는 ignored local state에만 존재하며 production config, readiness, evaluation,
build와 deploy receipt가 반드시 거부한다.

Production provider는 ADR-0010의 독립된 provider-admin ZDR data-control receipt, embedding receipt,
evaluation과 operations evidence를 계속 요구한다. Local authorization은 이를 만족하거나 대체하지
않는다.

### 월 USD 1 hard cap

로컬 월 budget은 indexing, query embedding, generation과 semantic verification을 모두 합해
1,000,000 micro-USD다. Ignored local ledger가 external call 전에 conservative maximum을 원자적으로
reserve하고 provider usage로 reconcile한다. 과금 여부가 모호한 transport 실패는 reservation을
소비한 것으로 유지한다. Ledger corruption, lock ambiguity와 cap 초과는 provider call 전에 fail
closed한다.

Ledger는 UTC month, model, operation, token/cost와 redacted result만 기록하며 API key, question,
answer, excerpt, provider payload와 content locator를 저장하지 않는다. 한도 소진은 새
`budget-exhausted` deterministic search fallback과 명확한 UI copy로 표현한다.

### 질문과 fallback

질문은 서로 독립적이다. Conversation history와 multi-turn state를 provider에 보내거나 durable하게
저장하지 않는다. 한 요청은 query embedding 1회, hybrid retrieval, generation 최대 1회, semantic
verification 최대 1회다. 자동 retry와 repair loop는 없다.

Insufficient evidence, release mismatch, provider/validation failure, timeout, rate limit과 budget
exhaustion은 모두 truthful deterministic search로 전환한다. Keyless fixture integration과 모든
fallback은 live provider와 분리된 mandatory gate로 유지한다.

## Decision evidence

- 사용자는 static preview가 아닌 owner-local 실제 RAG/LLM interaction을 첫 목표로 승인했다.
- 사용자는 질문마다 독립적인 retrieval/answer 흐름을 선택했다.
- 사용자는 `gpt-5.6-luna`, `reasoning.effort: high`, `text-embedding-3-large` 조합을 승인했다.
- 사용자는 API key를 process environment로만 제공하고 월 USD 1 상한을 승인했다.
- 사용자는 local non-ZDR mode를 선택했고, GPT-5.4 provider 레거시만 제거하도록 승인했다.
- Repository evidence: `apps/site/serve-static.ts`는 GET/HEAD 외 method를 405로 거부하고,
  `scripts/cutover/local-proxy.mts`와 provider stack integration은 same-origin API topology를 이미
  증명한다.
- OpenAI 공식 문서는 `gpt-5.6-luna`의 Responses API, Structured Outputs와 `high` reasoning 지원을
  명시한다.

## Consequences

- 한 명령으로 실제 공개 승인 corpus에 질문하고 citation-verified answer와 evidence를 확인할 수
  있다.
- Local interaction은 billable external processing이며 `store:false`만으로 ZDR을 주장하지 않는다.
- Persistent local ledger와 owned process orchestration이라는 새 maintenance surface가 생긴다.
- Active provider policy는 Luna 하나라 단순해지지만 과거 GPT-5.4 live receipt를 재사용할 수 없다.
- Production deploy, traffic, provider quality와 ZDR readiness는 계속 `not_measured`이고 별도 권한이다.
- Deterministic fallback과 fixture stack을 유지해 provider outage와 비과금 regression 검증을
  보존한다.

## Alternatives considered

### 수동 다중 terminal 실행

변경량은 작지만 port, release binding, cost reservation과 cleanup을 사람에게 넘기고 static-preview
405를 반복하기 쉽다. 거부했다.

### 상시 full Docker Compose

Production과 비슷하지만 owner-local interaction에 persistent volume, secret distribution과 운영
복잡도가 과하다. 거부했다.

### Local에서도 production ZDR evidence 요구

안전 receipt는 하나지만 일반 API key를 사용한 owner-local 검증을 막는다. Production이 local
provenance를 거부하는 조건으로 별도 local non-ZDR mode를 채택했다.

### GPT-5.4 compatibility 유지

Receipt/model/pricing branch가 늘고 어떤 policy로 답했는지 모호해진다. 사용자가 legacy support를
원하지 않았으므로 active compatibility를 제거한다.

### Deterministic fallback과 fixture 제거

장애 복구의 정직성과 mandatory non-billable integration gate를 잃는다. Legacy 제거 범위가 아니므로
거부했다.

## Open questions

- Production domain, deploy와 traffic cutover authority.
- Production provider project의 실제 ZDR, spend, evaluation과 operations evidence.
- 첫 live smoke 이후 corpus-wide Luna 품질. Local success만으로 production quality를 추론하지 않는다.

## Follow-up

- Local-only detailed design:
  `docs/superpowers/specs/2026-09-02-local-live-public-answer-design.md`
- 승인된 spec의 implementation plan은
  `docs/superpowers/plans/2026-09-02-local-live-public-answer.md`에 분해되어 있다.
- 구현은 model-policy/ledger/authorization RED부터 시작하고, keyless stack과 승인된 USD 1 이내 live
  browser smoke로 종료한다.

## Sources

- [ADR-0010](0010-public-answer-runtime-and-release-boundary.md)
- [Architecture reference](../architecture-reference.md)
- [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
