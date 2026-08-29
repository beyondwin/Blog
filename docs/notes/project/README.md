# beyondwin 프로젝트 문서

이 폴더는 현재 `FORM & THOUGHT` React-only public site, immutable release, content/media/public
memory boundary와 운영 절차를 설명한다. built truth는 ADR-0007, `DESIGN.md`, architecture
reference와 실제 code/scripts다. 이전 renderer와 visual system 자료는 삭제하지 않은 history다.
ADR-0008은 구현 전 승인된 full-bleed density와 topic-family media target이며 현재 built truth와
구분한다. ADR-0009는 `/search/`의 질문형 second-brain 전환과 UI-only 진실성 경계를 고정한다.

## current docs

| 문서 | 쓰는 때 |
| --- | --- |
| [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md) | current public product/renderer decision 확인 |
| [ADR-0008](adr/0008-full-bleed-density-and-topic-media.md) | approved full-bleed density와 topic-family media target 확인 |
| [ADR-0009](adr/0009-question-led-public-record-interface.md) | approved question-led search, fixture와 real-search fallback 경계 확인 |
| [Design built truth](../../../DESIGN.md) | tokens, typography, route composition, responsive behavior 변경 |
| [Architecture reference](architecture-reference.md) | route, schema, release, delivery, no-JS와 private boundary 확인 |
| [Agent Runbook](agent-runbook.md) | task read/edit/verification surface 선택 |
| [Getting started](getting-started.md) | install, validate, local host 실행 |
| [Publishing workflows](publishing-workflows.md) | content, review, media, queue, memory 운영 |
| [FORM & THOUGHT public design](form-and-thought-public-site-design.md) | approved product source와 historical implementation scope 확인 |
| [Visual spec](form-and-thought-visual-spec.md) | exact reference geometry와 calibration 확인 |
| [Image art direction](form-and-thought-image-art-direction.md) | generated candidate 만들기 전 prompt/placement boundary 확인 |
| [Final acceptance](evidence/form-and-thought-final-acceptance.md) | final route/browser/gate evidence 확인 |

## history map

ADR-0002/3/4/6, ADR-0005의 renderer-retention clause, Public Atlas/reading continuity designs,
renderer comparison과 old cutover evidence는 당시 판단과 migration provenance를 보존한다.
현재 작업 command로 사용하지 않는다. FORM & THOUGHT implementation plan은 완료 순서의
기록이며 Task 15 이후 built truth를 대신하지 않는다.

## code contracts

- `apps/site`: 유일한 React Router public renderer와 static delivery.
- `packages/content`: source schema, trusted MDX, media, immutable release.
- `packages/contracts`: public record/media/release contract.
- `src/content`: six source collections; public selection is `published && !draft`.
- `src/data/memory.public.json`: public app이 읽는 유일한 memory projection.
- `npm run validate`: complete local gate.
- production origin: `not_measured`; production cutover authorization: `false`.

## 유지보수

schema, route, command, media approval, validation 또는 delivery truth가 바뀌면 architecture,
runbook/workflow와 agent guidance를 같은 변경에서 갱신한다. 중요한 결정이 바뀌면 accepted
ADR을 조용히 덮어쓰지 않고 새 ADR로 supersede한다. durable note는 catalog/topics/INDEX에
등록한다. `docs/wiki/`는 generated navigation이며 source of truth가 아니다.
