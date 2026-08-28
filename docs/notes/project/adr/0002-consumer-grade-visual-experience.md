# ADR-0002: Consumer-grade visual experience를 UX 품질 기준으로 사용

- Status: superseded
- Date: 2026-08-22
- Decision owners: user / project
- Supersedes: none
- Superseded by: ADR-0007

> Historical resolution (2026-08-28): ADR-0007 fully supersedes this document as current public visual authority. 아래의 consumer-quality 의도는 과거 문제 인식으로만 참고하며, spatial/zoom/continuity 또는 후속 ADR-0003을 현재 구현 규칙으로 사용하지 않는다.

## Context

새 제품의 시각 방향을 찾는 과정에서 세 차례 prototype을 만들었다.

1. 종이, 교정쇄, 장부, 지도 같은 analog editorial 세계.
2. 무채색 SaaS와 developer tool 문법을 사용한 Focus/Trace, Projection Diff, Semantic Scale.
3. 큰 cobalt typography와 clause evidence reflow를 사용한 Living Argument.

사용자는 첫 번째를 오래됐다고 평가했고, 두 번째와 세 번째를 개발자 사이트처럼 보이며 원하는 UI/UX가 아니라고 명시적으로 거부했다. 문제는 색이나 polish가 아니라 출발점을 데이터 구조와 검토 상태에 둔 것이었다.

## Decision

새 visual direction은 consumer-grade visual knowledge product의 경험 품질을 기준으로 삼는다.

- 콘텐츠 이미지, 책, 문장, 장소, 기록이 공간과 탐색을 이끌어야 한다.
- 선택, 확대, 이동, 중첩, 다시 발견하는 상호작용이 기술 용어를 배우지 않아도 자연스러워야 한다.
- RAG와 knowledge graph는 retrieval과 relation quality를 지원하지만 기본 화면에서 기술 구조로 노출하지 않는다.
- public surface는 dashboard, admin, documentation, developer research tool처럼 보이지 않아야 한다.
- 시각적 인상은 현대적이고 고유해야 하지만 전문성과 신뢰를 잃는 decorative spectacle이 되어서는 안 된다.
- desktop interaction을 mobile의 정적 목록으로 낮추지 않고 touch에 맞는 동등한 탐색 경험을 설계한다.

현재 조사 기준은 Cosmos, mymind, Muse, Kosmik, Fabric, Are.na 같은 visual collection과 spatial thinking product다. 이 제품들의 브랜드를 복제하지 않고 content-led composition, zoom/nesting, object continuity, serendipity interaction을 분석한다.

당시에는 이 품질 기준을 유효한 guardrail로 두고 구체적인 visual world와 interaction model을 후속 [ADR-0003](0003-visual-storyworld-experience-model.md)에서 승인했다. 현재 기준은 ADR-0007의 exact editorial reference system이다.

## Decision evidence

- 사용자 요구: 직관적이고 전문적이며 신뢰성 있는 사이트.
- 사용자 우선순위: 작업량보다 품질.
- 사용자 피드백: analog 방향은 오래돼 보임.
- 사용자 피드백: monochrome Focus/Trace 방향은 너무 별로이며 개발자 사이트 같음.
- 사용자 피드백: Living Argument 방향도 진짜 아니며 너무 개발자스러움.
- 사용자 요청: UI/UX가 뛰어난 interactive design을 서브에이전트로 조사해 가져올 요소를 제안할 것.

## Consequences

- 다음 visual proposal은 source/claim/review schema를 먼저 그린 UI가 될 수 없다.
- 실데이터와 실제 media가 공간을 만드는 high-fidelity consumer experience로 검증해야 한다.
- 기술적 신뢰 정보는 필요하지만 기본 experience를 지배하지 않고 필요할 때 자연스럽게 드러나야 한다.
- browser prototype은 색만 다른 variant 여러 개보다 한 개의 충분히 깊은 interaction journey를 보여줘야 한다.
- 최종 visual direction이 승인되기 전 `DESIGN.md`를 대체하지 않는다.

## Alternatives considered

### Analog editorial archive

전문성과 물성을 주지만 오래된 출판물처럼 보였고 새 디지털 제품의 작동 방식을 가렸다. Rejected.

### Restrained SaaS / developer workspace

상태와 provenance는 명확했지만 beyondwin만의 인상과 발견성이 사라지고 개발자 도구처럼 보였다. Rejected.

### Kinetic typography / interactive argument

claim과 evidence 관계는 직접 조작할 수 있었지만 여전히 텍스트 기반 데이터 설명 사이트였으며 소비자 제품 경험이 아니었다. Rejected.

### Global force-directed graph

관계 규모를 보여주지만 해석 비용과 hairball 위험이 높다. 기본 visual direction으로 채택하지 않는다. 후속 조사에서 제한된 spatial relation이 유용할 수는 있다.

## Open questions

- 첫 public viewport를 image-led mosaic, nested spatial canvas, cinematic stream 중 무엇으로 구성할지.
- 하나의 canonical object가 private capture와 public exploration에서 어떻게 continuity를 유지할지.
- 실제 content media가 부족한 경우에도 visual experience가 성립하는 최소 조건.
- search, RAG answer, source provenance를 소비자 UX 안에서 언제 어떻게 드러낼지.

## Follow-up

- 서브에이전트가 current consumer visual knowledge products를 실제 browser에서 조사한다.
- 조사 결과는 복제할 interaction, 거부할 pattern, beyondwin 번역으로 분리한다.
- 조사와 사용자 승인의 결과는 [ADR-0003](0003-visual-storyworld-experience-model.md)에 기록했다.
