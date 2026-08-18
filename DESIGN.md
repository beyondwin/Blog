# Design

## 방향

`beyondwin`은 인쇄소 4색 교정 부스다. 페이지 바깥은 먼셀 그레이 방이고, 본문은 그 안의 코팅 옵티컬 화이트 지면에서만 읽힌다.

방문자는 분류 체계를 배우기 전에 글 또는 책을 집는다. 원하면 남는 문장으로 간다.

paper command journal, 문예 크림 종이, 시안 시그널 저널은 버린 세계다. 다듬지 않는다.

## 공개 명사

헤더와 푸터는 같은 네 단어를 쓴다.

`beyondwin · 글 · 책 · 문장 · 찾기`

| 공개 명사 | 라우트 | 하는 일 |
| --- | --- | --- |
| 글 | `/articles/` | 다 쓴 에세이와 조사 |
| 책 | `/reviews/` | 표지가 있는 판단 |
| 문장 | `/memory/` | 공개해도 되는 남은 문장 |
| 찾기 | `/search/` | 섹션이 아니라 동작 |

금지하는 공개 명사: 기록, 책장, 기억, 색인, 소개, 노트 목록, 아카이브, Articles, Analysis, Reviews, Ideas, Memory, Map.

`/analysis/`, `/ideas/`, `/travel/`은 라우트를 유지하되 내비·홈·푸터에 올리지 않는다. 공개 재고가 없으면 빈 방을 만들지 않는다. `/tags/`는 찾기에 흡수한다. `/memory/map/`은 `/memory/`로 보낸다.

## 색

작성 CSS는 `src/styles/press.css`의 OKLCH 토큰을 쓴다. 방은 어둡고 종이는 밝다. 다크모드 본문이 아니다.

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

## 레이아웃

- 페이지는 회색 방이다. 그 안에 흰 시트가 있다.
- 시트 네 모서리에만 재단선. 하단 4mm 색띠는 시트 발에만.
- 그림자는 책 표지 물체에만. UI 패널은 띄우지 않는다.
- 홈 첫 뷰포트: 시트 왼쪽에 공개된 글 또는 책 하나, 오른쪽에 문장 하나. 접힌 아래는 글 제목과 책 표지. 카운트와 태그칩 없음.
- `/articles/`는 팸플릿이다. 리드 하나와 한 줄 장부. `조사` / `에세이`.
- `/reviews/`는 최근 표지 격자와 연도별 읽기 일기다. 모바일에서 제목과 평을 숨기지 않는다.
- `/memory/`는 짧은 문장집이다. 각 문장은 `/memory/[slug]/`로 간다.
- `/search/` 빈 쿼리는 글 / 책 / 문장 목록이다. KPI 사이드바 없음.
- 텍스트가 많은 영역은 카드 그리드보다 행과 지면을 우선한다.

## 컴포넌트 책임

- `SiteHeader`: 부스 크롬. 워드마크와 글/책/문장/찾기.
- `SiteFooter`: 같은 네 단어. 작성자 운영 카피 없음.
- `press-sheet`: 읽기 지면. 재단선과 색띠를 그린다.
- layout 파일들: 글 팸플릿, 책 객체, 문장 페이지의 본문 셸.
- `이 쇄 / 이전 쇄`는 데이터가 있을 때만 그린다. 가짜 이력을 만들지 않는다.

## Motion

호버, 포커스에 필요한 짧은 transition만 쓴다. 시그니처는 호버 확대가 아니라 이 쇄/이전 쇄와 표지 확대경 크롭이다. `prefers-reduced-motion`을 존중한다. 포커스는 보이는 잉크 아웃라인이다.

## Content Model

공개 writing lane은 route와 collection이 1:1로 대응한다. 스키마는 유지한다. 방문객에게 여섯 lane을 광고하지 않는다.

- `articles`: 개발 글과 기술 에세이. 공개 명사는 글.
- `reviews`: 표지가 있는 책. 공개 명사는 책.
- `memory`: private source에서 projection된 public thought. 공개 명사는 문장. `/memory`는 `src/data/memory.public.json`만 읽는다.
- `analysis`, `ideas`, `travel`: 라우트만 유지. 내비에 두지 않는다.

새 lane은 단순 폴더 추가가 아니다. `src/content.config.ts`, route, layout, validation, navigation, docs를 함께 추가해야 한다.
