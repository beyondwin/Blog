# FORM & THOUGHT design built truth

이 문서는 현재 React 공개 사이트의 구현 계약이다. 시각 권한은
[ADR-0007](docs/notes/project/adr/0007-form-and-thought-react-only-editorial-system.md),
[ADR-0008](docs/notes/project/adr/0008-full-bleed-density-and-topic-media.md),
[공개 사이트 설계](docs/notes/project/form-and-thought-public-site-design.md),
[시각 스펙](docs/notes/project/form-and-thought-visual-spec.md), 승인된 일곱 reference와
[최종 acceptance](docs/notes/project/evidence/form-and-thought-final-acceptance.md) 순서로 확인한다.
Public Atlas, Staged Aperture, mineral/cobalt reading world, Continuity Zoom 문서는
[레거시 종료 기록](docs/notes/project/history/README.md)이다. 현재 UI를 수정하는 지침이 아니다.

## 브랜드와 정보 구조

- 워드마크는 두 줄 `FORM & THOUGHT`다.
- primary navigation의 순서와 표기는 `서평 · 아티클 · 생각 · 검색`이다.
- canonical primary route는 `/reviews/`, `/articles/`, `/thoughts/`, `/search/`다.
- `/`는 black/terracotta hero와 실제 공개 기록 세 건을 고른 editorial home이다.
- `/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`와 유효한 상세 route는
  같은 shell을 쓰는 secondary route다. primary navigation과 primary search에는 넣지 않는다.
- footer navigation, scene rail, subtype badge, 좋아요·댓글 수치, 존재하지 않는 콘텐츠는 없다.

## 지면과 토큰

공개 지면은 따뜻한 편집 인쇄물의 명암을 쓴다. 토큰의 단일 구현 소유자는
`apps/site/src/ui/styles/tokens.css`다.

| 역할 | 토큰 | 현재 값 |
| --- | --- | --- |
| 바깥 지면 | `--ft-canvas` | `#E8E1D8` |
| 본문 지면 | `--ft-paper` | `#F2EFE9` |
| 밝은 지면 | `--ft-paper-bright` | `#F7F3ED` |
| 잉크 | `--ft-ink` | `#11100F` |
| 보조 잉크 | `--ft-ink-soft` | `#5E554E` |
| 선 | `--ft-rule` | `#D3C9BF` |
| terracotta | `--ft-terracotta` | `#AF6047` |
| 짙은 terracotta | `--ft-terracotta-dark` | `#7D3F30` |
| deep brown | `--ft-brown` | `#241712` |

gradient, glass, 큰 radius, 안쪽 floating shadow, decorative motion, 가짜 badge와
pill을 추가하지 않는다. 사진과 일러스트는 건축적 면, 빛과 그림자, 정물, 충분한
negative space를 사용한다. 서평 표지는 `contain`이며 디자인을 위해 crop하지 않는다.

## 글꼴과 읽기 폭

- display/body 한글: self-hosted Noto Serif KR 400.
- Latin wordmark: self-hosted Cormorant Garamond 400.
- UI/meta 한글: self-hosted Noto Sans KR 400.
- 세 파일은 `apps/site/public/fonts/`에 있고 OFL, upstream notice, checksum은
  `apps/site/public/fonts/LICENSES.md`와 관련 테스트가 검증한다.
- 본문은 desktop 17px, mobile 16px, line-height 약 1.9다.
- 390px에서는 22px inset과 16px 본문을 보존한다. 실제 measure는 21.63em이며,
  접근 가능한 크기를 줄여 과거 상충 수치를 맞추지 않는다.
- 제목은 `word-break: keep-all`, 긴 URL·code·table은 route 안에서만 wrap/scroll하고
  document 가로 overflow를 만들지 않는다.

## 공통 shell과 interaction

`SiteShell`은 skip link, `SiteHeader`, main만 렌더한다. `.site-shell`은 모든 public route에서
viewport 전체 너비와 최소 `100vh`를 쓰며 outer margin, radius와 shadow가 없다. route content와
header의 검증된 가로 gutter는 1180px 이상 `64px`, 768–1179px `36px`, 767px 이하 `22px`다.
header 높이는 같은 구간에서 각각 `88px`, `80px`, `72px`다. desktop은 inline primary
navigation과 보조 menu button을 제공한다. 767px 이하에서는 44px menu button과
modal navigation을 사용하며 배경을 inert로 만들고, focus를 가두고, `Escape`와 바깥
pointer로 닫은 뒤 trigger로 focus를 복원한다. JavaScript가 없으면 `<noscript>`의
canonical primary anchors가 남는다.

visible focus는 2px 이상 outline과 바깥 ink ring을 함께 사용한다. reduced motion에서는
transition과 animation을 제거하고 `/search/`의 기억 탐색 대기 없이 최종 상태로 이동한다.
canonical anchor와 GET form이 기본 동작을 소유하고 React는 menu, link copy, 질문형 검색 상태,
검색 결과 갱신, bounded origin return만 보강한다.

## route composition

### Home

black/terracotta split hero, 승인된 대표 이미지와 실제 hero article, 그 아래 서평·아티클·
생각 한 건씩을 고른 세 editorial pick을 렌더한다. selection은 immutable release에서만
오며 body나 관계 같은 detail-only field를 listing payload에 싣지 않는다. 1180px 이상 hero는
`520px`, 세 pick은 각각 `210px`이고, 768–1179px에서는 각각 `500px`, `200px`다. 모바일은
고정 높이로 내용을 자르지 않고 copy → media → 세 pick의 DOM 순서대로 자연스럽게 늘어난다.

### 아티클과 서평 index

큰 제목, 설명, 얇은 rule, 가로 editorial row를 사용한다. 아티클은 canonical GET topic
anchor와 17건 ledger를 제공한다. 서평은 18건 ledger를 제공하며 승인된 cover byte가 없는
현재 release에서는 text-led다. 1180px 이상 primary row는 `196px`이고, 768–1179px와 모바일은
실제 긴 제목·설명·날짜가 다음 row와 겹치지 않도록 content-safe auto height를 쓴다.
`coverState: hold`는 숨기지 않고 공개 보류 상태를 표시한다.

### 생각 index

정확히 3열 × 2행의 구성 공간이다. 실제 생각 한 건만 link와 콘텐츠를 갖고 나머지 다섯
칸은 inert, `aria-hidden`, 비어 있다. placeholder, skeleton, fake date를 넣지 않는다.

### 검색

`/search/`는 FORM & THOUGHT의 공개 기록에 질문하는 second-brain 표면이다. 첫 화면은 avatar가
있는 종이 collage stage와 질문 composer를 49/51로 놓고, 모바일은 avatar 다음에 질문이 온다.
승인된 sample 질문은 `관련 기록 탐색 → 생각 연결 → 답 쓰기` 뒤 실제 공개 thought에서 검증한
답과 세 근거를 보여 준다. 근거는 desktop left panel, mobile bottom sheet로 열리며 focus trap,
`Escape`, backdrop close와 trigger focus return을 제공한다.

LLM/RAG를 아직 연결하지 않았으므로 다른 질문에 sample 답을 재사용하지 않는다. 임의 질문은
primary corpus인 서평·아티클·생각의 deterministic 결과로 전환한다. GET form과 canonical query
URL은 유지하지만 `ssr: false` 정적 export이므로 query별 filtering과 input restoration은
hydration 이후에만 동작한다. JavaScript-off에서 query-specific 결과나 생성 답변을 제공한다고
주장하지 않는다.

### detail

아티클·생각은 off-white inner header와 terracotta/dark split hero, action/prose grid를 쓴다.
primary article/thought split hero의 desktop introduction과 media target은 `420px`이며 모바일은
제목·요약·metadata가 잘리지 않도록 자연스럽게 늘어난다. secondary detail은 이 압축 owner를
상속하지 않고 기존 `490px` 기준을 유지한다. 서평은 승인 cover가 있으면 image-led, 아니면
compact text-led다. action rail에서 좋아요와 댓글은
비활성 준비 상태이고 수치나 성공을 만들지 않는다. link copy만 canonical URL을 복사하고
접근 가능한 상태 메시지를 낸다. direct entry는 collection fallback을, 검증된 list/search
origin은 bounded return을 제공한다.

### secondary route

analysis, ideas, travel, tags, memory는 같은 header, rule, serif hierarchy와 본문 measure를
사용한다. legacy scene/zoom interaction은 없다. `/memory/map/`은 `/memory/`로 가는
`noindex` compatibility document일 뿐 별도 public experience가 아니다.

## 이미지와 권리

공개 content record가 쓰는 media는 immutable release의 resolved media만 받는다. generated
content media는 controller와 independent visual reviewer가 같은 checksum-bound decision
batch를 승인하고 rights review가 통과한 원본만 release에 들어간다. caveat는 `non-exclusive
generated output; copyrightability/uniqueness not guaranteed`다. 승인되지 않은 후보는
text-led fallback이다.

검색 avatar는 content-release media가 아니라 checksum-bound public shell asset인
`/images/form-and-thought-agent-avatar-v1.png`다. 이 예외의 단일 receipt는
`docs/notes/project/assets/form-and-thought-second-brain-avatar/decision-manifest.yml`이며 SHA-256은
`f29c064b1c0f77e5906a9c02e5b8e0a573ae6c44373b99fb75532c90fd481f20`다. 권리 상태는
`partially_verified`, independent legal review는 `not_measured`이므로 content-release media의
승인 완료 상태로 해석하지 않는다.

아티클 17개는 2026-08-30 media refresh에서 모두 대표 이미지를 갖는다. 최종 inventory는
retain 6, replace 7, add 4이며 replace/add 11개는 `editorial-topic-hero`라는 새 ID로 기존
asset을 보존한 채 연결했다. exact family와 순서는
[이미지 아트 디렉션](docs/notes/project/form-and-thought-image-art-direction.md)과
[최종 17-image contact sheet](docs/notes/project/assets/form-and-thought-generated/articles/final-article-index-contact-sheet-topic-refresh.png)가
소유한다. `recordsForCollection()` 순서에서 family, camera distance, 주 피사체가 세 번 연속
반복되지 않는다. 과거 missing 네 건도 승인 asset으로 해소됐고, HOLD/rejected candidate는
public source와 release에 들어가지 않았다.

서평 cover는 normalized title, source-order authors, publisher, ISBN-13, edition label과 authoritative
source가 실제 제공한 optional publication year로 exact identity를 만든다. publisher/rightsholder,
compatible official distributor/API, exact-edition licensed/open repository 순서로 source를 고르고,
exact candidate bytes와 applicable redistribution license 또는 written permission evidence를
checksum으로 묶는다. controller와 independent-rights-reviewer가 같은 tuple을 승인한 경우에만
public byte와 `contain` stage를 만든다. private evidence URL/path/checksum/date/scope, 조사 locator와
evidence bytes는 public record, manifest, loader와 emitted file에 들어가지 않는다.

2026-08-30의 [exhaustive inventory](docs/notes/project/assets/review-cover-rights/inventory.yml)는
approved 0건 / HOLD 18건이며 [production registry](packages/content/review-cover-redistribution-approvals.json)도
승인 0건이다. source identification cover가 있는 17건의 strict rights warning은 의도적으로
남고, `devotion-of-suspect-x`를 포함한 18건 모두 text-led다. immutable release
`3aa8781fd5e923858c50cadccb45782f1657d19f4732017d8789041e610784f1`은 review asset과 media
reference 0건, `privateBoundaryHits: 0`을 확인했다.

`ResponsivePicture`는 성공한 server markup의 local `<picture>` source를 그대로 유지한다.
최종 `<img>`의 `error` 또는 hydration 때 확인한 `complete && naturalWidth === 0`는 mount당 한 번만
실패로 보고되고, picture 대신 hidden `data-responsive-picture-state="error"` marker를 남긴다.
owner CSS는 marker를 가진 home, ledger, article detail과 review cover stage를 숨기고 기존
text-led/full-width 구성으로 접는다. review owner는 같은 실패 상태에서 preload, inverse header,
cover stage와 image-led class를 함께 제거한다. 실제 article request의 hydration 전후 실패는
검증됐지만, 실제 approved-cover presentation과 실제 승인 review cover request 실패는 승인 cover가
0건이므로 모두 `not_measured`다. synthetic density fallback test는 automated evidence일 뿐
real-data browser 동작을 대신하지 않는다.

review rights browser matrix는 `/reviews/`, `/reviews/black-swan/`,
`/reviews/devotion-of-suspect-x/`를 1440×900, 768×900, 390×844, 320×844와 720×450/DPR 2에서
검사했다. 15셀 모두 compact text-led, cover URL/request/preload/stage 0건, document overflow 0,
clean console/network와 순차 keyboard focus를 통과했고 CLS는 `0–0.003005`였다. exact edition/year
label과 rights label은 블랙스완의 `동녘사이언스 2018 개정증보판, 차익종·김현구 옮김` /
`판본 확인 · 표지 공개 권리 미확인`, 용의자 X의 헌신의 `현대문학 2006 양장, 양억관 옮김` /
`표지 공개 보류`다.

article media refresh는 release `dde592cdfd307ba664738de00f50077181ff947066a89192acd1d82241150aef`와
17-cell browser matrix에서 완료됐다. `/articles/`은 1440×900, 768×900, 390×844, 320×844와
720×450/DPR 2의 200% reflow proxy에서 이미지 decode, concrete alt, eager/lazy, crop,
CLS(`0–0.001002`), console/network와 document overflow를 통과했다. retained 1개, replaced
1개와 과거 missing 4개 상세도 1440×900/390×844에서 통과했다. article failure probe는 media를
숨기고 한 열 text-led hero로 복구한다. 이 완료는 review cover rights 계획이나 production
배포 권한을 대신하지 않는다.

## responsive acceptance

기본 확인 폭은 1440×900, 승인 reference calibration 1440×1080(Home), 1080×1440
(articles), 1120×1400(detail), 768px, 390×844, 320 CSS px reflow다. 320px는 200% zoom
proxy다. density acceptance는 이 폭에 더해 물리 1440×900을 `720×450` CSS px와 DPR 2로
검사하는 200% reflow proxy를 사용한다. 모든 변경은 console error, keyboard focus,
serious/critical accessibility,
document overflow, image failure, 긴 제목, table/code containment, no-JS와 실제 static-host
404를 다시 확인한다.
