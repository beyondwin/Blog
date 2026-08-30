# ADR-0003: Visual Storyworld 경험 모델

- Status: superseded
- Date: 2026-08-22
- Decision owners: user / project
- Supersedes: none
- Superseded by: ADR-0007

> Historical resolution (2026-08-28): 이 ADR의 Visual Storyworld, scene route, zoom/continuity와 follow-up은 retired implementation history다. 현재 공개 디자인과 실행 authority는 ADR-0007과 FORM & THOUGHT 구현 계획이다.

## Context

[ADR-0002](0002-consumer-grade-visual-experience.md)는 analog editorial, restrained SaaS/developer workspace, kinetic typography를 거부하고 consumer-grade visual knowledge experience를 품질 기준으로 정했다. 그 기준을 실제 제품 구조로 만들기 위해 Cosmos, mymind, Allume, Fabric, Milanote, Are.na, Apple Photos, Arc Peek를 2026년 현재 제품 화면과 공식 문서에서 조사했다.

조사 결과는 공통적으로 지식 구조를 먼저 설명하기보다 자료 자체를 보여주고, 선택한 자료를 맥락을 잃지 않은 채 확대하며, AI를 검색과 재발견 뒤에 숨기는 쪽이 강했다. 반면 public home을 masonry feed나 infinite canvas로 만들면 다른 visual collection product의 복제본이 되거나 다시 도구처럼 보일 위험이 있었다.

## Decision

`beyondwin`의 새 경험 모델을 다음 세 surface로 나눈다.

### Public Atlas: Visual Storyworld

Public의 기본 진입은 대표 media 하나와 주변의 승인된 자료 2–4개로 구성된 유한한 장면이다. 방문자는 장면 안의 실제 이미지, 책 표지, source screenshot, figure, 문장을 선택해 들어간다.

- 장면마다 lead object 하나가 명확한 focus를 갖는다.
- 장면은 사람이 승인한 editorial composition이며 AI가 즉석 생성하지 않는다.
- 선택한 object는 현재 위치에서 viewport로 확대되고, back 시 원래 장면의 위치와 focus로 돌아온다.
- 탐색 깊이는 `overview -> scene -> artifact/read` 세 단계로 제한한다.
- public navigation은 `장면 · 글 · 책 · 찾기`를 사용하며 내부 schema 이름을 노출하지 않는다.

### Private Studio: Material Field

Private에서는 실제 source, 책, PDF, screenshot, note를 모으고 장면을 구성한다. Material Field는 수집과 구성을 위한 작업 surface이며 public home의 기본 형식이 아니다.

- AI는 tagging, relation candidate, retrieval, resurfacing을 제안한다.
- canonical object와 relation은 사람이 검토한다.
- public 장면에 사용할 lead, support, context, 순서를 사람이 명시적으로 승인한다.
- 편집 제어와 private suggestion은 public projection에 포함하지 않는다.

### Resurface: 느린 재발견

잊힌 private material 하나를 전체 focus로 다시 보여주고 `유지`, `room에 연결`, `숨김`처럼 작은 행동만 제공한다. 점수, 좋아요, 무한 추천 feed를 만들지 않는다.

### 공통 원칙

- 하나의 canonical material이 여러 human-authored context를 가질 수 있지만 object 자체를 복제하지 않는다.
- RAG와 knowledge graph는 ranking, search, related candidate, rediscovery를 담당하며 기본 UI에 node, edge, embedding, similarity score로 나타나지 않는다.
- public relation은 작성자 승인과 plain-language reason을 가져야 한다.
- mobile은 desktop canvas의 축소판이 아니라 lead media, edge peek, swipe, full-screen focus로 같은 journey를 제공한다.
- 실제 media가 visual identity의 주된 색을 제공하며 generic stock이나 장식용 AI 이미지를 채움재로 쓰지 않는다.

## Decision evidence

- 2026-08-22 사용자 요구: 직관적이고 전문적이며 신뢰성 있는 interactive site.
- 2026-08-22 사용자 우선순위: 작업량보다 품질.
- 2026-08-22 사용자 피드백: analog, developer-tool, text/data interface 방향 거부.
- 서브에이전트 3개가 실제 제품과 공식 문서를 독립적으로 조사했고, bounded spatial context, object focus, provenance, invisible intelligence에 수렴했다.
- 2026-08-22 사용자가 `Visual Storyworld / Material Field / Resurface` 제안을 명시적으로 승인했다.

## Consequences

- 첫 화면은 소개 hero나 dashboard가 아니라 실제 public content로 구성한 장면이어야 한다.
- 대표 media가 없는 콘텐츠를 억지로 image card로 만들 수 없다. 첫 장면은 권리와 provenance가 확인된 media가 있는 콘텐츠부터 구성한다.
- public 장면 배치는 retrieval score가 아니라 versioned human approval 결과여야 한다.
- focus, read, back 사이의 position과 focus restoration이 핵심 제품 동작이므로 단순 modal로 대체할 수 없다.
- Private Studio와 Public Atlas는 canonical object identity를 공유하지만 renderer와 허용 field가 다른 explicit projection contract를 가진다.
- 기존 `DESIGN.md`의 press-proof visual world는 현재 shipping site의 설명으로만 남고, 새 world가 구현·검증된 뒤 built truth에서 교체한다.

## Alternatives considered

### Public Material Field 또는 masonry feed

자료 밀도와 발견성은 좋지만 첫 화면이 Cosmos clone이나 moodboard처럼 보일 위험이 높다. Private Studio의 수집 surface로 제한하고 Public의 기본 형식으로 채택하지 않았다.

### Global semantic graph

관계를 직접 보여주지만 해석 비용, hairball, developer-tool 인상이 크다. 계산 모델로는 사용할 수 있지만 public visual grammar로 채택하지 않았다.

### Cinematic scroll narrative

한 방향으로 안내하기 쉽지만 다시 방문해 지식을 탐색하는 제품보다 일회성 campaign site에 가까워진다. 짧은 진입과 복귀 motion만 취하고 scroll-jacking은 거부했다.

### One UI for private and public

구현은 단순하지만 편집 도구, AI suggestion, private state가 public experience에 새어 나온다. canonical object만 공유하고 surface는 역할에 맞게 분리한다.

## Open questions

- Node/TypeScript runtime, persistence, graph projection, retrieval pipeline은 별도 architecture ADR에서 결정한다.
- Private Studio의 authoring interaction과 review state machine은 별도 sub-project로 설계한다.
- Public scene이 여러 개로 늘어날 때의 route와 scene selection policy는 첫 vertical slice 검증 후 확정한다.
- 기존 book cover 중 redistribution rights warning이 있는 asset은 public scene 사용 전에 별도 권리 검토가 필요하다.

## Historical follow-up

- 당시 첫 sub-project는 [Public Atlas Visual Storyworld vertical slice](../history/visual-storyworld-public-atlas-design.md)였고 그 결과는 역사적 evidence로 남긴다.
- 현재 공개 UI 작업은 [ADR-0007](0007-form-and-thought-react-only-editorial-system.md)과 `DESIGN.md`를 따른다.
