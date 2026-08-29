# ADR-0009: 질문형 public second-brain 검색 인터페이스

- Status: accepted
- Date: 2026-08-29
- Decision owners: user / project
- Supersedes: ADR-0007의 `/search/` keyword-first 화면 구성만 부분 대체
- Superseded by: none

## Context

ADR-0007은 `/search/`를 큰 제목, 입력, keyword chip과 discovery card가 있는 검색 화면으로 확정했다. 구현 후 사용자는 이 구성이 일반 검색처럼 보이고, second brain이 대신 기록을 읽어 답하는 경험으로 느껴지지 않는다고 판단했다.

여러 reference와 interaction concept를 검토한 뒤 사용자는 FORM & THOUGHT tone 안에서 질문, avatar stage, 기록 탐색 과정, 큰 답변과 근거 panel이 이어지는 화면을 승인했다. LLM/RAG는 나중에 연결하고 먼저 화면과 interaction을 실제 route에 구현하기로 승인했다.

## Decision

`/search/`는 primary navigation의 `검색` route를 유지하면서 질문형 public second-brain interface가 된다.

- 첫 화면은 keyword chip과 discovery card보다 질문 composer와 avatar stage를 우선한다.
- 핵심 흐름은 `질문 → 관련 기록 탐색 → 생각 연결 → 답변 → 근거 확인`이다.
- 전역 브랜드와 navigation은 `FORM & THOUGHT`, `서평 · 아티클 · 생각 · 검색`을 유지한다.
- `AI 대리인`, `AI DELEGATE`, `MIND 01` 같은 기술·의인화 label은 public copy에서 제거한다.
- avatar는 desktop과 mobile 모두 존재하며 응답 주체와 상태 전환을 직관적으로 만든다.
- evidence panel은 답변 맥락을 유지하고 keyboard/focus/close 동작을 완전히 제공한다.
- approved prototype과 상태별 desktop/mobile captures를 visual authority로 저장한다.

이번 UI-first 구현에서는 LLM이 작동하는 것처럼 가장하지 않는다.

- 승인된 sample question만 실제 public record에 연결된 검증 가능한 fixture answer를 사용한다.
- 다른 질문은 기존 verified release의 deterministic search result로 전환하고 AI 답변처럼 표현하지 않는다.
- GET query, no-JS fallback과 canonical public detail link를 보존한다.
- 향후 RAG/LLM은 public-approved corpus만 사용하는 provider로 별도 승인·설계한다.

Public app은 계속 immutable public release만 읽으며 top-level `memory/**`와 private source를 직접 읽지 않는다.

## Decision evidence

- 사용자는 화면이 글 위주이고 일반 검색처럼 보여 second brain 경험으로 느껴지지 않는다고 반복해서 지적했다.
- 사용자는 RAG와 LLM이 공개 기록을 바탕으로 대신 답하는 방향, avatar가 답하는 주체처럼 보이는 방향을 승인했다.
- 사용자는 LLM 연결을 나중으로 미루고 화면과 interaction을 먼저 만들도록 승인했다.
- 사용자는 화면을 직관적이고 심플하게 유지하면서 검색·응답·화면 전환과 근거 panel에 전문적인 motion을 적용하도록 승인했다.
- 사용자는 최종 interactive prototype을 검토하며 clipping, header, avatar, mobile copy와 evidence interaction을 수정한 뒤 구현을 승인했다.
- Repository evidence: `/search/`는 이미 verified immutable release, GET query와 deterministic search를 소유하므로 truthful fallback과 향후 provider seam을 같은 route에 둘 수 있다.

## Consequences

- ADR-0007의 search title/input/keyword/discovery-first composition은 더 이상 `/search/`의 primary visual contract가 아니다.
- ADR-0007의 route, navigation label, public corpus, no-JS/GET와 React-only renderer 결정은 유지된다.
- initial implementation은 한 개의 verified fixture answer만 제공하므로 임의 질문에 생성 답변을 제공하지 않는다.
- 화면이 future RAG를 수용하지만 provider, privacy, evaluation과 abuse protection은 아직 제품 기능이 아니다.
- avatar public integration에는 provenance와 배포 승인 기록이 필요하다.
- 구현 후 `DESIGN.md`와 architecture reference를 built truth로 갱신해야 한다.

## Alternatives considered

### 기존 keyword search를 그대로 유지

실제 기능과 no-JS 계약은 명확하지만 사용자가 요구한 대신 읽고 답하는 second-brain identity가 보이지 않는다. primary experience로 유지하지 않는다.

### ChatGPT와 같은 chat transcript UI

질문과 답변은 익숙하지만 FORM & THOUGHT의 편집 지면과 avatar stage가 사라지고 generic AI product처럼 보인다. 채택하지 않는다.

### Obsidian형 knowledge graph를 primary 화면으로 사용

연결 구조는 잘 보여도 질문에 답하는 작업을 직접적으로 만들지 못하고 mobile에서 조작 부담이 크다. graph는 근거/탐색의 보조 표현 후보로 남기고 primary 화면으로 사용하지 않는다.

### LLM 없이 모든 질문에 같은 demo answer 반환

시각 demo는 단순하지만 실제 기능으로 오해하게 하고 출처 신뢰를 훼손한다. sample fixture와 deterministic search fallback을 분리한다.

## Open questions

- RAG/LLM provider, model, retrieval/reranking과 citation validation.
- 질문 로그의 저장 여부, retention, privacy와 abuse protection.
- authenticated private second-brain과 public question interface의 장기 관계.
- sample fixture 이후 public answer coverage와 quality evaluation 기준.

이 항목들은 현재 UI 구현 결정이 아니며 별도 ADR/spec 승인이 필요하다.

## Follow-up

- [질문형 second-brain 검색 설계](../../../superpowers/specs/2026-08-29-form-and-thought-second-brain-search-design.md)를 구현 계약으로 검토한다.
- [승인 prototype과 상태 캡처](../../../superpowers/assets/2026-08-29-form-and-thought-second-brain-search/README.md)를 visual parity 기준으로 사용한다.
- 설계 승인 후 Superpowers 구현 계획을 만들고 TDD와 desktop/mobile browser 검증으로 실행한다.
- 구현 완료 후 `DESIGN.md`와 architecture reference를 갱신한다.
