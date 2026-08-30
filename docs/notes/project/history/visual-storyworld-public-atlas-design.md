# Public Atlas Visual Storyworld vertical slice 설계

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](README.md)과 ADR을 본다.

- Status: implemented and browser verified
- Date: 2026-08-22
- Governing decisions: [ADR-0001](../adr/0001-private-first-knowledge-product.md), [ADR-0002](../adr/0002-consumer-grade-visual-experience.md), [ADR-0003](../adr/0003-visual-storyworld-experience-model.md), [ADR-0004](../adr/0004-staged-aperture-public-composition.md)
- Implementation boundary: Public Atlas의 첫 장면과 Continuity Zoom journey

## 구현 상태

2026-08-22 현재 `/`에는 author-approved `판단` scene 하나가 구현되어 있다. `reading-desk-cobalt`, `judgment-scale`, text-only `black-swan`, `reading-excerpt`, `shared-reading-table`을 public content/media resolver로 조립하고 `PublicScene`과 `PublicSceneObject`가 server-rendered canonical link를 제공한다.

- Desktop은 Staged Aperture를 사용한다. Mobile은 full-viewport initial slot 안의 centered `70vw` first lead와 `72vw` support/context/hint stop의 native horizontal `scroll-snap` rail이다. 첫 프레임의 양쪽 edge aperture는 이미 resolve된 public object의 inert `aria-hidden` echo이고 실제 탐색을 시작하면 사라진다.
- Focus는 `?focus=<object-id>`와 history state를 사용한다. read/back, `Escape`, `전체 보기`, direct URL, refresh, invalid focus fallback을 구현했다.
- mobile support object는 native rail `scrollLeft`를 history에 checkpoint한다. 최종 browser evidence에서 judgment는 `349.5 → 349.5`, black-swan은 `644 → 644`로 정확히 돌아왔다.
- pending/active object의 동일 focus request는 idempotent guard가 막아 rapid repeat activation도 history entry 하나만 만든다. focus panel은 authored excerpt와 actions를 provenance보다 먼저 드러낸다.
- reduced motion은 Web Animation과 View Transition을 시작하지 않는다. JavaScript가 없으면 다섯 object가 canonical article/review link로 동작한다.
- cobalt image failure에서도 selected aperture와 panel geometry, title, alt를 유지한다.
- 최종 integrated focused contract는 4 files / 39 tests, Node 24.18.0 전체 `npm run validate`는 38 files / 277 tests와 79-page build로 통과했다.

현재 구현 범위는 이 public projection 하나다. 여러 scene, automatic scene assembly, private authoring UI, retrieval backend, graph persistence는 구현되어 있지 않다.

## 1. 목적과 범위

이 구현은 전체 지식 작업 환경을 한 번에 만들지 않는다. 새 visual world와 핵심 interaction이 실제 beyondwin 콘텐츠에서 성립하는지 검증하는 하나의 public vertical slice다.

포함한다.

- `/`의 첫 viewport를 하나의 curated public scene으로 교체한다.
- 실제 published content와 검증된 repository media로 장면을 구성한다.
- `scene overview -> object focus -> artifact preview/read -> exact return` 흐름을 구현한다.
- desktop, keyboard, mobile touch, reduced motion에서 동등한 journey를 제공한다.
- public projection boundary와 stable content route를 유지한다.

포함하지 않는다.

- Private Studio editor, Inbox, capture extension.
- RAG ingestion, embedding, vector search, graph database.
- AI가 자동 생성하거나 공개하는 scene.
- 모든 article/review detail page의 전체 redesign.
- 여러 scene을 관리하는 CMS와 scene 추천 알고리즘.

## 2. 첫 장면: `판단`

첫 scene은 repository에 존재하는 실제 콘텐츠로 구성되어 있다.

| 역할 | Object | Source | 이유 |
| --- | --- | --- | --- |
| Lead | `reading-desk-cobalt` | 승인된 Visual Storyworld 시안의 새 article media | 차갑고 밝은 mineral desk와 cobalt bookmark가 승인된 새 visual world를 직접 만든다. 기존 warm `reading-desk-light`를 덮어쓰지 않고 새 provenance item으로 추가한다. |
| Support | `judgment-scale` | 같은 article의 figure | lead와 직접 연결된 시각 근거다. |
| Support | `블랙스완` text-only book object | published review metadata | 판단, 설명, 예측이라는 주제를 책이라는 다른 object type으로 확장한다. 표지 이미지는 사용하지 않는다. |
| Context | `요약은 결론을 주고, 독서는 그 결론까지 가는 시간을 준다.` | 같은 article의 published excerpt | source와 관계가 분명한 실제 문장을 text-only aperture로 보여준다. |
| Edge peek | `shared-reading-table` | 같은 article media | 같은 글의 다음 object가 있다는 사실만 보여준다. 별도 scene의 존재를 암시하지 않는다. |

기존 book cover는 현재 public review route에서 사용 중이더라도 rights warning이 남아 있으므로 이 slice에서 노출 면적을 확대하지 않는다. `블랙스완`은 title, author, verdict로 구성한 text-only object로 표현하며 실제 cover처럼 보이는 가상 jacket을 만들지 않는다.

## 3. 첫 viewport

### 승인된 desktop composition: Staged Aperture

2026-08-22 사용자는 세 개의 desktop composition 가운데 추천안 `Staged Aperture`를 승인했다. 구현은 lead object를 중앙에서 조금 오른쪽의 가장 큰 aperture로 두고, supporting object를 좌우와 아래 경계에서 일부만 보여 하나의 유한한 장면을 만든다.

같은 날 사용자는 이 구성을 390 × 844 mobile과 Continuity Zoom focus 상태로 번역한 최종 세트를 추가 승인했다. 최종 구현은 full-viewport initial slot 안에 양쪽 `15vw` 여백을 둔 `70vw` lead를 배치하고 `42svh` stage 위에 left judgment crop과 right text-only Black Swan aperture를 동시에 겹쳐 승인된 depth를 만든다. 이 두 edge 표현은 resolved public object에서만 파생한 비상호작용·`aria-hidden` echo이며 canonical id, href, action, 별도 사실을 갖지 않는다. native rail이 움직이면 사라지고 이후 탐색과 history는 다섯 canonical object만 담당한다.

승인 evidence는 [desktop](assets/public-atlas/public-atlas-desktop-approved.png), [mobile](assets/public-atlas/public-atlas-mobile-approved.png), [focus](assets/public-atlas/public-atlas-focus-approved.png)와 [provenance](assets/public-atlas/provenance.yml)를 tracked durable path에 고정한다. 로컬 `.impeccable/` 작업 파일은 이후 clone이나 판단의 유일한 근거로 사용하지 않는다.

승인 시안의 중심 이미지는 기존 `reading-desk-light.webp`와 다른 새 visual이다. 구현은 승인된 원본 PNG의 SHA-256 `aafdd214e2586dd5622aaa1c49d90d5b84dd6b5223a5500d915248a62327ca56`를 확인하고 `reading-desk-cobalt`라는 새 media item으로 승격한다. 기존 asset을 교체하거나 승인 시안과 다른 warm 이미지를 lead로 사용하지 않는다.

### Desktop: 1440 x 900 기준

- 52px 상단 navigation: `beyondwin · 장면 · 글 · 책 · 찾기`.
- stage는 남은 viewport를 차지하고 배경은 neutral daylight field다.
- lead media CSS는 `min(61vw, 940px)` × `min(67vh, 670px)`로 중앙에서 조금 오른쪽에 둔다. 1440 × 900 browser evidence는 878.390625 × 603이었으며 이 pixel 값은 해당 viewport 측정치다.
- 왼쪽 viewport edge에는 context object 일부가 보인다.
- 오른쪽 뒤에는 세로 비율의 book 또는 supporting figure가 lead보다 작게 보인다.
- 아래 가까운 위치에는 승인된 public sentence를 text-only aperture로 둔다.
- `shared-reading-table`은 반대편 edge에 약 15%만 보여 같은 장면 안의 추가 object를 암시한다.
- 좌하단에는 scene label, title, `에세이 · 2026.08.16`만 표시한다.
- 우하단에는 명시적인 `전체 보기` control만 둔다. 존재하지 않는 scene count를 만들지 않는다.

동시에 같은 크기의 object를 10개 이상 보여주지 않는다. Lead 1개, support/context 2–4개 규칙을 지켜 masonry와 moodboard가 되지 않게 한다.

### Mobile: 390 x 844 기준

- first lead는 양쪽 `15vw` 여백을 둔 `70vw`이고 뒤 `15vw` 간격까지 합쳐 initial slot 전체가 정확히 한 viewport를 차지한다. support/context/hint stop은 `72vw`, stage는 `42svh`를 사용한다.
- initial frame은 lead와 동시에 lower-left judgment crop, lower-right Black Swan text aperture를 보여준다. canonical rail을 6px보다 많이 움직이면 inert edge echo를 숨겨 실제 stop과 중복되지 않게 한다.
- 제목과 metadata는 media 아래 또는 안전한 빈 공간에 놓고 image 위에 gradient를 덮지 않는다.
- 좌우 swipe는 native horizontal scroll와 `scroll-snap`으로 같은 scene object 사이를 이동하고, tap은 focus, 명시적 `읽기` control은 article route로 진입한다.
- focus 안에는 항상 보이는 `전체 보기` button이 있다. pinch gesture는 현재 구현하지 않는다.

## 4. Signature interaction: Continuity Zoom

선택한 object는 별도 modal이 갑자기 뜨는 방식이 아니라 현재 geometry에서 viewport focus로 이동한다.

1. 사용자가 canonical object anchor를 pointer 또는 keyboard Enter로 선택한다.
2. 선택 object는 480ms View Transition 또는 FLIP 경로로 focus geometry에 이동한다.
3. 나머지 object는 아래로 이동하면서 opacity 0으로 전환된다.
4. focus panel의 type field는 visible text가 아니라 3px marker다. visible information order는 title, 실제 authored article excerpt, `읽기`, `전체 보기`, relation/source provenance다. panel은 480ms motion의 336ms 지점에 reveal을 시작해 144ms에 완료한다. native View Transition은 named panel pseudo-element, FLIP fallback은 live panel opacity로 같은 timing을 구현한다.
5. focus 상태에서 `읽기`를 선택하면 기존 stable article/review route로 이동한다.
6. browser back, `Esc`, `전체 보기` 중 하나로 돌아올 때 geometry transition은 360ms이고 scene의 이전 native viewport position, selected object, keyboard focus를 복원한다.

동일한 pending 또는 active object activation은 focus request guard가 거부한다. 첫 Enter가 한 shareable focus history entry를 만든 뒤 rapid repeat Enter/double activation은 추가 entry를 만들지 않으며 한 번의 Escape로 원래 overview와 keyboard focus에 돌아온다.

구현은 server-rendered DOM과 progressive enhancement를 기본으로 한다. View Transition API가 있으면 shared-element transition을 사용하고, 지원하지 않으면 FLIP-style transform으로 같은 구조를 제공한다. JavaScript가 없으면 모든 object는 기존 content route로 이동하는 정상 링크다.

`prefers-reduced-motion: reduce`에서는 geometry animation을 생략하고 즉시 focus state로 전환한다. 복귀 시 원래 object에 visible focus outline을 준다.

## 5. Object preview와 신뢰 정보

Focus preview는 기술 schema가 아니라 사람이 이해하는 정보만 보여준다.

- 현재 scene resolver의 object type: 그림, 책, 문장. `source`는 object type이 아니다.
- title, description, relation reason, source owner.
- media/content 검증일. author approval은 resolver 입력 조건이며 별도 status badge로 표시하지 않는다.
- relation reason: `이 글이 직접 다룬 책`, `같은 글에 포함된 그림`, `이 글을 근거로 남긴 문장`.
- 원문 또는 stable public route.

금지한다.

- node, edge, graph, embedding, similarity score.
- AI badge를 모든 object에 반복 표시하는 것.
- dashboard count, source inspector, developer status panel.
- hover에서만 접근 가능한 필수 정보.

AI 또는 visual similarity candidate는 이 vertical slice의 public scene에 포함하지 않는다. 후속 단계에서 사용하더라도 `시각적으로 유사한 제안`처럼 authored relation과 분리해 표시한다.

## 6. Scene data contract

첫 slice는 자동 graph layout 대신 versioned authored scene definition을 사용한다. Scene definition은 public selector가 반환한 published object만 참조한다.

```ts
type PublicSceneDefinition = {
  id: string;
  slug: string;
  title: string;
  atmosphere: string;
  lead: PublicSceneObjectRef;
  support: PublicSceneObjectRef[];
  context: PublicSceneObjectRef[];
  approvedAt: string;
  approvedBy: 'author';
  version: number;
};

type PublicSceneObjectRef = {
  id: string;
  kind: 'article-media' | 'article-excerpt' | 'review' | 'memory-thought';
  collection?: 'articles' | 'reviews';
  slug: string;
  mediaId?: string;
  text?: string;
  relationReason: string;
  role: 'lead' | 'support' | 'context' | 'hint';
};
```

Scene resolver는 다음을 거부한다.

- unpublished, draft, archived content.
- public projection에 없는 memory thought.
- manifest에 없거나 provenance가 유효하지 않은 media.
- author approval과 relation reason이 없는 object.
- 같은 scene 안에서 중복된 canonical object reference.

Private data나 top-level `memory/**`는 public scene resolver에서 읽지 않는다.

## 7. URL, history, focus restoration

- `/`는 첫 scene overview를 server-render한다.
- focus state는 history state와 share 가능한 query `?focus=<object-id>`로 표현한다.
- artifact의 canonical URL은 기존 `/articles/[slug]/`, `/reviews/[slug]/`, `/memory/[slug]/`를 유지한다.
- focus history entry는 `publicSceneFocus`와 `publicSceneScrollLeft`만 저장한다. 현재 scene id는 history에 넣지 않으며 유일한 `/` authored definition에서 정해진다.
- read route에서 browser back으로 돌아오면 focus object와 native viewport position을 복원한다.
- mobile viewport position은 `publicSceneScrollLeft`로 저장하고 overview geometry mutation 뒤 복원한다. keyboard focus는 `preventScroll`로 돌려준다.
- 잘못된 focus id는 오류 화면을 만들지 않고 overview로 안전하게 되돌린다.
- direct focus URL은 server-rendered overview와 page title을 먼저 제공하고 hydration 뒤 focus state를 적용한다. Static Astro build에서 query별 metadata를 제공한다고 가장하지 않는다.

향후 여러 scene의 canonical route는 별도 결정으로 남긴다. 첫 slice에서 `/scenes/` content lane을 추가하지 않는다.

## 8. Visual system

UI보다 실제 media가 색을 담당한다.

- base light: `#F2F4F7`.
- reading white: `#FFFFFF`.
- ink: `#151619`.
- selection: `#2B63E8`.

`#101114` night token은 현재 read-action hover color mix에만 쓰이며 media-dependent night focus mode는 없다. `#14765A` approval token도 정의되어 있지만 이 slice가 status UI로 렌더링하지 않는다. atmosphere는 authored scene의 현재 `#F2F4F7` field를 적용할 뿐 scene 간 transition은 없다. media-dependent night focus, atmosphere transition, private warning palette는 승인 가능한 future intent이지 shipped contract가 아니다.

Scene마다 lead media에서 고른 atmosphere color 하나만 넓은 field로 사용할 수 있다. 자동 gradient, glass, card shadow, paper grain, sticker, decorative particle은 사용하지 않는다.

Typography는 이미지보다 앞서지 않는 정밀한 sans를 쓴다. 새 font dependency나 remote font를 추가하기 전에 license와 bundle strategy를 별도로 검토한다. 첫 slice는 현재 local/system sans stack으로 구현하고, display text는 40px를 넘기지 않는다.

## 9. Motion grammar

| 동작 | 시간 | 성격 |
| --- | --- | --- |
| object focus | 480ms | View Transition 또는 FLIP shared geometry, decelerating |
| scene return | 360ms | direct, no bounce |
| surrounding objects | 240ms | transform/opacity coordinated move |
| focus panel | 336ms delay + 144ms reveal | geometry motion의 70% 지점 이후 나타난다. native pseudo-element와 FLIP live opacity를 모두 검증했다. |

금지: idle parallax, cursor following, autoplay camera, scroll-jacking, 3D rotation, particles, bounce, continuous animation.

기존 승인 intent의 320–380ms atmosphere transition과 120–160ms hover/focus response grammar는 현재 구현하지 않았다. hover image contrast와 visible focus outline은 존재하지만 그 intent의 timing으로 구현·측정되었다고 주장하지 않는다.

## 10. Accessibility, performance, SEO

- Scene object는 semantic link/button이며 keyboard 순서가 visual reading order와 일치한다.
- focus state가 열리면 screen reader label이 현재 object와 가능한 행동을 알린다.
- close/back 후 focus는 선택했던 object로 돌아온다.
- text와 control은 WCAG AA contrast를 지킨다.
- media는 manifest width/height를 사용해 layout shift를 막는다.
- lead media만 eager load하고 support는 viewport proximity에 따라 load한다.
- server-rendered title, description, canonical link를 유지한다.
- initial scene은 WebGL 없이 HTML, CSS transform, 최소 JavaScript로 구현한다.
- animation은 transform과 opacity 중심이며 long task와 layout thrashing을 허용하지 않는다.

## 11. 오류와 fallback

- lead object가 resolve되지 않으면 build/validation을 실패시킨다.
- optional support/context가 resolve되지 않으면 resolver가 object id와 이유가 있는 structured issue를 반환하고 `src/pages/index.astro`가 build-time `console.warn`으로 출력한다. 별도 validation report는 없다.
- JavaScript failure에서는 static scene의 모든 object가 canonical route link로 동작한다.
- unsupported motion API에서는 즉시 전환 또는 FLIP fallback을 사용한다.
- image load failure에서는 alt와 object title이 같은 geometry 안에 보인다.
- required lead가 resolve되지 않으면 resolver/build가 실패한다. 이 slice에는 generic empty-scene placeholder나 별도 home fallback이 없다.

## 12. 검증 기준

### Automated

- scene definition schema와 unique object validation.
- published/draft eligibility와 memory projection boundary.
- invalid media id, missing provenance, invalid focus query fallback.
- interaction state reducer의 overview/focus/read/return transition.
- `npm run validate` 전체 gate.

### Real browser — 2026-08-22 통과

- 독립 standalone Playwright context에서 1440 × 900 desktop과 390 × 844 mobile을 검증했다.
- 1440 × 900 overview lead는 878.390625 × 603이다. 390 × 844 first lead는 x `58.5`, width `273`(`70vw`), height `354.4765625`이며 inert edge apertures는 judgment `109.1953125px`, Black Swan `89.6953125px` 폭으로 측정했다. 426 × 923에서는 lead x `63.8984375`, width `298.1953125`(약 `70vw`), height `387.65625`, judgment `119.2734375px`, Black Swan `97.9765625px`다. 360px fallback에서도 lead x `54`, width `252`(`70vw`)이고 document width는 `360/360`이다. 이 pixel 값은 해당 viewport evidence이며 breakpoint 전체의 invariant가 아니다.
- authored keyboard tab order, 2px visible focus, native mobile swipe-equivalent travel, browser back, Escape, `전체 보기`, focused URL refresh를 통과했다.
- support-object exact continuity는 judgment `349.5 → 349.5` (`x 54.5 → 54.5`), black-swan `644 → 644` (`x 54.796875 → 54.796875`)이며 promoted acceptance gate다.
- repeat Enter/rapid activation은 history length를 `2 → 3` 한 번만 늘렸고 한 번의 Escape로 overview에 복귀했다. native panel opacity는 `0 / 0 / 0.568273 / 1`, FLIP은 `0 / 0 / 0.486096 / 1`로 early/180ms/360ms/520ms에 측정했다.
- reduced motion은 Web Animation/View Transition 0회, long Korean title은 4줄로 media와 겹침 없이 표시되었다.
- JavaScript-disabled canonical navigation과 forced cobalt image failure geometry를 별도 browser context에서 통과했다.
- 정상 desktop/mobile console은 error와 warning 0개였고 document width는 각각 1440/1440, 390/390이었다.

### Experience acceptance

- 첫 5초에 실제 글과 책이 보이고 knowledge graph나 developer tool로 읽히지 않는다.
- lead object와 다음 행동이 설명문 없이 구분된다.
- object 선택, 읽기, 복귀가 하나의 연속된 journey로 느껴진다.
- provenance는 찾을 수 있지만 첫 화면을 지배하지 않는다.
- mobile에서 static list로 퇴행하지 않는다.

## 13. 구현 결과

1. `judgmentScene.ts`에 author-approved `판단` definition과 dependency 조립을, `publicScene.ts`에 definition/ref type, public resolver, view model, issue contract를 test-first로 구현했다.
2. `/`에 server-rendered overview와 no-JS canonical link fallback을 구현했다.
3. `sceneState.ts`와 `PublicScene.astro`에 Continuity Zoom state, idempotent focus request, focus query, history와 exact viewport restoration을 구현했다.
4. `storyworld.css`에 desktop Staged Aperture, mobile native snap composition과 initial edge apertures, staged panel reveal을 구현했다.
5. reduced motion, keyboard, invalid focus, image failure 상태를 검증했다.
6. standalone real-browser matrix와 finish review를 통과했다.
7. built truth를 `PRODUCT.md`, `DESIGN.md`, architecture reference, ADR-0004와 이 문서에 반영했다.

이 문서는 구현되지 않은 private authoring surface, resurfacing system, retrieval/graph backend의 존재를 주장하지 않는다. 그런 기능은 이 vertical slice와 별도 결정·spec·구현이 필요하다.

## 14. 참고한 제품 원칙

- [Cosmos Explore](https://www.cosmos.so/explore): image-first discovery와 object detail provenance.
- [mymind](https://mymind.com/): hidden enrichment와 slow serendipity.
- [Allume](https://allume.com/): bounded nesting과 content-only mode.
- [Are.na](https://www.are.na/): one canonical block, many human contexts.
- [Arc Peek](https://resources.arc.net/hc/en-us/articles/19335302900887-Peek-Preview-Sites-From-Pinned-Tabs): context-preserving preview.
- [Milanote Presentation Mode](https://help.milanote.com/en/articles/6815489-presentation-mode): private composition과 public presentation의 구분.

이 제품들의 layout이나 brand를 복제하지 않는다. Interaction 원칙을 beyondwin의 실제 content, explicit approval, public projection boundary에 맞게 번역한다.
