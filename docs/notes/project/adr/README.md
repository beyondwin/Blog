# Architecture Decision Records

이 폴더는 이후 작업이 다시 논쟁하지 않고 근거로 사용할 `beyondwin`의 durable decision을 보관한다. 이름은 ADR이지만 코드 구조만이 아니라 제품 경계, 공개 정책, 데이터 안전, 장기 UX 원칙도 포함한다.

ADR은 회의록이나 일일 작업 로그가 아니다. 미래 구현을 제약할 만큼 중요하고, 되돌릴 때 맥락이 필요한 판단만 기록한다.

## 현재 기록

| ID | 제목 | 상태 | 마지막 갱신 | 역할 |
| --- | --- | --- | --- | --- |
| [ADR-0000](0000-adr-governance.md) | ADR 관리 규칙 | accepted | 2026-08-22 | ADR을 언제 읽고 만들고 갱신하는지 정의한다. |
| [ADR-0001](0001-private-first-knowledge-product.md) | Private-first knowledge product와 curated public projection | accepted | 2026-08-22 | 새 제품의 private/public 경계를 고정한다. |
| [ADR-0002](0002-consumer-grade-visual-experience.md) | Consumer-grade visual experience를 UX 품질 기준으로 사용 | accepted guardrail | 2026-08-22 | 거부된 시각 방향과 다음 디자인이 지켜야 할 경계를 기록한다. 구체적인 visual world는 아직 proposed다. |
| [ADR-0003](0003-visual-storyworld-experience-model.md) | Visual Storyworld 경험 모델 | accepted | 2026-08-22 | Public Storyworld, Private Material Field, Resurface의 역할과 공통 object continuity를 고정한다. |
| [ADR-0004](0004-staged-aperture-public-composition.md) | Public Atlas의 기본 구성을 Staged Aperture로 사용 | accepted | 2026-08-22 | 첫 public scene의 desktop composition과 responsive/focus 번역 원칙을 고정한다. |
| [ADR-0005](0005-node-react-modular-monolith.md) | Node/React 모듈러 모놀리스와 분리된 공개 projection | accepted | 2026-08-24 | Node/React runtime, 앱 경계, immutable public release와 raw-sample/provenance 기반 fail-closed public renderer 품질 게이트를 고정한다. |
| [ADR-0006](0006-unified-public-reading-continuity.md) | 하나의 public visual world 안에서 탐색과 독서 모드를 분리 | accepted | 2026-08-23 | Storyworld와 reading surface가 공통 visual material, chrome, return, continuation grammar를 공유하도록 고정한다. |

## 상태

- `proposed`: 조사 또는 설계 중이다. 구현 근거로 강제하지 않는다.
- `accepted`: 사용자가 명시적으로 승인했으며 이후 작업의 기본 제약이다.
- `accepted guardrail`: 구체안은 미정이지만 반드시 지켜야 할 방향과 금지선은 승인됐다.
- `rejected`: 검토했지만 채택하지 않았다. 같은 실패를 반복하지 않도록 이유를 보존한다.
- `superseded`: 더 최신 ADR이 대체했다. 문서는 삭제하지 않고 후속 ADR을 링크한다.
- `deprecated`: 제품에서 더 이상 유효하지 않지만 직접 대체 ADR은 없다.

## ADR이 필요한 변화

다음 중 하나를 받아들이거나 버릴 때 ADR을 만들거나 갱신한다.

- 제품의 primary user, 핵심 작업, public/private 역할.
- runtime, persistence, retrieval, graph, RAG 같은 시스템 경계.
- 공개 가능 조건, human approval, source provenance 같은 안전 정책.
- route와 content lane의 장기 정보 구조.
- 여러 화면과 이후 기능을 제약하는 durable UX/visual 원칙.
- 이전 accepted decision을 대체하는 선택.

테스트 이름, component 분리, 작은 spacing, 쉽게 되돌릴 수 있는 local implementation detail은 ADR 대상이 아니다.

## 작업마다 적용하는 절차

1. 작업 시작 시 이 index와 관련 accepted ADR을 읽는다.
2. 기존 결정과 요청이 충돌하면 구현 전에 충돌을 사용자에게 알린다.
3. 중요한 선택이 확정되면 해당 작업 안에서 ADR을 새로 만들거나 상태·결과를 갱신한다.
4. 탐색 중인 선택지는 `proposed`로 두며 명시적 승인 전에는 `accepted`로 바꾸지 않는다.
5. 이전 결정을 바꿀 때는 새 ADR을 만들고 이전 ADR을 `superseded`로 표시한다.
6. ADR index, `docs/_index/catalog.yml`, 필요하면 `docs/_index/topics.yml`, `docs/INDEX.md`를 함께 맞춘다.
7. `npm run agent:check`, `git diff --check`, 완료 시 `npm run validate`로 확인한다.

## 문서 형식

새 ADR은 `NNNN-short-kebab-title.md`로 만들고 다음 구조를 사용한다.

```markdown
# ADR-NNNN: 제목

- Status: proposed | accepted | accepted guardrail | rejected | superseded | deprecated
- Date: YYYY-MM-DD
- Decision owners: user / project
- Supersedes: ADR-NNNN 또는 none
- Superseded by: ADR-NNNN 또는 none

## Context

이 판단이 필요해진 문제와 확인한 사실.

## Decision

확정한 내용. proposed 상태라면 아직 확정되지 않은 범위를 분명히 쓴다.

## Decision evidence

사용자 승인, repository evidence, source research처럼 결정 근거가 된 항목.

## Consequences

얻는 것, 지불하는 비용, 이후 구현이 지켜야 할 제약.

## Alternatives considered

검토한 대안과 채택하거나 거부한 이유.

## Open questions

아직 결정하지 않은 것. accepted 결정과 섞지 않는다.

## Follow-up

후속 spec, plan, code, 검증 경로.
```

## 다른 문서와의 관계

- ADR은 `왜 이 선택을 했는가`의 source of truth다.
- `PRODUCT.md`는 현재 제품 truth, `DESIGN.md`는 승인된 visual system을 설명한다.
- spec과 plan은 ADR 안에서 정한 경계를 구현 가능한 단위로 구체화한다.
- 구현이 ADR과 달라졌다면 문서를 현실에 맞춰 조용히 수정하지 않는다. 결정 변경인지 구현 오류인지 먼저 판별한다.
