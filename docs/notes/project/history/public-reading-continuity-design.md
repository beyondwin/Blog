# Public reading continuity 상세 설계

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](README.md)과 ADR을 본다.

- Status: approved React public-site target, not implemented
- Approved: 2026-08-23
- Decision: [ADR-0006](../adr/0006-unified-public-reading-continuity.md)
- Related decisions: [ADR-0002](../adr/0002-consumer-grade-visual-experience.md), [ADR-0003](../adr/0003-visual-storyworld-experience-model.md), [ADR-0004](../adr/0004-staged-aperture-public-composition.md), [ADR-0005](../adr/0005-node-react-modular-monolith.md)

## 1. Purpose

Public home의 표현적인 Storyworld에서 list, search, detail의 조용한 reading surface까지 하나의 visual·navigation language로 연결한다. 모든 route를 같은 composition으로 만들지 않고 탐색과 독서의 역할을 분리한다.

완료된 experience는 다음 질문에 항상 답한다.

1. 지금 보고 있는 object나 record는 무엇인가.
2. 읽기 전에 살펴보는 것인지, canonical content를 읽는 것인지.
3. 어디에서 들어왔고 어떻게 그 위치로 돌아가는지.
4. 읽은 뒤 어떤 승인된 관계를 따라갈 수 있는지.

현재 Astro implementation은 이 설계를 아직 충족하지 않는다. `/`는 `storyworld.css`, reading route는 `press.css`를 사용한다. Astro는 migration parity와 rollback baseline으로만 유지하며 새 reading world를 구현하지 않는다. 이 문서는 public renderer gate에서 선택된 React `apps/site`의 approved target이고, React cutover 후 `DESIGN.md`가 built truth로 갱신돼야 한다.

## 2. Scope

### Included routes

| Surface | Routes | Required change |
| --- | --- | --- |
| Scene | `/` overview and focus | CTA wording, reading-origin handoff, shared chrome contract |
| Writing | `/articles/`, `/articles/[slug]/` | unified reading shell, threshold, return, continuation |
| Books | `/reviews/`, `/reviews/[slug]/` | unified reading shell, material-preserving detail, return, continuation |
| Search | `/search/` | unified shell, query/result return context |
| Memory | `/memory/`, `/memory/[slug]/` | unified shell, text-first threshold and continuation |
| Secondary lanes | `/analysis/`, `/ideas/`, `/travel/` and detail routes | shared shell and navigation grammar without lane redesign |
| Tags | `/tags/`, `/tags/[tag]/` | shared shell and contextual return |

### Included migration work

- Current Astro route, metadata, content, media, no-JS, accessibility, reduced-motion, exact-return parity manifest.
- Next.js App Router와 React Router Framework Mode의 behavior-parity decision slice.
- Gate에서 선택된 React renderer의 redesigned public vertical slice.
- 선택된 renderer의 full public route expansion, shadow verification, cutover, rollback evidence.
- Observation window 이후 Astro dependency, config, route, component 제거.

### Excluded

- Private Studio, Fastify API, PostgreSQL, worker 같은 private/backend runtime 구현.
- Private Studio, RAG, graph persistence, retrieval ranking.
- New content lane, automatic scene assembly, AI-generated relation reason.
- React renderer, framework-neutral content build, parity measurement, browser testing과 무관한 새 dependency.
- Content publication, deletion, or memory promotion.
- Arbitrary external return URL.

## 3. Experience architecture

```text
scene / list / search
        ↓
inspect or read an explicit record
        ↓
one continuity threshold
        ↓
quiet reading surface
        ↓
up to three approved relations
        ↓
contextual return or safe collection fallback
```

### Route grammar

| Current position | Primary action | Secondary action | Return contract |
| --- | --- | --- | --- |
| Scene overview | `글 읽기` or `책 읽기` | `살펴보기` | n/a |
| Scene focus | `글 읽기` or `책 읽기` | `장면으로 돌아가기` | exact scene object and rail viewport |
| Collection list | Open record | n/a | same list position or record anchor |
| Search result | Open record | n/a | same query and result anchor |
| Detail top | Read | contextual return | origin or collection fallback |
| Detail bottom | `이어서 읽기` relation | `글 전체 보기` or `책 전체 보기` | browser Back remains intact |

`전체 보기`를 focus entry와 scene return 양쪽에 사용하지 않는다. Action text는 항상 destination을 설명한다.

## 4. Visual system

### Shared tokens and chrome

- Ground: mineral daylight `#F2F4F7`.
- Reading surface: optical white `#FFFFFF`.
- Ink: rich near-black `#151619`.
- Interaction and visible focus: cobalt `#2B63E8`.
- Typography: existing Korean/Latin sans stack. Literary serif, display Inter, decorative type를 도입하지 않는다.
- Header: mark-less `beyondwin`, `장면 · 글 · 책 · 찾기`, 동일한 active/focus rule.
- Mobile: 모든 route가 44px menu control, Escape, outside click, selection dismissal, focus restoration을 공유한다.

### Scene mode

- Current Staged Aperture geometry, bounded object count, real media, native mobile snap을 유지한다.
- Content object가 공간을 만들며 일반 card grid, masonry, carousel로 바꾸지 않는다.
- Continuity Zoom과 reduced-motion fallback을 유지한다.

### Reading mode

- Gray booth를 mineral field로 교체하고 white reading folio는 shadow 없는 quiet surface로 둔다.
- `+` brand mark, crop marks, CMYK production bar를 제거한다.
- Cobalt는 threshold marker, action, selection, focus에만 사용한다.
- Long-form body는 약 42em, desktop 17px/1.9, mobile 16px을 유지한다.
- Review cover만 real object shadow를 사용할 수 있다.
- Article, memory, search에 media placeholder나 decorative image를 추가하지 않는다.

### Continuity threshold

Detail 상단은 선택한 record identity를 한 번 이어 주는 작은 boundary다.

- Contextual return.
- Optional object thumbnail or cover.
- Title or short identity line.
- 3px cobalt marker.

Threshold는 second hero가 아니며 prose가 시작되면 시각적 주도권을 내려놓는다. Media가 없는 record는 text-only layout을 사용한다.

## 5. Component boundaries

구현 시 정확한 파일 이름은 renderer gate에서 선택된 React framework의 구조에 맞추되 아래 interface를 유지한다. Current Astro component와 stylesheet는 baseline evidence이며 이 redesign의 edit target이 아니다.

### Shared surface mode

선택된 `apps/site`의 shared public layout은 `scene` 또는 `reading` mode를 받는다. Header, footer, tokens, theme color는 mode-aware shared React contract에서 결정한다. 이 contract를 Astro `BaseLayout`에 새로 backport하지 않는다.

### ReadingThreshold

Responsibilities:

- Origin label과 safe return href 렌더링.
- Record kind, title, optional resolved media, cobalt marker 렌더링.
- Client-side validated origin으로 server-rendered collection fallback을 upgrade.

Dependencies:

- Public record presentation model.
- Already-resolved media. Asset path나 manifest를 직접 해석하지 않는다.
- Validated navigation origin.

### ContextReturn

Allowed labels:

- `장면으로 돌아가기`
- `글 목록으로`
- `책 목록으로`
- `“<query>” 결과로`
- Secondary lane의 명시적 collection label

It never accepts a display label or external href directly from query parameters.

### ContinueReading

Input은 `{ href, title, reason, kind }`의 public presentation item 최대 세 개다.

- Explicit authored relation을 우선한다.
- Public memory의 exact source relation을 사용할 수 있다.
- Reason이 없거나 destination이 public이 아니면 제외한다.
- Automatic recent-item fill이나 synthetic reason을 만들지 않는다.

### Navigation context helper

Framework-neutral logical type:

```ts
type ReadingOrigin =
  | { kind: 'scene'; focusId: string }
  | { kind: 'articles'; anchorId: string }
  | { kind: 'reviews'; anchorId: string }
  | { kind: 'search'; query: string; anchorId: string }
  | { kind: 'analysis' | 'ideas' | 'travel' | 'tags'; anchorId?: string };
```

Parser는 allowlisted kind, bounded query length, safe internal ID만 허용한다. 임의 return path나 URL은 type에 존재하지 않는다.

## 6. Navigation context data flow

### Base behavior

- 모든 record anchor의 HTML `href`는 clean canonical content path다.
- Modified click, new tab, download, external destination, JavaScript-disabled navigation을 가로채지 않는다.
- No-JS detail은 server-rendered collection fallback을 보여준다.

### Same-tab progressive enhancement

1. Unmodified internal record click을 확인한다.
2. Current route에서 allowlisted `ReadingOrigin`을 만든다.
3. Destination URL에 bounded temporary context parameters를 붙여 normal document navigation을 수행한다.
4. Detail bootstrap이 parameters를 validate하고 current history entry의 namespaced state에 저장한다.
5. Address bar는 `history.replaceState`로 clean canonical path로 정규화한다. Canonical metadata도 계속 clean path를 가리킨다.
6. Matching same-tab predecessor가 있으면 ContextReturn은 `history.back()`을 사용한다. 그렇지 않으면 validated safe fallback href로 이동한다.

Temporary transport는 arbitrary URL을 포함하지 않는다. Context state는 다른 detail로 자동 전파하지 않는다.

### Safe fallback hrefs

| Origin | History fallback |
| --- | --- |
| Scene | `/?focus=<validated-id>` |
| Article list | `/articles/#<validated-record-anchor>` |
| Review list | `/reviews/#<validated-record-anchor>` |
| Search | `/search/?q=<encoded-query>#<validated-result-anchor>` |
| Secondary lane | allowlisted collection index and optional safe anchor |
| Missing or invalid | current record's collection index |

Browser Back이 가능한 경우 기존 exact scroll restoration을 우선한다. Explicit href는 direct/copy/refresh path에서 쓸 recovery route다.

## 7. Error and empty behavior

| Condition | Behavior |
| --- | --- |
| Unknown origin kind | Ignore context; use collection fallback |
| Invalid focus or anchor ID | Ignore ID; use overview or collection index |
| Missing session predecessor | Follow safe fallback href |
| Stale search anchor | Restore query; do not force scroll |
| Search now returns no result | Show normal search empty state |
| Missing media | Render text-only threshold |
| Missing relation reason | Omit continuation item |
| Fewer than three relations | Show fewer; do not auto-fill |
| Non-public destination | Omit item through publication selector |
| JavaScript disabled | Canonical read and collection fallback remain usable |

## 8. Accessibility and responsive behavior

- Header and footer keep labeled navigation landmarks and `aria-current`.
- Mobile menu uses a semantic control, exposes open state, closes on Escape, outside click, and selected navigation, then restores focus.
- ContextReturn receives visible focus and an accessible destination name.
- Continuity threshold media uses existing resolved alt text. Decorative marker is hidden from assistive technology.
- Reduced motion starts no geometry or page transition animation.
- 360px fallback, 390px, 426px, long Korean/English title, browser zoom, no-media record must not overflow.

## 9. Verification contract

### Focused tests

- Navigation-origin parse, validation, normalization, safe fallback.
- Clean base href and canonical path.
- Modified/new-tab/no-JS behavior.
- Origin-specific labels and fallback.
- Text-only threshold.
- ContinueReading public/reason/cap rules.
- Shared chrome and active navigation on every public route family.
- Publication and private-memory boundaries.

### Browser matrix

At desktop and 390/426px mobile:

1. Scene overview → inspect → read → exact scene return.
2. Article list → detail → list position return.
3. Review list → detail → list position return.
4. Search query → result → detail → same query/result return.
5. Direct detail → collection fallback.
6. Modified click and new tab → clean canonical detail.
7. JavaScript-disabled scene object → canonical detail.
8. Mobile menu dismissal and focus restoration.
9. Long title, missing media, no relation, stale anchor.
10. Visible keyboard focus, reduced motion, no viewport overflow, clean console.

### Migration sequence

1. **Astro baseline:** current output에서 route/content/media/browser parity manifest를 고정한다.
2. **Renderer decision slice:** `/`, article detail, review detail, memory detail의 current behavior를 Next.js와 React Router에 동일하게 shadow 구현해 renderer를 선택한다. 이 단계에서 visual redesign을 두 spike에 중복 구현하지 않는다.
3. **Selected-renderer design slice:** 선택된 React renderer에서 scene CTA, shared shell, ReadingThreshold, ContextReturn, ContinueReading을 RED/GREEN으로 구현한다.
4. **Public route expansion:** list, detail, search, memory, tags, secondary lane을 같은 contract로 이동한다.
5. **Shadow and cutover:** Astro와 React output을 route, metadata, public data, screenshot, accessibility, performance로 비교하고 reverse-proxy cutover와 rollback을 검증한다.
6. **Astro removal:** public release, rollback, clean-host restore, observation window가 통과한 뒤 Astro dependency, config, `.astro` route/component를 제거한다.

### Final gates

- Focused RED/GREEN tests.
- Root workspace의 agent/document check와 selected React renderer의 strict validation gate.
- Astro baseline inventory와 selected React output의 contract parity check.
- `git diff --check`.
- Desktop/mobile browser evidence for affected representative routes.
- Final diff review for unrelated files and generated artifacts.
- Related accepted ADRs and `DESIGN.md` match shipped built truth.

## 10. Implementation handoff

Implementation planning starts only after this corrected written design is reviewed and approved. The plan must preserve current dirty work, pin only the approved renderer/content/parity-testing dependencies, extract the parity contract before UI work, choose the public React renderer through the approved comparison gate, implement the redesign only in the selected renderer, and finish with Astro cutover and removal evidence. No new reading-world UI work is added to Astro.
