# 공개 글·책 독서 지면 설계

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](README.md)과 ADR을 본다.

- Status: approved, implemented
- Approved: 2026-08-27
- Decision: [ADR-0006](../adr/0006-unified-public-reading-continuity.md)
- Related decisions: [ADR-0002](../adr/0002-consumer-grade-visual-experience.md), [ADR-0003](../adr/0003-visual-storyworld-experience-model.md)
- Related designs: [Public reading continuity](public-reading-continuity-design.md)

## 1. Purpose

React 공개 사이트는 이미 장면과 독서를 한 visual world의 두 mode로 나눈다. 크롬, Continuity threshold, contextual return, `이어서 읽기`는 있다. 글·책 목록은 공통 행 목록이고, 글 상세는 제목·요약·본문이다.

이 작업은 그 문법을 바꾸지 않는다. Astro 독서 지면이 갖고 있던 밀도를 mineral reading mode로 옮긴다. 방문자는 글 목록에서 조사와 에세이를 구분하고, 긴 조사 글에서 절로 이동하고, 책 목록에서 표지와 한 줄 판정을 물체로 본다.

완료된 experience는 다음을 만족한다.

1. `/articles/`가 리드 하나와 장부인 팸플릿이다. 카드 그리드가 아니다.
2. 조사 글 상세에서 절 목록으로 이동할 수 있고, `확인한 자료`는 본문 밖 colophon이다.
3. `/reviews/`가 최근 표지 객체와 연도별 일기다. 모바일에서 제목과 판정을 숨기지 않는다.
4. 장면 → 읽기 → 목록 또는 장면 복귀 계약이 그대로다.

## 2. Scope

### Included

| Surface | Routes | Required change |
| --- | --- | --- |
| 글 목록 | `/articles/` | 팸플릿. 리드 + `조사`/`에세이` 장부. |
| 글 상세 | `/articles/[slug]/` | 종 kicker, 한 줄 이해, 조사 TOC, figure 밀도, 질문/짧은 판단 접힘, `확인한 자료` colophon. |
| 책 목록 | `/reviews/` | 최근 8권 표지 객체 + 연도별 일기. |
| 책 상세 | `/reviews/[slug]/` | 표지·판정·판본·이어서 읽기 유지. 헤더 잔여 표지를 다시 꽂지 않음. |

공개 record 스키마, release manifest field, 장면, 찾기, 기억, 보조 lane, 작업실, Astro 제거는 범위가 아니다.

### Excluded

- `/` Staged Aperture와 Continuity Zoom 재설계.
- 두 번째 장면, 자동 장면, 자동 추천.
- `/search/`, `/memory/`, `/tags/`, `/analysis/`, `/ideas/`, `/travel/`.
- `CollectionPage` / `RecordRow`를 글·책 전용으로 확장하는 일. 보조 lane과 태그는 행 목록을 유지한다.
- relationship을 `이전 쇄`로 표시. `남은 문장` aside 부활. 둘 다 `이어서 읽기`가 담당한다.
- press-proof crop mark, `+` mark, 회색 부스, 본문을 장면으로 만들기.
- 새 public schema field, 새 content lane, 콘텐츠 재작성, 메모리 승격.
- 새 클라이언트 JavaScript. 절 목록은 서버 렌더 앵커다. sticky TOC, scrollspy, 라이트박스는 없다.
- 작업실, Fastify, PostgreSQL, 프로덕션 cutover, Astro 제거.
- 워킹트리의 verified release-asset 미들웨어.

새 ADR은 만들지 않는다. 구현이 통과한 뒤에만 `DESIGN.md`의 글·책 reading 설명을 React built truth로 맞춘다.

## 3. Experience

공유 토큰은 유지한다. mineral field, optical-white sheet, rich ink, cobalt interaction, 본문 42em, desktop 17px/1.9, mobile 16px. 글 목록에 이미지를 넣지 않는다. 책 표지에만 제한 그림자를 허용한다.

### `/articles/`

공개 글이 있으면 리드 하나와 장부가 있다. 없으면 `아직 공개한 글이 없습니다.`

리드 선택: 공개 집합에 `graphify-code-knowledge-graph-deep-dive`가 있으면 그 글, 없으면 `updatedAt` 최신, 동률이면 `id` 오름차순. 이 값은 이미 `apps/site/app/release.server.ts`의 `PREFERRED_PUBLIC_ARTICLE_LEAD_ID`와 같다. 목록 UI는 “정렬된 첫 행이 리드”라고 가정하지 않는다. presentation helper가 리드를 고르고 장부에서 제외한다.

리드 표시: 종 구분, 제목, 한 줄 이해. 장부 행: 월, 제목, 한 줄 이해, `조사 · 근거` 또는 `에세이`. 월은 `updatedAt`의 UTC 월을 `7월` 형식으로 쓴다.

종 구분: `evidenceState === "source-grounded"` 이거나 `tags`에 `source-grounded`가 있으면 `조사`, 아니면 `에세이`. 필드 이름을 화면에 쓰지 않는다.

한 줄 이해: `bodyHtml` 첫 `<p>` 안의 첫 `<strong>` 또는 `<b>` 텍스트. 없으면 `description`. `dek` field를 만들지 않는다.

리드와 장부 링크는 기존 `OriginLink`와 `record-articles-<id>` 앵커를 유지한다.

### `/articles/[slug]/`

`ReadingThreshold`와 `ContinueReading`은 유지한다. 내비 공개 명사는 `글`이다. threshold kicker는 `조사 · n분` 또는 `에세이`다. 읽기 분량은 태그 제거한 `bodyHtml` 어절 수를 260으로 나눈 뒤 반올림하고 최소 1이다.

제목 아래 한 줄 이해를 둔다. 현재 `record.description`을 요약으로 쓰는 자리는 이 한 줄 이해로 바꾼다. description과 한 줄 이해가 같으면 한 번만 보여준다.

조사 글이고 `확인한 자료`를 뺀 h2가 두 개 이상이면 본문 **앞**에 절 목록을 둔다. 각 항목은 `#` + heading id 해시 링크다. 에세이, 절 하나, 절 없음에서는 TOC를 그리지 않는다.

`확인한 자료` 절은 본문 HTML에서 분리해 본문 아래 colophon으로 옮긴다. heading 텍스트 또는 id가 `확인한-자료` / `확인한 자료`이면 그 h2부터 끝까지가 colophon이다. 본문 안에서는 반복하지 않는다. 해당 절이 없으면 colophon 블록 자체가 없다.

figure는 기존 MDX `Figure`다. 42em 안에 두고 캡션·출처를 조용히 붙인다. 카드, 그림자, 라이트박스, measure 밖 장면형 배치는 없다.

질문과 짧은 판단이 함께 있는 표는 조사 글에서만 `<details>`로 접고 summary는 `질문과 짧은 판단`이다. 에세이 표와 그 외 표는 접지 않는다.

### `/reviews/`

최근 8권을 표지 객체로 보여 주고, 그 아래 전체 공개 책을 연도별 일기로 나열한다. 정렬 키는 `completedAt ?? createdAt` 내림차순, 동률이면 `id` 오름차순이다. 객체 격자는 4개씩 최대 두 줄이다.

각 객체: 표지 또는 텍스트 판, 제목, 저자, 한 줄 판정. 일기는 연도 heading 아래 작은 표지 또는 판, 제목, 한 줄 판정. 한 줄 판정은 `verdict ?? description`의 첫 문장이다. 문장 끝 구분자는 `.`, `!`, `?`다. 없으면 전체 문자열이다.

`coverState === "verified"`이고 해당 `coverMedia` asset이 release에 있을 때만 raster 표지를 쓴다. 아니면 제목·저자 텍스트 판으로 구멍을 메운다. 모바일에서도 제목과 판정을 숨기지 않는다. 표지에만 그림자를 허용한다.

객체와 일기 링크는 `OriginLink`와 `record-reviews-<id>` 앵커를 유지한다. 없으면 `아직 공개한 책이 없습니다.`

### `/reviews/[slug]/`

현재 표지 threshold, 저자, 판본, 읽은 달, 판정, 본문, `이어서 읽기`를 유지한다. Astro header remnant 표지를 다시 넣지 않는다.

## 4. Components and data flow

공개 release 스키마는 그대로다. TOC, colophon, 종 구분, 리드, 책장 배치는 공개 record와 이미 resolve된 asset에서 파생한다. 컴포넌트는 manifest 경로나 `media.yml`을 해석하지 않는다.

### Presentation helpers

순수 함수로 `apps/site`에 두고 focused 테스트로 고정한다.

| Helper | Input | Output |
| --- | --- | --- |
| 글 종/한 줄 이해/분량 | article public record | `조사`/`에세이`, stake, reading minutes, `hasEvidence` |
| 글 본문 분리 | `bodyHtml` | `proseHtml`, h2 TOC items, optional `colophonHtml` |
| 글 목록 | 공개 article records | `{ lead, ledger }` |
| 책장 | 공개 review records + resolved covers | 최근 8권 2단, 연도 일기, 표지 또는 텍스트 판 |

파일 이름은 구현 시 `apps/site/src/ui/articles/`와 `apps/site/src/ui/reviews/` 아래에 둔다. Astro `src/lib/recordsPresentation.ts`와 `src/lib/bookshelfPresentation.ts`는 이식 참고이며 edit target이 아니다.

### UI

- `ArticleIndexPage`가 `/articles/`를 렌더한다. `CollectionPage`를 쓰지 않는다.
- `BookIndexPage`가 `/reviews/`를 렌더한다.
- `ArticleReadingPage`가 kicker, 한 줄 이해, TOC, prose, colophon을 받는다.
- `ReviewReadingPage`, `ReadingThreshold`, `ContextReturn`, `ContinueReading`은 계약 유지.
- `articles-index` / `reviews-index` loader가 presentation 입력과 이미 resolve된 표지를 만든다.
- 글 목록 critical CSS는 장면 CSS와 `route-collections.css`를 포함하지 않는다. 책 목록도 같다. 글/책 목록 스타일은 각각 `route-article.css`, `route-review.css`에 둔다.

보조 lane의 `CollectionPage` 행 목록은 그대로 둔다. 태그와 찾기의 글/책 결과는 지금처럼 행이다. 이 작업의 팸플릿·책장은 canonical 글/책 index에만 적용한다.

### MDX table fold

조사 글 compile 때만 trusted MDX `table` 매핑이 표 HTML에 `질문`과 `짧은 판단`이 모두 있으면 `<details class="article-brief">`로 감싼다. 이 플래그는 release build가 article species로 결정하며 `bodyHtml`에 접힌 마크업이 들어간다. 공개 스키마 field는 추가하지 않는다. JSX allowlist(`Figure`, `Callout`)는 바꾸지 않는다. GFM table만 매핑한다.

TOC와 colophon은 사이트에서 `bodyHtml`을 나눈다. heading id는 기존 `rehype-slug` 결과를 쓴다. HTML 파서 의존성을 추가하지 않는다.

## 5. Empty and error behavior

| Condition | Behavior |
| --- | --- |
| 공개 글 없음 | `아직 공개한 글이 없습니다.` |
| preferred 리드가 비공개 | `updatedAt` 최신 글을 리드로 |
| 조사인데 TOC h2 < 2 | TOC 생략 |
| `확인한 자료` 없음 | colophon 생략 |
| 한 줄 이해용 strong 없음 | `description` |
| 에세이 또는 일반 표 | 접지 않음 |
| 표지 HOLD 또는 asset 없음 | 텍스트 판 |
| `이어서 읽기` 0개 | 목록 링크만 |
| 잘못된 heading id | 해당 TOC 항목 생략 |
| JavaScript 없음 | 팸플릿, 책장, 절 해시, 읽기, 목록 fallback이 동작 |

origin 파싱, clean canonical href, modified click, 장면 복귀는 [reading continuity 설계](public-reading-continuity-design.md) 계약을 따른다.

## 6. Verification

구현은 focused RED/GREEN 뒤에만 본 코드를 바꾼다. 새 클라이언트 JS를 넣지 않는다.

### Focused tests

- 종 구분, 한 줄 이해, 분량, preferred 리드와 fallback, 장부에서 리드 제외.
- TOC가 `확인한 자료`를 빼고, 두 개 미만이면 비어 있음.
- colophon 분리 후 본문에 해당 절이 없음.
- 조사 글의 질문/짧은 판단 표만 `<details>`, 에세이·일반 표는 `<table>`.
- 책: 8권 2단, 연도 묶기, 한 줄 판정, verified 표지 vs HOLD 판.
- `/articles/` 마크업이 팸플릿이고 CollectionPage 행이 아님. canonical href와 record anchor 유지.
- `/reviews/` 마크업이 표지 객체와 일기를 가짐.
- 글/책 상세가 threshold, 복귀, `이어서 읽기`를 유지.
- CSS accounting: 글/책 목록 스타일이 해당 route에만 있고 장면 CSS와 섞이지 않음.

### Browser

데스크톱 1440과 모바일 390에서 다음을 확인한다.

- `/articles/`
- 조사 상세, figure 포함: `/articles/pgvector-hybrid-search/`
- 에세이 상세: `/articles/why-i-read-in-the-ai-era/`
- `/reviews/`
- 책 상세 하나, 예: `/reviews/doing-good-better/`
- 장면 → 글 읽기 → 목록 또는 장면 복귀
- 긴 한국어 제목 overflow 없음, 모바일 책 제목·판정 보임, 보이는 포커스, `prefers-reduced-motion`, 콘솔 에러 없음

### Final gates

- 영향 받는 focused tests.
- `npm run validate`
- `git diff --check`
- 구현 통과 후 `DESIGN.md`의 글 팸플릿·책 목록 설명을 React reading world 기준으로 갱신. 구현 전에는 shipped된 것처럼 쓰지 않는다.
- 관련 ADR은 그대로다. 구현이 ADR-0006의 reading mode와 모순되면 구현을 고친다.

## 7. Documentation

이 문서는 implementation plan의 source of truth다. Astro 글 팸플릿과 책장은 이식 참고이며, press-proof 장식을 가져오지 않는다.

구현 후 갱신:

- `DESIGN.md` reading route 절. 회색 부스/재단선 설명이 현재 공개 사이트 built truth인 것처럼 남지 않게 한다.
- 필요하면 [아키텍처 레퍼런스](../architecture-reference.md)의 글/책 목록 표현. Astro rollback 설명과 React built truth를 섞지 않는다.

구현 전 갱신하지 않는 것: ADR, 공개 콘텐츠, public memory, 장면 정의.
