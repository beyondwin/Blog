# ADR-0000: ADR 관리 규칙

- Status: accepted
- Date: 2026-08-22
- Decision owners: user / project
- Supersedes: none
- Superseded by: none

## Context

`beyondwin`은 정적 블로그에서 private second brain, RAG, knowledge graph, curated public projection을 포함한 새 제품으로 재구상되고 있다. 탐색 과정에서 제품 경계와 시각 방향이 여러 번 바뀌었고, 거부한 선택까지 이후 판단의 근거로 남길 필요가 생겼다.

spec과 plan만으로는 현재 선택의 결과는 남아도 왜 다른 대안을 버렸는지, 어떤 부분이 아직 미확정인지 쉽게 사라진다. 사용자는 이번 작업부터 중요한 판단을 ADR로 정리하고, 이후 작업에서도 계속 갱신·관리해 미래 판단의 근거로 사용하라고 요청했다.

## Decision

제품, 아키텍처, 데이터 경계, 공개 정책, durable UX에 영향을 주는 중요한 결정을 `docs/notes/project/adr/`에서 관리한다.

- 관련 작업은 시작할 때 ADR index와 accepted ADR을 읽는다.
- 결정이 받아들여지거나 거부되거나 대체되면 같은 작업에서 ADR을 추가하거나 갱신한다.
- 명시적 승인이 없는 설계와 기술 후보는 `proposed`로 기록한다.
- 거부된 대안과 이유를 삭제하지 않는다.
- accepted 결정을 바꿀 때는 새 ADR을 만들고 이전 ADR을 `superseded`로 표시한다.
- ADR index와 repository docs index를 함께 갱신한다.

이 규칙은 루트 `AGENTS.md`, `docs/AGENTS.md`, Agent Runbook에도 연결해 후속 agent 작업의 기본 계약으로 만든다.

## Decision evidence

- 2026-08-22 사용자 요청: 지금 결정하는 내용을 별도 ADR에 정리할 것.
- 2026-08-22 사용자 요청: 이후 작업마다 ADR이 갱신·관리되게 할 것.
- 2026-08-22 사용자 목적: ADR을 앞으로의 판단 근거로 사용할 것.

## Consequences

- 미래 작업은 이미 결론 난 경계를 다시 추측하지 않고 ADR에서 확인할 수 있다.
- rejected direction도 남아 같은 실패를 반복할 가능성이 낮아진다.
- 중요한 변경은 코드와 문서 외에 ADR 유지 비용이 추가된다.
- 모든 작은 변경에 ADR을 만들면 신호가 약해지므로 durable decision에만 적용한다.

## Alternatives considered

### Spec과 plan만 유지

구현에는 충분하지만 폐기한 대안, 장기 경계, supersession history를 찾기 어렵다. 채택하지 않았다.

### 하나의 living design note만 유지

현재 상태는 읽기 쉽지만 과거 판단을 덮어쓰게 된다. 결정별 기록과 supersession이 필요한 이번 목적에 맞지 않는다.

## Open questions

없음. ADR 문서 내용은 후속 결정과 함께 계속 늘어난다.

## Follow-up

- 새 작업에서 ADR trigger가 발생했는지 closeout 전에 확인한다.
- repository validation이 ADR index drift를 자동 검사할 필요가 생기면 별도 ADR에서 결정한다.
