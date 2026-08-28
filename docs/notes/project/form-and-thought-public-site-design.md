# FORM & THOUGHT 공개 사이트 설계

- 상태: approved target, implementation pending
- 기준일: 2026-08-28
- 승인 근거: [ADR-0007 Decision evidence](adr/0007-form-and-thought-react-only-editorial-system.md#decision-evidence)
- 결정: [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md)
- 시각 기준: [FORM & THOUGHT 시각 스펙](form-and-thought-visual-spec.md)
- 이미지 기준: [FORM & THOUGHT 이미지 아트 디렉션](form-and-thought-image-art-direction.md)

## 1. 목표

공개 사이트를 `FORM & THOUGHT`라는 하나의 편집 브랜드로 다시 만든다. 사용자는 홈에서 서평, 아티클, 생각을 발견하고, 목록에서 빠르게 성격을 파악하며, 상세에서 긴 글을 편안하게 읽고, 검색에서 자신의 질문을 넓힐 수 있어야 한다.

완성 기준은 기존 화면에 새 색을 입히는 것이 아니다. 승인된 reference set의 지면 비율, 타이포그래피 계층, 이미지와 여백의 관계, 화면별 정보 순서를 실제 콘텐츠로 재현하는 것이다.

## 2. 범위와 비범위

### 이번 전환에 포함한다

- 전역 브랜드와 navigation 교체.
- 홈, 아티클 목록·상세, 서평 목록·상세, 생각 목록·상세, 검색의 React 구현.
- `thoughts` collection과 canonical route 신설.
- `why-i-read-in-the-ai-era`의 article → thought 이동.
- 실제 아티클 17편, 실제 서평 18편, 생각 1편의 편집.
- 대표 이미지 후보 생성, contact sheet 검토, 승인 이미지 연결.
- 좋아요·댓글의 비활성 준비 상태와 링크 복사 구현.
- Astro 책임 이전과 Astro 코드·의존성·검증 제거.
- 새 design/architecture built truth 문서 동기화.

### 포함하지 않는다

- 좋아요나 댓글의 저장소, 계정, 수치 집계, 작성 UI.
- fake thought, fake article, fake date, placeholder card.
- 승인받지 않은 생성 이미지의 public 연결.
- 레거시 Astro renderer와 구 URL compatibility 지원.
- private memory나 raw source의 공개 범위 확대.

## 3. 정보 구조

| 공개 명사 | route | 데이터 | 역할 |
| --- | --- | --- | --- |
| 홈 | `/` | 편집된 featured projection | 브랜드의 첫 인상과 세 갈래 진입 |
| 서평 | `/reviews/` | `reviews` | 책에 대한 판정과 읽기 기록 |
| 아티클 | `/articles/` | `articles` | 기술·디자인·시스템 글 |
| 생각 | `/thoughts/` | `thoughts` | 짧고 응축된 사유 |
| 검색 | `/search/` | primary-lane public release search index | 키워드와 질문으로 서평·아티클·생각 탐색 |

Header의 visible order는 모든 화면에서 `서평 · 아티클 · 생각 · 검색`이다. 활성 tab은 굵기와 짧은 밑줄로 표시하고 `aria-current`를 제공한다. 모바일은 같은 순서를 hamburger menu와 no-JS fallback에 보존한다.

`/analysis/`, `/ideas/`, `/travel/`, `/tags/`, `/memory/`와 현재 유효한 detail/map route는 secondary canonical route로 유지한다. 모두 새 shell을 사용하지만 primary navigation과 primary search 결과에는 넣지 않는다. 과거 evidence 문서의 route는 역사적 사실로 보존하며 현재 route 계약으로 해석하지 않는다.

## 4. 데이터와 공개 경계

### Content contract

`thoughts`는 독립 collection이다. 공통 필드는 title, description, createdAt, updatedAt, tags, status, draft를 사용하고, thought 전용 필드는 필요한 경우 `featuredMedia`와 `excerpt`만 둔다. 공개 조건은 다른 collection과 같은 `published && !draft`다.

내부 record kind와 evidence state는 검증과 편집에 남길 수 있지만 public list badge로 노출하지 않는다. 아티클 화면의 filter는 방문자가 이해하는 주제 projection이며 source frontmatter를 임의로 바꾸지 않고 deterministic mapping으로 만든다.

초기 filter는 다음 여섯 개다.

`전체 · 에이전트 · 디자인 · 데이터 · 아키텍처 · 검증`

각 글은 하나의 primary filter에만 속하고, mapping은 코드 또는 public release manifest에 명시해 중복 결과와 자동 추론을 피한다.

### Release flow

```text
MDX source
  -> packages/content schema and editorial validation
  -> public projection allowlist
  -> immutable release manifest
  -> apps/site route loader
  -> React-rendered public page
```

Public app은 top-level `memory/**`, private raw source, DB credential을 읽지 않는다. 검색도 active public release만 색인한다.

## 5. 화면 설계

### 5.1 header

- 왼쪽에 두 줄 `FORM &` / `THOUGHT` 워드마크.
- 오른쪽에 `서평 · 아티클 · 생각 · 검색 · hamburger`.
- inner route의 header는 화면 맨 위 off-white 지면 안에 있고 별도 floating bar가 아니다.
- 홈만 승인 reference처럼 black/terracotta hero 안에 흰색 inverse header를 통합한다. off-white header band를 만들지 않는다.
- desktop에서 약 104px 높이, mobile에서 약 72px를 기준으로 한다.
- hamburger는 44×44px hit area를 가지며 세 줄 아이콘 외 장식을 두지 않는다. desktop에는 네 tab과 hamburger를 함께 보이고, hamburger가 새로운 secondary destination을 발명하지 않는다.

### 5.2 홈 `/`

Desktop composition은 `reference-05-home.png`와 `reference-07-surface-set.jpg`의 좌상단 화면을 따른다.

1. Header 아래에 page width를 채우는 hero가 온다.
2. Hero 왼쪽은 black field와 실제 대표 문장, 설명, `이 글 읽기` action이다.
3. 오른쪽은 terracotta/off-white/black 건축 이미지다.
4. Hero 아래에는 동일 폭의 세 editorial pick이 한 행에 온다.
5. 각 pick은 이미지와 텍스트를 1:1에 가까운 두 영역으로 나누고 한 개의 실제 항목만 연결한다.

Hero 문구는 실제 공개 콘텐츠에서 가져오며 reference의 가상 문구를 복사하지 않는다. 세 pick은 각각 고정된 실제 서평·아티클·생각 한 건에 연결한다. 세 lane 모두 selection을 가져야 release가 통과하며, 없는 lane을 fake card로 채우거나 2열로 재배치하지 않는다. Hero가 날짜상 최신 글이 아니라면 `최근`이라고 쓰지 않는다.

### 5.3 아티클 `/articles/`

Desktop composition은 `reference-04-article-index.png`와 `reference-07-surface-set.jpg`의 상중앙 화면을 따른다.

- 큰 `아티클` 제목과 오른쪽 한 줄 설명.
- 얇은 horizontal rule 아래 filter row.
- 각 결과는 왼쪽 landscape image, 가운데 title·description, 오른쪽 date를 가진 한 행.
- 행 사이에는 얇은 rule만 사용한다.
- 공개 subtype label, card border, shadow, badge는 사용하지 않는다.
- 이미지가 승인되지 않은 글은 억지 placeholder를 넣지 않고 text-led row variant를 사용한다. 전체 행의 기준선은 유지한다.
- 17편을 pagination 없이 하나의 editorial ledger로 모두 렌더한다. reference의 3–4행은 first-frame density 기준이다.

### 5.4 서평 `/reviews/`

Desktop composition은 `reference-06-review-and-detail.jpg`의 왼쪽 화면을 따른다.

- 큰 `서평` 제목 아래 실제 review row를 쌓는다.
- 왼쪽 image cell 안에서 판본 identity와 public redistribution rights가 모두 승인된 책 표지만 `object-fit: contain`으로 보여 주고 표지를 잘라내지 않는다.
- 가운데에 title, 저자 또는 책 정보, verdict를 둔다.
- 오른쪽 아래에 날짜를 둔다.
- cover rights가 warning/hold/unverified인 경우 bytes를 public release에 포함하지 않고 fake cover 없이 text-led row를 사용한다.
- 18편을 pagination 없이 하나의 editorial ledger로 모두 렌더한다. 표지의 `verified`는 판본/media identity 확인이며 public redistribution rights 승인을 뜻하지 않는다.

### 5.5 생각 `/thoughts/`

Desktop composition은 `reference-02-thought-index.png`와 `reference-07-surface-set.jpg`의 하중앙 화면을 따른다.

- 큰 `생각` 제목과 오른쪽 짧은 설명.
- 본문은 정확히 3열 × 2행의 동일한 composition grid.
- `AI 시대에, 나는 왜 책을 읽는가` 한 건만 첫 cell에 실제 카드로 배치한다.
- 나머지 다섯 cell은 제목, 날짜, quote, icon, skeleton, `준비 중` 문구 없이 완전히 비워 둔다.
- 비어 있어도 desktop 전체 grid 높이를 확보한다.
- intermediate는 2열 × 3행, mobile은 1열 × 6행 순서다. mobile에서도 빈 다섯 cell을 유지하되 각 높이를 실제 카드의 18–24%로 제한하고 합계가 실제 카드 한 장보다 길지 않게 한다.

### 5.6 검색 `/search/`

Desktop composition은 `reference-01-search.png`와 `reference-07-surface-set.jpg`의 우하단 화면을 따른다.

- 큰 `검색` 제목과 오른쪽 설명.
- 전체 폭 input과 오른쪽 search icon.
- active public corpus의 tag 빈도로 결정한 keyword chip. 분석 트래픽의 인기도로 표현하지 않는다.
- 검색어가 없을 때는 탐색을 돕는 세 topic card를 보여 준다.
- 검색어가 있을 때는 아티클·서평·생각 결과를 relevance 순으로 한 목록에 보여 주되 각 결과의 공개 유형을 plain text로 구분한다.
- 결과 0건은 다른 키워드를 제안하고, 빈 card grid를 만들지 않는다.

### 5.7 상세 공통

상세는 reference variant를 임의로 섞지 않고 다음 lane mapping을 고정한다.

| lane | primary reference | title/hero | body |
| --- | --- | --- | --- |
| 아티클 | `reference-03-detail` | off-white header 뒤 terracotta title field + dark media split | action rail + 좁은 text + figure |
| 생각 | `reference-03-detail` | 아티클과 같은 split, media가 없으면 text-led field | action rail + 좁은 text, figure optional |
| 서평 | `reference-06` 오른쪽 frame | image-led hero 뒤 centered title·책 정보·날짜 | action rail + verdict body + 실제 cover/figure |

이미지가 없는 콘텐츠는 빈 image box를 만들지 않는다. 작성자 표시가 필요할 경우 실제 author만 쓰고 날짜는 `YYYY.MM.DD`로 표현한다.

Action rail:

- 좋아요: `준비 중` accessible label, 비활성 상태, count 없음.
- 댓글: `준비 중` accessible label, 비활성 상태, count 없음.
- 링크: canonical URL 복사, 성공 시 짧은 live-region 메시지.

좋아요·댓글은 활성 control과 혼동되지 않는 noninteractive `준비 중` status가 기본이다. exact icon composition 때문에 disabled button을 쓸 경우에도 count, success hover, fake toast를 두지 않는다.

### 5.8 아티클 상세

아티클은 `편집형 가이드`로 읽힌다.

1. 제목과 한 문장 요약.
2. 이 글이 답하는 질문 또는 핵심 판단.
3. 본문 절.
4. 필요한 표·코드·인용·그림.
5. 적용 기준 또는 결론.
6. source-grounded 글이면 확인한 자료와 한계.

긴 서론, 같은 주장 반복, 출처가 본문 흐름을 끊는 문제를 편집한다. 기술 사실과 출처 의미는 유지한다.

### 5.9 서평 상세

서평은 `판정 중심 서평`로 읽힌다.

1. 책 정보와 한 문장 verdict.
2. 무엇이 남았는가.
3. 왜 그렇게 판단했는가.
4. 동의하지 않거나 걸리는 지점.
5. 누구에게 권할 것인가.

줄거리 요약이 판정을 압도하지 않게 하고, 인용은 원문 의미와 기존 locator를 유지한다.

### 5.10 생각 상세

생각은 짧고 응축된 사유문이다.

- 불필요한 목차나 source panel을 강제하지 않는다.
- 한 문단이 너무 길면 호흡 단위로 나눈다.
- `AI 시대에, 나는 왜 책을 읽는가`의 논지는 유지하면서 article 형식의 설명적 장치를 덜어 낸다.

## 6. 콘텐츠 편집 계약

### 편집할 수 있다

- 제목을 더 직접적으로 다듬기.
- 첫 문단을 독자의 질문과 핵심 판단 중심으로 재배열하기.
- 중복 문장 삭제.
- 절 제목, 문단 분할, 목록, 표, callout을 읽기 흐름에 맞게 재구성하기.
- 출처와 주석을 본문 가까이 또는 하단 colophon으로 옮기기.
- summary와 description을 실제 글의 결론에 맞게 갱신하기.

### 편집할 수 없다

- 새로운 사실, 경험, 취향, 책 평가를 발명하기.
- 출처가 없는 주장을 source-grounded로 격상하기.
- 인용문을 원문처럼 새로 만들기.
- 날짜를 디자인에 맞춰 임의 변경하기.
- 각 글의 기존 핵심 결론을 반대로 바꾸기.

### 글별 기록

36개 실제 콘텐츠를 모두 검토하되 억지로 문장을 바꾸지 않는다. 각 콘텐츠에는 `edited` 또는 `verified-no-change` 결과를 남기고, 실제 prose/structure가 바뀐 경우에만 `updatedAt`을 변경한다. `createdAt`은 보존한다.

각 콘텐츠 수정에는 다음을 diff 또는 편집 ledger에 남긴다.

- 원래 핵심 주장.
- 바꾼 구조.
- 삭제한 중복 또는 모호한 부분.
- 유지한 출처와 인용 경계.
- 추가 검증이 필요한 문장.
- 편집 결과와 `updatedAt` 변경 여부.

## 7. 실패와 빈 상태

- media load 실패: alt와 text hierarchy를 유지하고 broken icon이나 layout collapse를 만들지 않는다.
- cover hold: text-led review row.
- 검색 0건: 결과 없음과 제안 키워드.
- 잘못된 filter: `전체`로 정규화.
- 잘못된 thought slug: route 404. legacy article redirect 없음.
- clipboard 실패: 다시 복사할 수 있는 오류 메시지.
- 좋아요·댓글: 활성 기능처럼 보이는 hover/count/toast를 만들지 않는다.

## 8. Astro 제거 순서

Astro는 최종 상태에 남지 않지만, 책임을 잃지 않도록 다음 순서를 지킨다.

1. Astro `src/content.config.ts`에 남은 schema를 `packages/content`와 `packages/contracts`로 옮기고 동일 corpus를 검증하는 contract test를 만든다.
2. 모든 canonical public route와 metadata, sitemap, search index, media binding을 React/public release에서 생성한다.
3. 새 FORM & THOUGHT UI와 content migration을 React에만 구현한다.
4. Astro가 남아 있는 상태에서 React-only route inventory, public-release build/verify, static host, sitemap/robots/404, metadata, no-JS, accessibility와 성능 acceptance를 먼저 통과한다.
5. clean-host verifier, route inventory, performance test, reverse-proxy/rollback 문서를 React-only recovery contract로 이전하고 dangling import가 없음을 확인한다.
6. Astro-only source와 package dependency, legacy/parity/rollback script를 exact removal manifest로 제거한다. `src/lib/**` 같은 broad glob 삭제는 금지한다.
7. root scripts, root·src agent guidance, project site-change skill, README, DESIGN, architecture reference, runbook을 React-only built truth로 갱신한다.
8. clean install에서 public release build → verify → React production build를 실행하고 Astro package와 `.astro` source가 0개인지 확인한다.

과거 구현을 보존하기 위한 별도 compatibility branch는 만들지 않는다. Git history와 immutable release artifact가 복구 수단이다.
이 순서는 repository 전환을 위한 것이다. production deploy, push, traffic mutation은 별도 권한 없이는 실행하지 않는다.

## 9. 검증

### Automated

- route/nav label과 순서.
- thoughts collection schema, public filtering, canonical href.
- article→thought 이동 후 중복 slug 없음.
- article topic filter mapping.
- empty thought cells가 interactive/accessible content를 만들지 않음.
- like/comment nonfunctional contract, copy-link success/failure.
- search empty/query/no-result behavior.
- search result kind가 article/review/thought뿐이며 secondary collection이 섞이지 않음.
- image/cover fallback.
- sitemap, robots, canonical/OG metadata, static-host 404와 security header contract.
- SSR canonical links, GET filter/search와 mobile no-JS navigation.
- no private-memory import.
- no Astro dependency, script, config, source, import.
- clean `npm ci`, content validation, tests, typecheck, React production build.

### Browser

최소 desktop 1440×900, calibrated portrait reference viewport, intermediate 768px, mobile 390×844, 320px/200% zoom에서 다음을 확인한다.

- header alignment와 navigation order.
- 대응 reference와 route별 geometry.
- 긴 한글 제목, 긴 description, 다양한 book-cover ratio.
- keyboard tab order, visible focus, menu focus trap/restore.
- `lang=ko`, skip link, unique H1, semantic row link와 search label.
- 200% zoom과 reduced motion.
- image failure, empty search, invalid filter.
- console error, hydration error, horizontal overflow 0건.

### Visual acceptance

- 승인 reference와 같은 route를 같은 viewport로 capture한다.
- 먼저 영역 비율, 정렬선, type hierarchy, whitespace, color family를 비교한다.
- 그다음 텍스트 wrap과 image crop을 비교한다.
- 임의 장식이나 레퍼런스에 없는 component가 한 개라도 있으면 제거하거나 별도 승인을 받는다.

## 10. 구현 단위

이 설계는 한 번에 검증 가능한 단일 program이지만 다음 dependency 순서를 가진다.

1. React-only content/media/release contract와 thoughts migration.
2. reference viewport calibration, shared shell, tokens, header, typography.
3. 홈과 네 index route, 세 detail presentation.
4. 실제 콘텐츠 편집과 이미지 후보·승인·integration.
5. 검색, action rail, SSR/no-JS와 static-host delivery.
6. Astro 삭제 전 전체 route/browser/performance acceptance.
7. React-only release/deploy verifier 이전과 exact Astro removal.
8. built-truth 문서 동기화, clean-install 재검증.

각 단계는 이전 단계의 public contract를 깨지 않고 focused RED/GREEN과 브라우저 증거를 남긴다.
