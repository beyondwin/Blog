# Design

## 방향

`beyondwin`은 paper command journal이다. 흰 종이, 검은 ink, graphite metadata, 얇은 hairline, cyan-blue signal accent로 만든 개인 기술 출판물이다.

목표는 “멋있어 보이는 블로그”가 아니라 “다시 읽고 판단을 복구하기 쉬운 archive”다.

## 색

작성 CSS는 OKLCH token을 기준으로 둔다.

- 배경과 주요 surface는 흰색 계열을 유지한다.
- 본문은 black 또는 near-black ink를 쓴다.
- 보조 텍스트는 neutral graphite를 쓴다.
- 구분선은 옅은 gray hairline을 쓴다.
- link, selected state, focus, brand mark에는 cyan-blue signal accent 하나만 쓴다.

금지한다.

- purple-blue AI gradient.
- 여러 accent color를 섞은 dashboard 느낌.
- decorative blob, bokeh, glass panel.
- 넓고 흐린 shadow와 border를 같이 쓰는 ghost-card pattern.
- 텍스트보다 먼저 보이는 배경 장식.

## 글꼴과 문장 폭

한국어와 영어를 모두 안전하게 렌더링하기 위해 system font stack을 쓴다.

- Sans/display/body: `ui-sans-serif`, `Apple SD Gothic Neo`, `Noto Sans KR`, `Pretendard`, system UI.
- Mono/code: `ui-monospace`, SFMono-Regular, Menlo, Consolas.

규칙:

- 본문 measure는 대략 64-72ch로 제한한다.
- 한국어 본문과 heading은 letter spacing을 0에 둔다.
- 계층은 색보다 weight, scale, spacing으로 만든다.
- 긴 한국어/영어 기술 제목이 카드나 row를 밀어내지 않아야 한다.

## 레이아웃

- shell 최대 폭은 1200px다.
- home은 masthead, featured technical article, start-here list, lane index, topic rack, latest row index 순서다.
- collection page는 title, description, count, row list를 중심으로 구성한다.
- detail page는 article body를 중앙에 두고, review와 analysis는 필요한 metadata panel만 덧붙인다.
- 텍스트가 많은 영역은 card grid보다 row preview를 우선한다.
- section을 card 안에 넣는 nested-card 구조는 쓰지 않는다.

## 컴포넌트 책임

- `SiteHeader`: sticky editorial header, brand mark, 주요 lane navigation.
- `ContentCard`: collection preview row. type, date, title, description, tags, read affordance를 렌더링한다.
- `StatusBadge`: 작은 semantic label. signal accent를 과하게 쓰지 않는다.
- `Callout`: prose 안의 note. flat하고 border-defined여야 한다.
- `SourcePanel`: analysis source와 provenance를 본문 옆에서 확인하게 한다.
- `TableOfContents`: 긴 글의 section 이동을 돕는다.
- layout 파일들: collection별 metadata와 prose shell을 정리한다.

## Motion

hover, focus, tab 전환에 필요한 정도의 짧은 transition만 쓴다. content visibility를 animation에 의존하지 않는다. `prefers-reduced-motion`을 존중한다.

## Content Model

공개 writing lane은 route와 collection이 1:1로 대응한다.

- `articles`: 개발 글과 기술 에세이.
- `analysis`: queue 기반 source-grounded 분석.
- `reviews`: 책, 글, 도구, 강의, 기타 리뷰.
- `ideas`: 아직 글이 되기 전의 생각.
- `travel`: 장소와 동선 기록.
- `memory`: private source에서 projection된 public thought.

새 lane은 단순 폴더 추가가 아니다. `src/content.config.ts`, route, layout, validation, navigation, docs를 함께 추가해야 한다.
