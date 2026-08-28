# beyondwin 프로젝트 문서

이 폴더는 `beyondwin` 코드베이스 자체를 설명한다. 현재 built truth와 아직 구현 전인 승인된 `FORM & THOUGHT` React-only 목표, content collection, publishing workflow, public memory projection, validation gate, archive docs 규칙을 다룬다. 새 공개 디자인과 Astro 제거 결정은 [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md)이 우선하지만, target 문서의 존재만으로 현재 코드나 production이 전환됐다고 판단하지 않는다.

빠르게 작업하려면 아래 순서로 읽는다.

## 문서 지도

| 문서 | 역할 | 읽는 시점 |
| --- | --- | --- |
| [FORM & THOUGHT 공개 사이트 설계](form-and-thought-public-site-design.md) | Product design | 승인된 화면 구성, 콘텐츠 lane, 편집 계약, React-only 전환 범위를 구현할 때 |
| [FORM & THOUGHT 시각 스펙](form-and-thought-visual-spec.md) | Visual specification | 승인 시안과 같은 geometry, palette, typography, responsive behavior를 재현하고 visual QA할 때 |
| [FORM & THOUGHT 이미지 아트 디렉션](form-and-thought-image-art-direction.md) | Image direction | 대표 이미지 후보, contact sheet, provenance, 승인 경계를 운영할 때 |
| [FORM & THOUGHT React-only 공개 사이트 구현 계획](form-and-thought-implementation-plan.md) | Implementation plan | thoughts migration, representative visual gate, 전체 route·콘텐츠, Astro 제거와 final acceptance를 순서대로 실행할 때 |
| [시작하기](getting-started.md) | Tutorial | 처음 checkout한 뒤 사이트를 실행하고 콘텐츠 한 건이 route로 이어지는 과정을 확인할 때 |
| [콘텐츠 운영](publishing-workflows.md) | How-to | 글, 리뷰, queue item, source-grounded article, memory, archive docs를 실제로 추가하거나 고칠 때 |
| [서평 제외 아티클 전면 개선 설계](non-review-article-improvement-design.md) | Historical editorial design | 2026-08-26 당시 article 18편 편집의 근거를 확인할 때. 현재 분류는 ADR-0007의 아티클 17편·생각 1편이다. |
| [서평 제외 아티클 전면 개선 구현 계획](non-review-article-improvement-implementation-plan.md) | Retired historical plan | 2026-08-26 편집 당시 계획 snapshot과 commit 흐름을 확인할 때. 체크박스는 현재 상태가 아니며 새 lane과 React-only 전환에는 재사용하지 않는다. |
| [Agent Runbook](agent-runbook.md) | Agent task map | 에이전트가 작업 유형별 read order, 수정 표면, 위험 경계, 검증 명령을 빠르게 확인해야 할 때 |
| [Architecture Decision Records](adr/README.md) | Decision log | 제품, 아키텍처, 데이터 경계, 공개 정책, durable UX의 현재 판단과 폐기한 대안을 확인하거나 갱신할 때 |
| [Node/React 모듈러 모놀리스 설계](node-react-modular-monolith-design.md) | Target architecture | 유지되는 Node/React 앱 경계, PostgreSQL·worker, public release 구조를 확인할 때. Astro retention 조항은 ADR-0007이 대체한다. |
| [`판단` 공개 탐색 화면 설계](visual-storyworld-public-atlas-design.md) | Superseded design | 과거 Public Atlas의 구현 근거와 변경 이력을 확인할 때 |
| [Public reading continuity 설계](public-reading-continuity-design.md) | Superseded design | 과거 mineral reading world의 판단과 변경 이력을 확인할 때 |
| [Public reading continuity 구현 계획](public-reading-continuity-implementation-plan.md) | Historical implementation plan | React renderer 선택과 이전 migration evidence를 확인할 때 |
| [공개 글·책 독서 지면 설계](reading-surface-density-design.md) | Superseded design | 과거 글·책 독서 지면의 구현 근거를 확인할 때 |
| [공개 글·책 독서 지면 구현 계획](reading-surface-density-implementation-plan.md) | Historical implementation plan | 과거 reading surface 작업과 검증 경로를 확인할 때 |
| [Public reading continuity migration 작업 회고](public-reading-continuity-migration-retrospective.md) | Retrospective | 대형 migration의 검증 반복을 줄이고 review·source freeze·evidence 재사용 순서를 잡을 때 |
| [Public renderer 비교 근거](evidence/public-renderer-comparison.md) | Evidence | React Router 선택·승격의 sealed raw sample, deterministic run, mandatory/variance 계산, rejected source 경계를 확인할 때 |
| [아키텍처 레퍼런스](architecture-reference.md) | Reference | route, schema, script, test, data contract의 정확한 값이 필요할 때 |
| [설계 이유](design-and-content-rationale.md) | Explanation | 왜 typed collection, private-first memory, docs layer, restrained design을 택했는지 이해해야 할 때 |

`Agent Runbook`은 개념 설명을 반복하지 않고, 작업 전에 어떤 원문을 읽고 어디를 수정하며 어떤 명령으로 검증할지 라우팅한다.

## 코드에서 확인한 핵심 계약

아래 항목은 2026-08-28 현재 구현된 built truth다. FORM & THOUGHT 구현이 완료되고 Task 15 문서 동기화가 통과할 때까지 target 경로로 미리 바꾸지 않는다.

- React Router 공개 renderer와 route slice는 [`apps/site`](../../../apps/site/)에 구현돼 있고 framework-neutral release는 `packages/content`와 `packages/contracts`가 소유한다.
- Astro [src/pages/](../../../src/pages/)와 [src/content.config.ts](../../../src/content.config.ts)는 현재 rollback/baseline과 일부 남은 validation 책임으로 공존한다. Task 14 acceptance와 책임 이전 전에는 제거하지 않는다.
- legacy Astro collection 공통 동작은 [src/lib/content.ts](../../../src/lib/content.ts)가 맡으며, 제거 전 exact replacement owner가 필요하다.
- `/memory`는 `memory/**`를 직접 읽지 않고 [src/data/memory.public.json](../../../src/data/memory.public.json)만 읽는다.
- `npm run validate`가 문서와 콘텐츠 변경의 기본 완료 기준이다.
- curated docs를 추가하거나 옮기면 [docs/_index/catalog.yml](../../_index/catalog.yml), [docs/_index/topics.yml](../../_index/topics.yml), [docs/INDEX.md](../../INDEX.md)를 같이 맞춘다.
- 중요한 제품·아키텍처·UX 판단은 [ADR index](adr/README.md)를 먼저 확인하고, 결정이 달라진 작업에서는 같은 변경으로 ADR을 갱신한다.

## 근거 파일

이 문서는 다음 파일을 읽고 갱신한다.

- [README.md](../../../README.md)
- [PRODUCT.md](../../../PRODUCT.md)
- [DESIGN.md](../../../DESIGN.md)
- [SYNC.md](../../../SYNC.md)
- [src/content.config.ts](../../../src/content.config.ts)
- [src/lib/content.ts](../../../src/lib/content.ts)
- [src/lib/memoryData.ts](../../../src/lib/memoryData.ts)
- [scripts/validate-content.mjs](../../../scripts/validate-content.mjs)
- [scripts/article-quality.mjs](../../../scripts/article-quality.mjs)
- [scripts/create-article-packet.mjs](../../../scripts/create-article-packet.mjs)
- [scripts/queue.mjs](../../../scripts/queue.mjs)
- [scripts/memory/project.mjs](../../../scripts/memory/project.mjs)
- [scripts/memory/schema.mjs](../../../scripts/memory/schema.mjs)
- [docs/implementation/memory-second-brain.md](../../implementation/memory-second-brain.md)

## 유지보수 원칙

- project 문서는 일반 글감이나 외부 리서치 노트와 섞지 않는다.
- schema, route, command, validation gate가 바뀌면 reference와 how-to를 같은 변경에서 갱신한다.
- accepted ADR과 구현이 어긋나면 구현을 완료로 간주하지 않는다. 결정이 바뀐 것이라면 기존 ADR을 조용히 덮어쓰지 말고 새 ADR에서 supersede한다.
- 운영자가 따라 할 수 없는 표현은 삭제한다. “관리한다”, “지원한다” 대신 어느 파일을 어떻게 바꾸고 어떤 명령으로 확인하는지 쓴다.
- 생성된 `docs/wiki/`는 navigation layer다. 중요한 판단은 `src/`, `scripts/`, `docs/notes/`, `docs/raw/`에서 다시 확인한다.
