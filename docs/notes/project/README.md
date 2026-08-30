# beyondwin 프로젝트 문서

이 폴더는 현재 `FORM & THOUGHT` React-only public site, immutable release, content/media/public
memory boundary와 운영 절차를 설명한다. built truth는 ADR-0007, `DESIGN.md`, architecture
reference와 실제 code/scripts다. 이전 renderer와 visual system 자료는 삭제하지 않은 history다.
ADR-0008의 full-bleed density와 topic-family article media는 2026-08-30 로컬 구현·검증을
마쳤고 현재 built truth는 `DESIGN.md`가 소유한다. review cover는 같은 결정의 fail-closed 권리
경계를 구현했지만 승인 가능한 재배포 grant가 없어 18건 모두 HOLD다. ADR-0009는 `/search/`의
질문형 second-brain 전환과 UI-only 진실성 경계를 고정한다.

## current docs

| 문서 | 쓰는 때 |
| --- | --- |
| [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md) | current public product/renderer decision 확인 |
| [ADR-0008](adr/0008-full-bleed-density-and-topic-media.md) | implemented full-bleed density, topic-family media와 review-cover rights gate 확인 |
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

## current completion and residual risks

| surface | current state | next action |
| --- | --- | --- |
| full-bleed density | `implemented_and_verified_locally` | 같은 layout plan을 다시 실행하지 않고 `DESIGN.md`를 built truth로 사용한다. |
| article media | `implemented_and_verified_locally`; 17/17 featured media | 새 콘텐츠나 승인 asset이 생길 때만 media workflow를 다시 연다. |
| review covers | approved 0 / HOLD 18; public cover bytes 0 | 권리자 또는 정식 대리인의 exact-asset public redistribution grant가 생긴 record만 독립 권리 검토로 넘긴다. |
| search avatar rights | `partially_verified`; independent legal review `not_measured` | exact checksum을 외부 독립 법률 검토에 제출한다. 그 전에는 `fully_verified`나 content-media 승인으로 올리지 않는다. |
| production | origin `not_measured`; cutover authorization `false` | 승인된 HTTPS origin과 별도 배포 권한이 생긴 뒤 production gate를 실행한다. |

검색 avatar의 기계·시각·project-fit 검증은 완료됐지만 법률 판단을 대체하지 않는다. 단일 권리
receipt는
[avatar decision manifest](assets/form-and-thought-second-brain-avatar/decision-manifest.yml)이며,
검토 대상은 그 문서의 exact checksum이다. 내부 agent 검토나 controller 승인은 independent legal
review로 기록하지 않는다.

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
