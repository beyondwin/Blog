# Design

## 적용 범위

`/`는 공개 사이트의 첫 `판단` 탐색 화면이다. 차갑고 밝은 mineral daylight field, 실제 media, text-only object, cobalt selection으로 하나의 authored spatial composition을 만든다.

기존 `/articles/`, `/reviews/`, `/memory/`, `/search/`와 detail route는 아직 회색 교정 부스와 흰 proof sheet 계열을 사용한다. 이 reading route들은 동작하는 기존 시스템이며 공개 탐색 화면과 같은 visual world로 재설계된 범위가 아니다.

두 범위를 섞어 built truth를 흐리지 않는다. 공개 탐색 화면에는 `src/styles/storyworld.css`, 기존 reading route에는 `src/styles/press.css`와 관련 layout이 적용된다.

## 공개 명사

주요 navigation은 같은 네 개의 공개 명사를 쓴다.

`장면 · 글 · 책 · 찾기`

| 공개 명사 | 라우트 | 하는 일 |
| --- | --- | --- |
| 장면 | `/` | 공개 승인된 object를 관계가 있는 하나의 장면으로 보여준다. |
| 글 | `/articles/` | 다 쓴 에세이와 조사 |
| 책 | `/reviews/` | 표지가 있는 판단 |
| 찾기 | `/search/` | 섹션이 아니라 동작 |

`/memory/`는 공개 projection을 읽는 canonical route로 유지하며 scene object와 content relation에서 접근할 수 있다. 다만 주요 navigation의 별도 명사로 올리지 않는다.

금지하는 주요 navigation 명사: 기록, 책장, 기억, 색인, 소개, 노트 목록, 아카이브, Articles, Analysis, Reviews, Ideas, Memory, Map.

`/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`은 canonical route를 유지하되 주요 navigation에 올리지 않는다. 공개 재고가 없으면 빈 방을 만들지 않는다.

## 공개 탐색 화면: Staged Aperture

현재 구현은 `/`의 author-approved `판단` scene 하나다. lead `reading-desk-cobalt`와 `judgment-scale`, text-only `블랙스완`, article excerpt, `shared-reading-table`을 하나의 유한한 장면으로 구성한다. warm `reading-desk-light`는 lead로 사용하지 않는다.

- Desktop은 중앙에서 조금 오른쪽의 큰 lead와 viewport 경계의 support/context를 함께 보여준다. 동일한 card grid, masonry, 일반 carousel로 바꾸지 않는다.
- Mobile은 native horizontal scrolling과 `scroll-snap`으로 같은 공간 관계를 번역한다. 첫 canonical lead는 full-viewport initial slot 안에서 양쪽 `15vw` 여백을 둔 `70vw`, support/context/hint stop은 `72vw`, stage는 `42svh`다. 첫 프레임에는 이미 resolve된 `judgment-scale`과 `black-swan`에서 만든 비상호작용·`aria-hidden` edge echo가 lead 위에 겹쳐 승인된 깊이를 보충한다. echo에는 href, canonical id, action, 별도 사실이 없고 사용자가 native rail을 움직이면 사라진다. swipe를 가로채는 custom drag나 scroll-jacking을 추가하지 않는다.
- object는 server-rendered canonical anchor다. JavaScript가 없어도 글과 책 route로 이동한다.
- `읽기`는 canonical content route로 이동하고 `전체 보기`는 현재 scene viewport로 돌아간다.
- 현재 slice는 여러 scene, 자동 scene, 존재하지 않는 scene count를 암시하지 않는다.

## Continuity Zoom

선택한 object는 modal을 겹쳐 띄우지 않고 원래 geometry에서 focus composition으로 확장한다. desktop focus는 image-first split과 quiet provenance를 사용하고, mobile focus는 object와 정보 패널을 세로로 잇는다.

- Focus는 `?focus=<object-id>`와 history state로 표현한다. direct URL과 refresh도 같은 object를 선택한다.
- Shipped focus panel의 type field는 text가 아니라 3px marker다. visible information order는 title, 실제 authored article excerpt, `읽기`, `전체 보기`, quiet relation/source provenance다. Continuity Zoom이 시작된 뒤 336ms(480ms의 70%)에 panel reveal을 시작해 144ms에 완료한다. native View Transition은 named panel pseudo-element를, FLIP fallback은 live panel opacity를 사용한다.
- 같은 object의 pending 또는 active focus activation은 idempotent guard가 거부한다. rapid repeat/Enter는 history entry를 중복 생성하지 않으며 focus 동안 canonical scene anchor는 tab order에서 빠지고 reveal 뒤 `읽기`가 keyboard path를 이어받는다.
- browser Back, `Escape`, `전체 보기`는 선택 object와 keyboard focus를 복원한다.
- mobile에서는 native rail의 정확한 `scrollLeft`를 history에 함께 보관하고 layout 전환 뒤 복원한다. object identity만으로 nearest snap point를 다시 계산하지 않는다.
- `prefers-reduced-motion: reduce`에서는 Web Animation이나 View Transition을 시작하지 않고 즉시 전환한다.
- invalid focus는 오류 화면 대신 `/` overview로 정규화한다.

## 색

공개 탐색 화면은 `src/styles/storyworld.css`의 daylight field를 사용한다.

- base light `#F2F4F7`, reading white `#FFFFFF`, ink `#151619`.
- selection과 visible focus는 cobalt `#2B63E8`.
- 실제 media가 색을 담당하고 자동 gradient, glass, card shadow, paper grain, sticker, particle을 쓰지 않는다.

기존 reading route는 `src/styles/press.css`의 OKLCH 토큰을 쓴다. 방은 어둡고 종이는 밝다. 다크모드 본문이 아니다.

- `--booth`: 중성 그레이. 페이지 바깥, 헤더/푸터 크롬.
- `--sheet`: 코팅 옵티컬 화이트. 읽기 시트. 본문은 여기만.
- `--ink`: 리치 블랙. 제목과 본문.
- `--soft`: 중성 다크 그레이. 날짜, 판권, 보조.
- `--proof`: printer’s non-repro blue. 교정 메모, 문장.
- `--mark`: 아주 얇은 생산 표시. 시트 네 모서리와 하단 4mm 색띠만.

레인마다 색을 나누지 않는다. 악센트 필드를 넓게 깔지 않는다.

금지한다.

- 따뜻한 아이보리, 크림 종이, 문예 명조.
- purple-blue AI gradient, glass, blob, 시안 시그널.
- 카드 그림자, 칩, 배지, 라운드 고스트 박스.
- 텍스트보다 먼저 보이는 배경 장식.

## 글꼴과 문장 폭

문예 명조와 AI 기본 세리프를 쓰지 않는다. 본문과 제목은 같은 한글 고딕 계열이다.

- 한글: Source Han Sans K / Noto Sans KR / Apple SD Gothic Neo.
- 라틴: Source Sans 3 또는 같은 작업표 그로테스크.
- 금지: Inter 디스플레이, Space Grotesk, Playfair, Iowan, AppleMyungjo, IBM Plex.

규칙:

- 데스크톱 본문 measure는 대략 36–40자, `42em`.
- 본문 17px / 행간 1.9. 모바일 16px. 한글 자간은 0.
- 제목만 `word-break: keep-all`.
- 계층은 색이 아니라 크기, 굵기, 여백으로 만든다.

## 기존 reading route 레이아웃

- 페이지는 회색 방이다. 그 안에 흰 시트가 있다.
- 시트 네 모서리에만 재단선. 하단 4mm 색띠는 시트 발에만.
- 그림자는 책 표지 물체에만. UI 패널은 띄우지 않는다.
- `/articles/`는 팸플릿이다. 리드 하나와 한 줄 장부. `조사` / `에세이`.
- `/reviews/`는 최근 표지 격자와 연도별 읽기 일기다. 모바일에서 제목과 평을 숨기지 않는다.
- `/memory/`는 짧은 문장집이다. 각 문장은 `/memory/[slug]/`로 간다.
- `/search/` 빈 쿼리는 글 / 책 / 문장 목록이다. KPI 사이드바 없음.
- 텍스트가 많은 영역은 카드 그리드보다 행과 지면을 우선한다.

## 컴포넌트 책임

- `SiteHeader`: public chrome. 워드마크와 장면/글/책/찾기, mobile 44px menu.
- `SiteFooter`: 같은 공개 navigation contract를 따른다.
- `PublicScene`: server-rendered scene objects, native mobile rail, URL/history/focus lifecycle.
- `PublicSceneObject`: media 또는 text-only object와 canonical no-JS anchor.
- `storyworld.css`: Staged Aperture, focus composition, mobile snap rail, reduced-motion 규칙.
- `press-sheet`: 읽기 지면. 재단선과 색띠를 그린다.
- layout 파일들: 글 팸플릿, 책 객체, 문장 페이지의 본문 셸.
- `이 쇄 / 이전 쇄`는 데이터가 있을 때만 그린다. 가짜 이력을 만들지 않는다.

## Motion

공개 탐색 화면의 signature motion은 Continuity Zoom이다. object focus는 480ms, scene return은 360ms 범위의 shared-geometry 전환을 사용하며 bounce, idle animation, autoplay camera, scroll-jacking은 금지한다. reduced motion에서는 geometry animation을 생략한다.

기존 reading route는 호버와 포커스에 필요한 짧은 transition만 사용한다. 모든 범위에서 포커스는 보이는 cobalt 또는 잉크 outline이다.

## Content Model

공개 writing lane은 route와 collection이 1:1로 대응한다. 공개 탐색 scene은 새 content lane이 아니라 published entry와 public projection을 참조하는 authored view model이다. 방문객에게 내부 collection을 광고하지 않는다.

- `articles`: 개발 글과 기술 에세이. 공개 명사는 글.
- `reviews`: 표지가 있는 책. 공개 명사는 책.
- `memory`: private source에서 projection된 public thought. `/memory`와 public scene resolver는 `src/data/memory.public.json`만 읽는다.
- `analysis`, `ideas`, `travel`: 라우트만 유지. 내비에 두지 않는다.

새 lane은 단순 폴더 추가가 아니다. `src/content.config.ts`, route, layout, validation, navigation, docs를 함께 추가해야 한다.
