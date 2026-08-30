# beyondwin 프로젝트 문서

`FORM & THOUGHT`는 React Router 공개 사이트다. 글은 `src/content/`에 두고,
`packages/content`가 immutable release를 만들며 `apps/site`만 렌더한다.

## 지금 읽을 것

| 궁금한 것 | 문서 |
| --- | --- |
| 제품이 무엇인가 | [PRODUCT.md](../../../PRODUCT.md) |
| 로컬에서 여는 법 | [시작하기](getting-started.md) |
| 화면·토큰·route | [DESIGN.md](../../../DESIGN.md) |
| 패키지·release·경계 | [아키텍처 레퍼런스](architecture-reference.md) |
| 글을 만들고 공개하는 법 | [콘텐츠 운영](publishing-workflows.md) |
| agent가 어디를 고칠지 | [Agent Runbook](agent-runbook.md) |
| 왜 이렇게 나눴는지 | [구성된 이유](design-and-content-rationale.md) |
| 왜 이 결정을 했는지 | [ADR](adr/README.md) |

## 필요할 때만

| 문서 | 쓰는 때 |
| --- | --- |
| [공개 사이트 설계](form-and-thought-public-site-design.md) | 정보 구조와 화면 역할 |
| [시각 스펙](form-and-thought-visual-spec.md) | geometry, reference, QA |
| [이미지 아트 디렉션](form-and-thought-image-art-direction.md) | 생성 이미지·표지 경계 |
| [Node/React 목표 구조](node-react-modular-monolith-design.md) | 아직 없는 API/studio/DB |
| [최종 acceptance](evidence/form-and-thought-final-acceptance.md) | 로컬 수락 증거 |

## 현재 상태

- 공개 renderer는 `apps/site` 하나다. Astro와 구 URL은 지원하지 않는다.
- 공개 corpus는 아티클 17, 서평 18, 생각 1이다. 서평 표지 18건은 모두 HOLD다.
- production origin은 `not_measured`, cutover 권한은 `false`다.
- 검색 avatar 권리는 `partially_verified`이며 법률 검토는 `not_measured`다.

## 종료 기록

레거시 실행 문서는 [history](history/README.md)에만 둔다. 현재 명령으로 쓰지 않는다.
