# ADR-0004: Public Atlas의 기본 구성을 Staged Aperture로 사용

- Status: accepted
- Date: 2026-08-22
- Decision owners: user / project
- Supersedes: none
- Superseded by: none

## Context

[ADR-0003](0003-visual-storyworld-experience-model.md)은 Public Atlas를 하나의 lead object와 경계에서 이어지는 승인된 context로 구성하는 Visual Storyworld로 정했다. 이를 실제 첫 화면으로 번역하기 위해 같은 visual world 안에서 세 desktop composition을 비교했다.

- `Staged Aperture`: 중앙의 큰 lead와 좌우·아래 context가 하나의 장면을 만든다.
- `Gallery Rail`: lead에서 오른쪽 자료로 이어지는 익숙한 수평 gallery다.
- `Focus Stack`: 중앙 object의 확대와 복귀를 가장 강하게 예고한다.

## Decision

Public Atlas 첫 vertical slice의 desktop composition은 `Staged Aperture`를 사용한다.

- Lead object는 중앙에서 조금 오른쪽에 가장 큰 aperture로 배치한다.
- 좌우와 아래의 supporting object는 전체 card가 아니라 viewport 경계에서 일부가 이어지는 방식으로 보인다.
- 동시에 보이는 support/context는 2–4개로 제한한다.
- 이미지와 실제 material이 공간을 만들고 UI chrome은 navigation과 명시적 행동으로만 남긴다.
- 모바일은 이 desktop을 축소하지 않고 lead media, edge peek, swipe, `읽기`, `전체 보기`로 같은 공간 관계를 번역한다.
- Focus는 modal을 띄우지 않고 선택 object가 원래 geometry에서 viewport로 확장되는 Continuity Zoom으로 만든다.
- 최종 승인된 mobile intent는 lead가 첫 viewport의 약 70%를 차지하고 양쪽 edge peek, swipe, `읽기`, `전체 보기`를 유지하는 것이다.
- 최종 승인된 focus intent는 image-first split composition을 사용하고 title, action, provenance 순서로 정보를 드러내는 것이다. 아래 implemented-result section에 이 intent와 현재 shipped DOM/timing의 차이를 별도로 기록한다.
- 승인 시안의 차갑고 밝은 mineral desk와 cobalt bookmark 이미지를 새 `reading-desk-cobalt` media item으로 승격한다. 기존 warm `reading-desk-light`는 덮어쓰지 않는다.

## Decision evidence

- 2026-08-22 세 desktop composition을 동일한 실제 content와 visual system으로 비교했다.
- 프로젝트는 `Staged Aperture`를 Storyworld 정체성과 context 이해의 균형이 가장 좋은 안으로 추천했다.
- 2026-08-22 사용자가 추천 시안을 `승인`했다.
- 보드에서 별도 선택 event는 없었으므로 이 승인은 직전 응답에서 명시한 추천안 A, `Staged Aperture`에 대한 승인으로 해석했다.
- 2026-08-22 사용자가 별도 보드에서 desktop overview, 390 × 844 mobile, Continuity Zoom focus로 구성한 최종 realization 세트를 다시 `승인`했다.
- 승인된 새 lead 원본의 SHA-256은 `aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56`다.

## Implemented result and verification

2026-08-22 이 결정은 다음 경로에 실제 구현되었다.

- `src/pages/index.astro`: `/`의 server-rendered `판단` scene entry.
- `src/lib/scenes/publicScene.ts`: scene definition/ref type, public-only resolver, view model과 issue contract.
- `src/lib/scenes/judgmentScene.ts`: 현재 하나의 author-approved `판단` definition과 실제 published article/review/media projection 조립.
- `src/lib/scenes/sceneState.ts`: overview/focus reducer, query와 native rail scroll checkpoint parsing.
- `src/components/PublicScene.astro`, `src/components/PublicSceneObject.astro`: canonical no-JS anchor, focus/read/return/history interaction.
- `src/styles/storyworld.css`: desktop Staged Aperture, mobile native horizontal snap rail, Continuity Zoom, reduced-motion fallback.

최종 integrated focused contract는 4 files / 39 tests를 통과했고, Node 24.18.0 전체 `npm run validate`는 38 files / 277 tests, Astro diagnostics 0 errors / 0 warnings / 0 hints, 79 static pages로 통과했다. real-browser matrix는 독립 Playwright context와 별도 preview server에서 1586 × 992, 1440 × 900, 426 × 923 DPR2, 390 × 844, 360px fallback, reduced motion, JavaScript disabled, forced cobalt image failure를 검증했다.

- Desktop은 cobalt lead, authored tab order, visible 2px focus, direct/refreshed focus URL, read/back, Escape/overview return, invalid focus normalization, text-only `black-swan`, clean console, 1440/1440 no-overflow를 통과했다.
- Mobile은 390px에서 one-row header, 44 × 44 menu, full-viewport initial slot 안의 centered `70vw` first lead, support/context/hint `72vw`, simultaneous inert judgment/Black Swan edge aperture, 44px actions, authored two-line Korean title, accessible names, clean console, 390/390 no-overflow를 통과했다. 다섯 canonical anchor와 native scroll-snap은 그대로이고 edge echo는 rail exploration 뒤 사라진다.
- Reduced motion은 focus/return 동안 `Element.animate` 0회, `startViewTransition` 0회, document animation 0개였다.
- JavaScript-disabled context에서 다섯 server-rendered object anchor가 각각 canonical article/review route로 이동했다.
- cobalt image request를 의도적으로 실패시켜도 selected object, image aperture, information panel geometry delta가 모두 0이었고 title과 alt가 유지되었다.
- browser evidence는 `output/playwright/public-atlas-overview-1440.png`, `public-atlas-focus-1440.png`, `public-atlas-overview-390.png`, `public-atlas-focus-390.png`, `public-atlas-return-1440.png`, `public-atlas-reduced-motion-390.png`에 남겼다.

### Shipped realization and current limitations

- Focus panel의 type field는 visible text가 아니라 3px marker다. visible information order는 title, 실제 authored article excerpt, `읽기`, `전체 보기`, relation/source provenance다. panel은 480ms geometry motion의 336ms 지점에 reveal을 시작해 144ms에 완료한다. native named View Transition pseudo-element와 FLIP live opacity를 별도로 browser 측정했고 reduced motion은 animation 없이 즉시 보인다.
- Mobile first viewport는 양쪽 `15vw` 여백과 lead 뒤 `15vw` 간격으로 만든 full-viewport initial slot 안에 `70vw` canonical lead를 중앙 배치하고, resolved `judgment-scale`과 text-only `black-swan`을 비상호작용·`aria-hidden` edge echo로 겹친다. echo는 canonical id/href/action을 갖지 않고 native rail이 6px보다 많이 움직이면 사라진다. 실제 탐색은 여전히 다섯 canonical anchor와 `scroll-snap`만 담당하며 support/context/hint stop은 `72vw`다.
- Desktop 1440 × 900에서 lead CSS는 `min(61vw, 940px)` × `min(67vh, 670px)`이고 browser 측정은 878.390625 × 603이었다. 이 측정값은 해당 viewport evidence이며 responsive invariant가 아니다.

### Focus folio ruling

승인된 cobalt raster는 3:2 비율이라 desktop focus band 전체를 distortion, crop, 또는 설명되지 않은 blank 없이 채울 수 없다. 구현은 photo를 object 높이의 84%에서 고유 비율로 유지하고 아래 16%에 public scene metadata만 쓰는 authored folio를 둔다. 이 folio는 desktop cobalt focus에만 보이며 새 content나 비공개 정보를 발명하지 않는다. 이는 승인 시안의 image-first hierarchy와 asset integrity를 함께 지키는 의도적인 구현 절충이다.

### Exact mobile return precedent

첫 Task 7 browser pass는 가운데 정렬된 `judgment-scale`이 `scrollLeft 279`에서 focus한 뒤 Escape하면 `590`으로 이동하는 Important defect를 발견했다. 원인은 focus layout mutation 뒤 선택 identity만으로 snap 위치를 다시 계산했고 browser focus scrolling까지 개입한 데 있었다.

해결은 focus 직전 native rail의 정확한 `scrollLeft`를 `publicSceneScrollLeft`로 같은 history entry에 저장하고, overview geometry가 복구된 뒤 그 offset을 다시 적용한 다음 `preventScroll: true`로 keyboard focus를 돌려주는 것이다. 최종 mobile geometry browser gate에서 `judgment-scale`은 `349.5 → 349.5`이고 object rect는 `x 54.5 → 54.5`, `black-swan`은 `644 → 644`이고 rect는 `x 54.796875 → 54.796875`였다.

따라서 mobile spatial UI의 복귀 계약은 “같은 object를 다시 선택”하는 것으로 충분하지 않다. native scroll viewport의 정확한 좌표를 history에 함께 checkpoint하고, layout mutation 이후 복원하며, focus restoration이 viewport를 다시 움직이지 않게 해야 한다. judgment와 black-swan 같은 support object의 exact scene viewport continuity를 이후 변경의 promoted acceptance gate로 유지한다.

## Consequences

- 첫 구현은 일반 carousel, masonry, 동일 크기 card grid로 대체할 수 없다.
- supporting object가 강해져 editorial collage가 되지 않도록 수와 대비를 제한한다.
- responsive QA는 object의 pixel 위치가 아니라 lead/context 역할과 edge continuity가 유지되는지 검증한다.
- provenance는 image-title-excerpt-action hierarchy를 앞서지 않는다. relation/source는 두 action 뒤의 quiet factual block으로 유지한다.
- composition 시안은 방향 근거이며 실제 제품 텍스트와 interaction은 semantic HTML/CSS로 구현한다.
- 새 lead asset은 기존 article media bundle 안에 별도 id와 checksum, source path, verified date, rights note를 기록해야 한다.
- 생성 시안 PNG를 그대로 UI screenshot으로 렌더링하지 않는다. lead visual만 media asset으로 사용하고 모든 UI와 문자는 semantic HTML/CSS로 다시 만든다.
- mobile rail은 native horizontal scroll와 `scroll-snap`을 사용한다. custom drag, scroll-jacking, object identity 기반 재정렬로 exact-return contract를 약화하지 않는다.
- 현재 구현은 하나의 `판단` scene과 public projection뿐이다. 여러 scene, automatic scene assembly, private authoring surface, retrieval/graph persistence는 이 ADR의 구현 결과가 아니다.

## Alternatives considered

### Gallery Rail

수평 탐색과 mobile swipe가 가장 익숙하지만 일반적인 commerce gallery나 carousel로 보일 위험이 있어 채택하지 않았다.

### Focus Stack

Continuity Zoom을 가장 분명히 예고하지만 context 밀도가 부족하면 지식 제품보다 portfolio cover에 가까워질 위험이 있어 채택하지 않았다.

## Open questions

- 첫 slice의 geometry motion은 focus 480ms, return 360ms이고 70%-progress panel reveal, reduced-motion 즉시 전환, mobile first-frame depth까지 browser 검증했다. 여러 scene의 route와 전환 grammar는 별도 결정이 필요하다.

## Follow-up

- [Public Atlas Visual Storyworld vertical slice 설계](../visual-storyworld-public-atlas-design.md)에 구현과 browser-verified built truth를 유지한다.
- 승인된 desktop, mobile, focus 시안과 provenance는 [tracked visual references](../assets/public-atlas/README.md)에 보존한다. `.impeccable/`은 재현 가능한 source of truth가 아니라 로컬 작업 공간으로만 취급한다.
- future composition change는 support-object exact-return gate와 public projection boundary를 다시 검증한다.
