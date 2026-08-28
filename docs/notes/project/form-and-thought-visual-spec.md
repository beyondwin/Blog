# FORM & THOUGHT 시각 스펙

- 상태: approved target, implementation pending
- 승인일: 2026-08-28
- 결정: [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md)
- reference inventory: [manifest.yml](assets/form-and-thought-reference/manifest.yml)

## 1. 권한과 해석 규칙

구현 중 충돌은 다음 순서로 해결한다.

1. ADR-0007에 기록된 직접 사용자 override.
2. manifest에서 해당 route/state에 지정된 primary reference 또는 primary region.
3. 이 문서의 route geometry, responsive matrix, component state.
4. 공통 token과 구현 세부.
5. secondary consistency board.

따라서 생각 목록의 `실제 한 건 + 완전히 빈 다섯 칸`은 여섯 칸 모두 문구가 있는 reference보다 우선한다. 반대로 reference에 분명한 home inverse header, outer paper shell, page-level elevation은 generic inner-page 규칙으로 지우지 않는다. 레퍼런스 속 가상 문구, 사람, 날짜와 이미지는 복사하지 않고 실제 공개 콘텐츠와 승인 media로 대체한다.

Reference bitmap 크기는 CSS viewport가 아니다. 첫 구현 전에 page-shell crop, 비교 CSS viewport, DPR, browser/font 환경을 calibration artifact에 기록한 뒤 동일 조건에서 screenshot을 비교한다. 이 calibration은 layout을 재해석하는 절차가 아니다.

## 2. 시각 언어와 예외

- viewport는 따뜻한 canvas, 그 위에 off-white paper shell을 둔다.
- 핵심 대비는 ink black, terracotta, deep brown, paper white가 만든다.
- 이미지는 건축적 면, 자연광, 깊은 그림자, 절제된 정물로 구성한다.
- inner editorial card와 row는 얇은 rule과 간격만 사용하고 floating shadow를 쓰지 않는다.
- outer paper shell에만 reference와 같은 낮고 넓은 diffuse shadow와 0–8px radius를 허용한다.
- inner card는 직각이다. 입력과 keyword chip만 6–12px radius를 허용한다.
- texture는 저대비 paper grain만 허용하며 읽기 선명도나 screenshot 안정성을 낮추면 제거한다.

## 3. Color tokens와 허용 조합

| token | value | use |
| --- | --- | --- |
| `--ft-canvas` | `#E8E1D8` | viewport 바깥 여백 |
| `--ft-paper` | `#F2EFE9` | 주 지면 |
| `--ft-paper-bright` | `#F7F3ED` | 밝은 본문 지면 |
| `--ft-ink` | `#11100F` | 제목, 본문, black field |
| `--ft-ink-soft` | `#5E554E` | paper 위 설명과 metadata |
| `--ft-rule` | `#D3C9BF` | 1px divider |
| `--ft-terracotta` | `#AF6047` | 큰 hero와 image plane |
| `--ft-terracotta-dark` | `#7D3F30` | paper 위 terracotta text, 깊은 면 |
| `--ft-brown` | `#241712` | dark image/field |
| `--ft-blush` | `#DDB4A5` | 제한된 보조 이미지 면 |
| `--ft-on-terracotta` | `#FFFFFF` | terracotta 위 normal text |

허용 foreground/background는 다음과 같다.

| background | normal text | large display only | 금지 |
| --- | --- | --- | --- |
| paper / paper-bright | ink, ink-soft, terracotta-dark | terracotta | base terracotta의 작은 본문 |
| ink / brown | paper-bright, white | paper | soft gray |
| terracotta | white | paper-bright, ink | paper 또는 ink의 작은 본문 |

`#AF6047` 위 paper/ink 조합은 normal-text AA에 미달하므로 작은 metadata에는 쓰지 않는다. 모든 최종 token pair, focus ring, disabled label은 실제 computed color로 WCAG 2.2 AA를 다시 측정한다. disabled icon도 의미를 식별할 수 있어야 하며 opacity만으로 상태를 표현하지 않는다.

## 4. Typography gate

| role | required character | desktop target | mobile target |
| --- | --- | --- | --- |
| Latin wordmark | 높은 stroke contrast editorial serif, 두 줄 | 22–26px / 0.9 | 18–21px / 0.9 |
| Korean display | 획 대비 명조, 긴 제목도 안정된 wrap | 48–72px / 1.16 | 36–48px / 1.2 |
| Korean body | 읽기용 명조 | 17–18px / 1.85–1.95 | 16–17px / 1.8–1.9 |
| Korean UI/meta | 중립 고딕, 날짜 tabular numeral | 14–16px / 1.5 | 14–16px / 1.5 |

글꼴은 아직 구현 완료 값이 아니다. 후보 contact sheet 승인 뒤 다음을 기록해야 한다.

- self-hosted file, official source, license, checksum, weight와 fallback.
- wordmark box가 primary reference의 폭과 두 줄 높이에서 ±4% 이내인지.
- 대표 한글 title의 지정 너비 줄바꿈이 reference와 한 줄 이상 달라지지 않는지.
- body 40–46자 measure에서 faux bold, glyph collision, FOIT가 없는지.
- `font-display`, subset, preload 여부와 전체 font byte budget.

승인 전에는 package나 remote font를 built truth로 확정하지 않는다.

## 5. Global geometry

| item | wide | intermediate | mobile |
| --- | --- | --- | --- |
| viewport canvas | outer inset 32–56px | 16–32px | 0–12px |
| page shell | max 1280px centered | full available width | full width |
| inner header | 96–112px | 84–96px | 68–76px |
| content side inset | 48–64px | 32–48px | 20–24px |
| primary vertical gap | 56–80px | 44–64px | 36–48px |
| reading measure | 38–46 Korean chars | 34–42 | 27–34 |
| interactive minimum | 44×44px | 44×44px | 44×44px |

Breakpoints는 `>=1180px`, `768–1179px`, `<768px`을 기본으로 하되 320px와 200% zoom에서 horizontal page scroll이 생기지 않아야 한다. code/table만 자체 horizontal scroll과 label을 가질 수 있다.

## 6. Header와 navigation

### Home

`reference-05-home`처럼 header를 black/terracotta hero 안에 통합하고 wordmark, tabs, menu를 white로 반전한다. 별도 off-white band를 만들지 않는다. header와 hero는 하나의 dark composition이지만 DOM에는 landmark header와 main이 분리된다.

### Inner routes

off-white paper field 안에 두 줄 wordmark와 `서평 · 아티클 · 생각 · 검색 · hamburger`를 둔다. current tab은 font weight와 짧은 underline을 함께 사용하고 `aria-current="page"`를 제공한다.

Desktop에도 reference대로 네 tab과 hamburger를 모두 보인다. hamburger는 같은 네 primary destination만 보여 주며 새로운 secondary item을 발명하지 않는다. Home은 wordmark link로 진입한다. mobile에서는 wordmark와 hamburger만 보이되 SSR/no-JS fallback에서 네 canonical anchor를 계속 접근할 수 있어야 한다.

Desktop menu는 non-modal popover로 focus trap을 쓰지 않는다. Mobile menu는 modal drawer로 최초 focus, Tab/Shift+Tab containment, background inert, Escape/outside close, trigger focus restore를 제공한다.

## 7. Route geometry

### Home `/`

- Primary: `reference-05-home`; `reference-07` home frame은 tone consistency만 보조한다.
- inverse header + hero 전체는 첫 큰 dark block이다.
- hero split은 text 43–48%, image 52–57%, 전체 약 16:8.5다.
- hero 아래 32–44px에 서평·아티클·생각 세 pick을 동일 폭으로 둔다.
- 정확히 세 pick을 유지하기 위해 release에는 lane별 published selection 한 건이 반드시 있어야 한다. 없으면 build가 실패하며 fake card나 2열 reflow를 만들지 않는다.
- hero article과 article pick은 가능한 한 서로 다른 fixed editorial ID를 사용한다.
- hero CTA는 실제 고정 글을 가리키므로 `이 글 읽기` 또는 `아티클 읽기`다. 날짜 정렬이 아닌 경우 `최근`이라고 쓰지 않는다.

### Article index `/articles/`

- Primary: `reference-04-article-index`.
- title/description, rule, six topic filter, ledger row 순서다.
- row는 desktop 210–250px, image 34–39%, text 43–49%, date remainder다.
- 17개 실제 항목을 pagination 없이 한 editorial ledger에 모두 렌더한다. reference의 3–4행은 first-frame density 기준이지 corpus 제한이 아니다.
- 첫 viewport에는 title/filter와 2개 이상 row의 주요 내용이 보여야 한다. 첫 media만 필요 시 eager, 나머지는 lazy다.
- filter는 GET query와 canonical anchor로 동작하며 invalid value는 `전체`로 정규화한다.

### Review index `/reviews/`

- Primary: `reference-06`의 `review-index-left` region.
- article과 같은 ledger rhythm을 쓰되 real cover는 landscape stage 중앙에서 `object-fit: contain`한다.
- reference의 가상 landscape image 대신 실제 portrait cover를 쓰는 것은 data-truth exception이다.
- cover stage 배경, 최대 높이, 중심선은 고정하고 cover 자체 shadow는 0–12px blur 한 단계만 허용한다.
- `verified`는 판본/media identity 확인이지 redistribution rights 승인이 아니다. redistribution rights가 승인되지 않은 표지는 bytes를 public artifact에서 제외하고 text-led row로 렌더한다.
- 18개 실제 항목을 pagination 없이 모두 렌더하고 cover hold는 text-led row로 둔다.

### Thought index `/thoughts/`

- Primary: `reference-02-thought-index`; content는 사용자 override.
- wide grid는 3열 × 2행, 전체가 near-square(참조 frame에서 약 1.0–1.1:1)이며 각 cell은 tall portrait다. 기존 `2.2:1` 값은 사용하지 않는다.
- cell 1만 `AI 시대에, 나는 왜 책을 읽는가` canonical link다.
- cell 2–6은 text, image, icon, skeleton, accessible name, focus target이 전혀 없는 layout element다.
- intermediate는 2열 × 3행으로 같은 six area를 유지한다.
- mobile은 1열 × 6행의 DOM 순서를 유지하되 빈 cell 높이는 real card의 18–24%로 제한한다. 다섯 칸 모두 DOM/layout에 남고 합계 reserved height는 real card 한 장을 넘지 않는다.

### Search `/search/`

- Primary: `reference-01-search`.
- `form[role=search]`, visible label 또는 동일 의미의 screen-reader label, full-width input, submit icon 순서다.
- keyword는 분석 트래픽의 인기도가 아니라 active public corpus tag 빈도다. count 내림차순, 표시명 오름차순으로 결정하고 내부 tag는 Korean display map으로 바꾼다.
- empty query는 세 primary lane의 실제 discovery card를 하나씩 보여 준다. lane selection이 없으면 release gate가 실패한다.
- query result kind는 `article | review | thought`만 허용한다. secondary collection, memory, tag/topic 자체는 primary result에 섞지 않는다.
- 결과 0건은 실제 keyword 제안만 보여 주고 빈 grid를 만들지 않는다.

### Detail template matrix

| lane | primary reference | header | title/meta | hero | body |
| --- | --- | --- | --- | --- | --- |
| article | `reference-03-detail` | off-white inner | terracotta field 안 | terracotta 58–64% + dark media 36–42% | action rail + 520–640px text + figure |
| thought | `reference-03-detail` | off-white inner | terracotta field 안, TOC/source panel 생략 가능 | article과 같은 split; media 없으면 terracotta/paper text-led | action rail + narrow text, figure optional |
| review | `reference-06:review-detail-right` | hero image 위 inverse | hero 아래 centered | full-width image-led; 없으면 paper title-led | action rail + verdict body + real cover/figure |

서로 다른 variant를 한 화면에서 혼합하지 않는다. no-media variant는 빈 image box를 만들지 않고 텍스트가 지정 column을 점유한다. detail metadata는 실제 author가 있을 때만 `by`, 그다음 `YYYY.MM.DD`; 가상 editor 이름을 쓰지 않는다.

## 8. Responsive route matrix

| surface | wide | 768–1179 | 390px/mobile and 200% zoom |
| --- | --- | --- | --- |
| home | split hero, 3 pick rail | split 유지, pick 2+1이 아니라 3열을 압축하되 최소폭 미달 시 한 열 | copy → hero media → 세 picks 순서; inverse header 유지 |
| article/review ledger | image · text · date 3영역 | image + text, date text 하단 | image/cover → title/summary → date; whole row는 한 canonical anchor |
| thought | 3×2 | 2×3 | 1×6, 한 real + 다섯 short reserved areas |
| search | input, chip row, 3 cards | 2+1 cards | horizontally wrapping chips, 1-column cards |
| article/thought detail | split hero, 3-column body | split hero, action rail beside text | title/meta → hero media → actions → body → figures |
| review detail | image-led hero, centered title, 3-column body | same order, narrower | hero → title/book/date → actions → verdict/body → cover/figures |

Filters와 chips는 clipping하지 않고 wrap한다. horizontal carousel을 새로 만들지 않는다. Action rail은 mobile에서 본문 앞의 horizontal group으로 이동한다. DOM order는 위 표와 같아 screen reader 순서와 visual order가 다르지 않다.

## 9. Image behavior와 성능

- slot별 ratio, focal point, safe area, derivative는 [이미지 아트 디렉션](form-and-thought-image-art-direction.md)의 slot contract와 승인 decision manifest에 둔다.
- editorial image는 `cover`, real book cover는 `contain`이다.
- dark image 위 text 대비를 위해 임의 gradient overlay를 추가하지 않는다. 후보 이미지 자체가 대비를 가져야 한다.
- width/height 또는 `aspect-ratio`, responsive `srcset/sizes`로 CLS를 막는다.
- route hero 한 장만 eager/high priority 후보가 될 수 있다. 나머지 offscreen media는 lazy decode/load한다.
- React-only performance evidence는 home, three primary indexes, search, lane별 detail의 desktop/mobile LCP, CLS, initial JS gzip, font bytes, first-frame image bytes를 기록한다.

## 10. Component states와 접근성

| component | default/current | hover/focus | disabled/error/no-JS |
| --- | --- | --- | --- |
| primary nav | current weight + short underline + `aria-current` | underline/color 120–180ms, 2px focus | SSR anchors always present |
| row/card | one semantic canonical anchor; decorative arrow hidden from AT | title underline, no lift | media failure keeps text and dimensions |
| filter/keyword | anchor or GET submit value | visible focus, selected state text+shape | invalid filter normalizes to 전체 |
| search | visible/sr label + submit name | ink focus ring | GET works without JS; zero state suggests keywords |
| menu | button expanded state | keyboard and pointer equivalent | no-JS fallback links remain reachable |
| action rail | copy is button | live region reports copy success/failure | like/comment are explicitly unavailable status, no counts or fake toast |

Global requirements:

- root `lang="ko"`, light `color-scheme`, skip link, landmark order, unique H1.
- 44px pointer target, visible focus, keyboard-only completion, reduced motion.
- mobile modal menu focus management; desktop popover does not trap focus.
- 320px and 200% zoom without page overflow; code/table gets localized scrolling.
- unavailable like/comment controls must not visually masquerade as working copy control. Prefer noninteractive status items; if disabled buttons are required for exact composition, include visible `준비 중` text or equivalent accessible description.

## 11. 금지 목록

- visible `beyondwin`, scene, `장면 · 글 · 책 · 찾기` brand/navigation.
- cobalt selection, mineral field, glass, gradient, blob, neon, AI dashboard aesthetic.
- inner floating card shadow, large rounded card, badge cluster.
- 가상 인물, 가상 날짜, 가상 제목, 가상 통계.
- 빈 thought cell의 placeholder 표현.
- review cover crop 또는 권리 확인을 판본 확인과 혼동하는 문구.
- hydration 이후에만 생기는 navigation이나 search form.
- secondary route를 primary nav/search에 임의 추가.

## 12. Visual QA와 acceptance

1. calibration artifact로 reference region, CSS viewport, DPR, browser, OS, font, shell crop을 고정한다.
2. 같은 조건에서 route/state screenshot을 만든다.
3. page shell/outer field, header, 큰 block ratio, baseline, type wrap, image crop, small metadata 순서로 비교한다.
4. wide, intermediate, 390×844, 320px/200% zoom을 별도로 확인한다.
5. 구조 차이는 평균 pixel score로 가리지 않는다. route별 block rectangle과 DOM/state contract가 모두 맞아야 한다.
6. reference에 없는 변경이 필요하면 구현자가 임의 처리하지 않고 ADR/spec 변경 승인을 먼저 받는다.

Typography와 generated image는 pending approval gate다. 그 외 route composition, detail variant, secondary route/search 범위, responsive DOM order는 이 문서로 확정됐다.
