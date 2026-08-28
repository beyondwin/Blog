# ADR-0006: 하나의 public visual world 안에서 탐색과 독서 모드를 분리

- Status: superseded
- Date: 2026-08-23
- Decision owners: user / project
- Supersedes: none
- Superseded by: ADR-0007

> Historical resolution (2026-08-28): mineral reading continuity, scene/detail handoff, Astro parity/cutover follow-up은 retired implementation history다. 현재 공개 UX와 전환 순서는 ADR-0007과 FORM & THOUGHT 구현 계획이 대체한다.

## Context

[ADR-0003](0003-visual-storyworld-experience-model.md)과 [ADR-0004](0004-staged-aperture-public-composition.md)는 `/`의 공개 탐색 화면을 실제 media와 제한된 context object가 만드는 Visual Storyworld로 정했다. 첫 vertical slice는 Staged Aperture, Continuity Zoom, no-JS canonical anchor, exact mobile return을 구현했지만 `/articles/`, `/reviews/`, `/memory/`, `/search/`와 detail route의 시각·이동 문법은 재설계 범위에서 제외했다.

그 결과 현재 홈은 밝은 mineral field, optical white, rich ink, cobalt selection, compact mobile drawer를 사용하지만 기존 reading route는 gray booth, `+` mark, crop marks, 다색 production bar가 있는 press-proof world를 유지한다. 각 화면은 독립적으로 동작하지만 홈에서 상세로 이동하면 배경, chrome, production metaphor, action language가 동시에 바뀐다.

흐름에도 단절이 있다.

- 홈 overview의 `전체 보기`는 focus 진입이고 focus panel의 같은 문구는 장면 복귀다.
- scene, collection list, search에서 detail로 이동한 출발 맥락을 detail이 보존하지 않는다.
- article의 `이전 쇄`, review의 heading 없는 relation, memory의 companion/source link가 서로 다른 후속 탐색 문법을 쓴다.
- 홈 mobile navigation은 drawer지만 reading route는 네 primary link를 직접 노출한다.

## Decision

Public site는 하나의 visual world 안에서 역할이 다른 두 mode를 사용한다.

### Scene mode

- `/`의 Staged Aperture, actual media, text object, Continuity Zoom을 유지한다.
- overview action은 `살펴보기`와 `글 읽기` 또는 `책 읽기`로 목적지를 분리한다.
- focus action은 `글 읽기` 또는 `책 읽기`, `장면으로 돌아가기`를 사용한다.
- no-JS canonical anchor, reduced motion, exact mobile rail return 계약을 유지한다.

### Reading mode

- list, detail, search, memory, tag와 보조 public lane은 같은 mineral field, optical-white reading surface, rich ink, cobalt interaction, mark-less wordmark, desktop/mobile navigation을 공유한다.
- gray booth, `+` mark, crop marks, 다색 production bar는 새 reading world에서 사용하지 않는다.
- long-form detail은 약 42em measure, desktop 17px/1.9, mobile 16px의 조용한 reading rhythm을 유지한다.
- article, memory, search에 image card를 강제하지 않는다. Review cover는 실제 material로 유지하며 표지에만 제한적인 shadow를 허용한다.

### Continuity threshold

- scene에서 detail로 들어갈 때 선택한 object의 title, optional media, cobalt marker, contextual return을 detail 상단에서 한 번 이어 준다.
- 이후 본문에서는 탐색 chrome이 물러나고 정적인 reading surface가 중심이 된다.
- detail은 scene, article list, review list, search의 allowlisted origin만 표시한다. Origin이 없거나 유효하지 않으면 해당 collection index로 fallback한다.
- 기본 anchor와 canonical metadata는 깨끗한 content URL을 유지한다. 같은 탭의 unmodified click만 progressive enhancement가 origin context를 전달한다.

### Continued discovery

- detail 하단은 `이어서 읽기`라는 공통 heading을 사용한다.
- 사람에게 승인된 relation과 plain-language reason이 있는 항목만 최대 세 개 표시한다.
- 항목 수를 채우기 위해 무관한 최신 글이나 자동 생성 이유를 넣지 않는다.
- `이전 쇄`는 실제 revision chronology에만 사용한다.

### Runtime placement

- 이 UX를 현재 Astro route에 새로 구현하지 않는다. Astro output은 route, content, media, accessibility, no-JS, reduced-motion, exact-return parity를 검증하는 baseline으로만 사용한다.
- [ADR-0005](0005-node-react-modular-monolith.md)의 public renderer comparison gate가 Next.js App Router 또는 React Router Framework Mode를 선택한 뒤, 선택된 `apps/site` renderer에 이 design을 한 번 구현한다.
- Framework comparison slice는 먼저 current behavior의 parity를 증명해 renderer 선택과 visual redesign 판단을 분리한다. 선택되지 않은 spike에 redesign code를 중복 구현하지 않는다.
- 선택된 React renderer의 redesigned vertical slice가 acceptance matrix를 통과한 뒤 list, detail, tag, search, memory 전체 route로 확장하고 Astro를 cutover/rollback baseline으로 유지한다.
- 전체 route parity, public release, rollback, clean-host restore, observation window를 통과하면 Astro dependency, config, route, component를 제거한다.

## Decision evidence

- 2026-08-23 사용자 피드백: detail page의 tone이 main page와 맞지 않고 main에서 글로 들어가는 UI/UX가 애매하다.
- Repository evidence: `DESIGN.md`는 reading route가 새 공개 탐색 visual world의 재설계 범위가 아니라고 명시한다.
- Browser evidence: desktop과 mobile에서 home, focus, articles, article detail, review detail, search, memory를 확인했고 cross-route console error와 warning은 없었다. 문제는 isolated component defect가 아니라 cross-route experience contract였다.
- Independent sub-agent research: information architecture, visual-system audit, current editorial-site benchmark가 explicit entry labels, named return destination, bounded related reading, expressive home과 quiet detail의 역할 분리에 수렴했다.
- 2026-08-23 사용자가 `하나의 세계, 두 개의 모드`, 전체 경험 구조, calibrated threshold visual system, navigation-context/error contract, 적용 범위와 완료 기준을 순서대로 승인했다.

## Consequences

- 현재 press-proof reading identity는 built truth로는 구현 교체 전까지 남지만 새 target design으로는 유지되지 않는다.
- Storyworld를 모든 detail에 복제하지 않는다. 공통 visual material과 navigation grammar를 공유하되 scene은 spatial exploration, detail은 reading을 최적화한다.
- Header, footer, surface tokens, contextual return, continuation relation은 lane-local 구현이 아니라 shared contract가 된다.
- Return behavior는 browser Back만 가정하지 않는다. Direct URL, refresh, copied context URL, JavaScript-disabled navigation에 안전한 collection fallback이 있어야 한다.
- Context transport는 arbitrary return URL을 받지 않고 allowlisted internal origin만 사용한다.
- 이 UX 계약의 production implementation target은 [ADR-0005](0005-node-react-modular-monolith.md)의 gate에서 선택된 React public renderer다. Astro는 migration baseline이며 새 reading-world 구현 대상이 아니다.
- 구현이 완료되기 전 `DESIGN.md`를 새 reading world가 이미 shipped된 것처럼 수정하지 않는다.

## Alternatives considered

### Explicit two-mode handoff while retaining press-proof pages

Detail 상단에 scene trace만 추가하고 gray booth와 production marks를 유지하는 안이다. 구현 범위는 작지만 방문자가 두 브랜드 사이를 이동하는 인상을 근본적으로 해결하지 못해 채택하지 않았다.

### Material-specific bespoke detail for every lane

Article figure, review cover, memory text object를 중심으로 lane마다 다른 detail composition을 만드는 안이다. 표현력은 크지만 media가 없는 content와 lane별 예외가 늘어나 공통 흐름의 예측 가능성을 약화하므로 기본 방향으로 채택하지 않았다.

### Turn every route into a Storyworld scene

강한 시각 연속성은 주지만 긴 글 읽기, 검색, tag browsing까지 spatial interaction을 요구해 콘텐츠보다 UI 해석 비용이 커진다. Scene과 reading의 역할 분리를 유지한다.

## Open questions

- Component와 stylesheet의 최종 파일 이름 및 내부 분리는 public renderer decision gate가 끝난 뒤 선택된 React framework의 boundary에 맞춰 정한다.

## Historical follow-up

- [Public reading continuity 상세 설계](../public-reading-continuity-design.md)는 당시 migration evidence로 보존한다.
- 현재 구현은 [ADR-0007](0007-form-and-thought-react-only-editorial-system.md)과 [FORM & THOUGHT 구현 계획](../form-and-thought-implementation-plan.md)의 React-only acceptance, recovery-contract 이전, exact Astro removal 순서를 따른다.
