# 콘텐츠 운영

이 문서는 `beyondwin`에서 콘텐츠를 추가하고 유지하는 방법을 정리한다. 모든 작업은 repo root에서 실행한다.

## 공통 완료 기준

작업을 끝내기 전에는 항상 실행한다.

```bash
npm run validate
```

검증이 실패하면 결과를 먼저 고친다. route preview가 필요한 글은 `npm run dev`로 실제 페이지까지 확인한다.

## How to Scaffold Structured Content And Media

새 record는 content와 media bundle을 함께 만든다.

```bash
npm run content:new -- <article|review|scene|idea> ...
```

예를 들어 slug와 title을 지정한다.

```bash
npm run content:new -- review --slug factfulness --title "Factfulness" --isbn 9788934985068
```

명령은 collision-safe하게 `src/content/<collection>/<slug>.mdx`와
`src/assets/content/<collection>/<slug>/media.yml`를 같이 만든다. scaffold는
언제나 `status: "review"`, `draft: true`이며, 검토 후 `status: "published"`와
`draft: false`를 모두 설정할 때만 public이다. `published && !draft` 외의 어떤
상태도 공개 조건으로 쓰지 않는다.

asset 파일과 `media.yml`은 반드시 같은
`src/assets/content/<collection>/<slug>/` 아래에 둔다. manifest item에는 `id`,
`file`, `kind`, `alt`, `credit`, 하나의 `sourceUrl` 또는 `sourcePath`,
`verifiedAt`, `rightsNote`, `checksum`을 기록한다. `book-cover`에는 source URL,
ISBN-13, edition도 필요하다.

```bash
npm run media:validate
```

이 명령은 필요할 때 쓰는 non-strict 진단이다. 전체 완료 gate인
`npm run validate`는 `npm run media:validate -- --strict`를 실행하므로 legacy
`coverImage`나 원격 image hotlink가 하나라도 남으면 실패한다. 새 media는 remote
URL을 직접 렌더링하지 말고 manifest ID (`featuredMedia`, `coverMedia`,
`leadMedia`)로 참조한다.

## How to Add An Ordinary Article

개발 글이나 기술 에세이는 `src/content/articles/`에 둔다.

1. MDX 파일을 만든다.

   ```mdx
   ---
   title: "읽을 수 있는 제목"
   description: "목록과 metadata에 보일 한 문장 요약."
   createdAt: "2026-06-30"
   updatedAt: "2026-06-30"
   tags: ["workflow"]
   status: "review"
   ---

   본문을 여기에 쓴다.
   ```

2. 직접 인용은 짧게 유지한다. [scripts/validate-content.mjs](../../../scripts/validate-content.mjs)는 blockquote 한 줄이 25단어를 넘으면 실패시킨다.

3. 검증한다.

   ```bash
   npm run validate
   ```

4. 개발 서버에서 route를 확인한다.

   ```bash
   npm run dev
   ```

   파일이 `src/content/articles/my-note.mdx`라면 `/articles/my-note/`를 연다.

## How to Add A Review

리뷰는 `src/content/reviews/`에 둔다. 책, 글, 도구, 강의, 기타 리뷰가 모두 이 lane을 쓴다.

먼저 review scaffold를 생성한다.

```bash
npm run content:new -- review --slug factfulness --title "Factfulness" --isbn 9788934985068
```

검증한 local cover를 사용할 때는 생성된 frontmatter에 `coverState`와
`coverMedia`를 추가한다.

```mdx
---
title: "Factfulness"
description: "한 문장 요약."
createdAt: "2026-06-30"
updatedAt: "2026-06-30"
tags: ["book"]
status: "review"
draft: true
itemType: "book"
itemTitle: "Factfulness"
itemAuthor: "Hans Rosling"
isbn13: "9788934985068"
rating: 4
completedAt: "2026-06-30"
sourceUrl: "https://example.com/original-review-or-source"
coverState: "verified"
coverMedia: "cover"
---

리뷰 본문.
```

이 상태는 실제 `src/assets/content/reviews/factfulness/cover.jpg`와 같은
폴더의 `media.yml` 항목이 모두 있을 때만 쓴다.

```yaml
version: 1
items:
  - id: cover
    file: cover.jpg
    kind: book-cover
    alt: 팩트풀니스 한국어판 표지
    credit: 출판사 또는 권리자
    sourceUrl: https://example.com/cover-provenance
    isbn13: "9788934985068"
    edition: 한국어판 판본 설명
    verifiedAt: "2026-06-30"
    rightsNote: 저장 및 재배포 권한 확인 내용
    checksum: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

검증한 local cover가 없다면 `coverState: "hold"`만 기록하고
`coverMedia`와 legacy `coverImage`는 모두 두지 않는다.

제약:

- `itemType`은 `book`, `article`, `tool`, `course`, `other` 중 하나다.
- `rating`은 선택값이며 0 이상 5 이하 숫자다.
- `completedAt`이 있으면 review의 표시 날짜로 우선 사용된다.
- review frontmatter의 `sourceUrl`은 원문 리뷰 또는 검토 대상의 URL이다. cover의 출처와 권리 근거는 `media.yml` item의 `sourceUrl`, `credit`, `rightsNote`에 별도로 기록한다.

### Naver review intake

Naver importer는 공개 콘텐츠를 직접 갱신하지 않는다. 기존 18개 review가 있는
`src/content/reviews/`를 기본 출력으로 사용하지 않으며, 매번 존재하지 않는 local
intake directory를 명시해야 한다.

```bash
node scripts/import-naver-reviews.mjs \
  --output docs/_inbox/naver-reviews-2026-08-13
```

생성된 MDX는 원문 title, body, 날짜, Naver `sourceUrl`을 보존하지만 항상
`status: "review"`, `draft: true`다. 발견한 cover URL은 public frontmatter에
쓰지 않고 같은 intake directory의 `naver-review-intake.json`에만 조사 단서로
남긴다. 출력 경로는 `src/`와 `public/` 아래일 수 없고, 이미 존재하는 directory는
덮어쓰지 않는다.

intake를 실제 review로 옮기기 전에는 서지와 판본을 확인하고 다음 중 하나를
선택한다.

- 검증된 local cover와 완전한 `media.yml`이 있으면 `coverState: "verified"`와
  `coverMedia: "cover"`를 쓴다.
- 판본과 source-identical image를 검증하지 못하면 `coverState: "hold"`만 쓴다.
- 본문에서 뽑은 `verdict`는 작성자 승인을 받기 전에는 frontmatter로 옮기지 않는다.

기존 18개 Naver review 마이그레이션에서는 17개 표지를 판본 식별용 local
asset으로 옮겼고, 재배포 권한이 별도로 확인되지 않았다는 provenance warning을
보존했다. `devotion-of-suspect-x`는 확인한 동일 판본 이미지가 repository의
300px 최소 폭을 충족하지 않아 `coverState: "hold"`로 남는다. 18개 verdict는
원문 첫 판단 문장과 동일한 후보를 작성자가 명시적으로 승인한 뒤에만 적용했다.
`doing-good-better`가 올바른 canonical slug이며, 이전
`/reviews/the-life-you-can-save/` 경로는 adapter 없는 static build에서 새 경로를
가리키는 meta-refresh HTML을 생성한다. 이 동작을 HTTP 301로 설명하지 않는다.

## How to Add An Idea

아이디어는 `src/content/ideas/`에 둔다.

```mdx
---
title: "Idea title"
description: "짧은 요약."
createdAt: "2026-06-30"
updatedAt: "2026-06-30"
tags: ["product"]
status: "review"
maturity: "sketch"
---
```

`maturity`는 `seed`, `sketch`, `proposal` 중 하나다. 값이 없으면 Astro schema에서는 `sketch`가 기본값이지만, 현재 content validation script는 ideas에서 `maturity`를 필수로 요구한다. 그래서 파일에는 명시한다.

## How to Add A Travel Note

여행 기록은 `src/content/travel/`에 둔다.

```mdx
---
title: "Place note"
description: "짧은 요약."
createdAt: "2026-06-30"
updatedAt: "2026-06-30"
tags: ["travel"]
status: "review"
location: "Seoul"
visitedAt: "2026-06-30"
---
```

`visitedAt`이 있으면 travel note의 표시 날짜로 우선 사용된다.
`status: "published"`로 바꾸기 전에는 `privacyReviewed: true`와 검증된 local
asset을 가리키는 `leadMedia`가 모두 필요하다. review/draft scaffold에는 이 공개
전용 필드를 요구하지 않는다.

모든 collection에서 `updatedAt`은 `createdAt`보다 빠를 수 없다. published review는
`itemAuthor`, 유효한 `isbn13`, `publisher`, 승인된 `verdict`, `coverState`가 필요하다.
`coverState: "verified"`는 `coverMedia`를 요구하고 `coverState: "hold"`는 이를
금지한다. 이 조건은 `npm run validate`의 content gate에서 검사된다.

## How to Create A Source-Grounded Article Draft

외부 자료나 저장소를 깊게 읽고 쓰는 article은 evidence packet과 article draft를 같이 만든다.

```bash
npm run article:new -- ...
```

실제 호출에서는 source label, `--title`, `--slug`를 제공한다.

생성물:

- `docs/notes/article-factory/lazycodex.md`
- `src/content/articles/lazycodex.mdx`

생성된 article에는 `source-grounded` tag가 들어간다. 이 tag가 있으면 `npm run article:quality`가 아래 heading을 모두 요구한다.

- `## 먼저 알아야 할 개념`
- `## 실제 구조`
- `## 핵심 기능`
- `## 좋은 점`
- `## 조심해야 할 점`
- `## 언제 쓰면 좋은가`
- `## 주니어 개발자가 배울 점`
- `## 내 결론`
- `## 확인한 자료`

운영 순서:

1. packet의 `Source Inventory`와 `Evidence Ledger`를 먼저 채운다.
2. 공식 문서, GitHub source, release note, local clone 같은 근거를 확인한다.
3. article scaffold의 일반 문장을 실제 주장과 근거로 바꾼다.
4. `## 확인한 자료`에 최소 하나 이상의 URL을 둔다.
5. `npm run validate`를 실행한다.

## How to Process A Queue Item

queue sync는 [SYNC.md](../../../SYNC.md)를 따른다.

1. [queue.md](../../../queue.md)에 unchecked URL과 `comment:`를 둔다.

   ```md
   - [ ] https://example.com/some-article
     comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
   ```

2. source URL을 직접 읽는다. source-specific fact는 기억으로 채우지 않는다.

3. `src/content/analysis/`에 MDX를 만든다.

   ```mdx
   ---
   title: "Clear generated title"
   description: "One sentence summary."
   sourceUrl: "https://example.com/source"
   sourceTitle: "Original source title"
   comment: "Original queue comment"
   format: "research-report"
   createdAt: "2026-06-30"
   updatedAt: "2026-06-30"
   tags: ["strategy"]
   status: "review"
   draft: false
   ---
   ```

4. `format`은 `research-report`, `essay`, `visual-page` 중 하나다.

5. 검증한다.

   ```bash
   npm run validate
   ```

6. 처리 결과를 queue item에 기록한다.

   ```md
   - [x] https://example.com/some-article
     comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
     output: src/content/analysis/some-article.mdx
     pr: https://github.com/owner/repo/pull/123
   ```

source 접근이 막히면 글을 억지로 만들지 않는다.

```md
- [ ] https://example.com/paywalled
  comment: 사업적 시사점 중심으로.
  status: blocked
  error: paywall or access restriction
```

## How to Review And Project Public Memory

`/memory`는 private source를 직접 읽지 않는다. 공개 페이지는 [src/data/memory.public.json](../../../src/data/memory.public.json)만 읽는다.

1. 후보를 생성한다.

   ```bash
   npm run memory:seed
   ```

2. 후보를 읽기 쉬운 local report로 만든다.

   ```bash
   npm run memory:review -- report
   ```

   이 명령은 `memory/review/queue.md`를 만든다. 이 파일과 JSONL queue는 local review artifact이며 commit하지 않는다.

3. 공개해도 되는 후보 하나를 명시적으로 승격한다.

   ```bash
   npm run memory:review -- promote <slug> --reviewed-at 2026-07-05
   ```

   이 명령은 `memory/thoughts/<slug>.md`를 만든다. 승격된 thought는 `confidentiality: public`, `surfaces: [memory-public, article-ready]`, `review.status: accepted`를 가진다.

4. 공개 projection을 생성한다.

   ```bash
   npm run memory:project
   ```

5. JSON을 쓰지 않고 검증만 하려면 실행한다.

   ```bash
   npm run memory:validate
   ```

6. 전체 gate를 통과시킨다.

   ```bash
   npm run validate
   ```

주의:

- `memory/review/*.jsonl`과 `memory/review/*.md`는 local review artifact다.
- 승격 명령은 duplicate slug, 안전하지 않은 source path, 존재하지 않는 source path를 거부한다.
- public route는 `memory/**`를 직접 읽지 않는다.

## How to Maintain Archive Docs

`docs/`는 source, curated note, generated navigation을 분리한다.

| Layer | Use |
| --- | --- |
| `docs/_inbox/` | 아직 분류하지 않은 local intake |
| `docs/raw/` | 원문 wording과 provenance가 중요한 source capture |
| `docs/notes/<topic>/` | 사람이 다듬은 장기 보관 문서 |
| `docs/wiki/` | 생성된 navigation |

curated note를 추가하거나 옮길 때:

1. 파일을 `docs/notes/<topic>/` 아래에 둔다.
2. [docs/_index/catalog.yml](../../_index/catalog.yml)에 항목을 추가하거나 수정한다.
3. 안정적인 retrieval category가 새로 생겼다면 [docs/_index/topics.yml](../../_index/topics.yml)을 갱신한다.
4. [docs/INDEX.md](../../INDEX.md)를 갱신한다.

`docs/wiki/`는 source of truth가 아니다. 중요한 답변은 `docs/raw/` 또는 `docs/notes/`에서 다시 확인한다.

## Focused Verification

작업 종류에 따라 더 빠른 명령을 먼저 돌릴 수 있다.

```bash
npm run media:validate
npm run article:quality
npm run memory:validate
npm test
npm run build
```

마지막에는 `npm run validate`로 묶어서 확인한다.

## Troubleshooting

`Content validation failed`
: 누락된 frontmatter, 잘못된 `status`, 배열이 아닌 `tags`, 잘못된 URL, 25단어 초과 blockquote를 확인한다.

`Article quality validation failed`
: `source-grounded` article의 필수 heading, thesis paragraph, placeholder marker, 중복 `##` heading, `## 확인한 자료`의 URL을 확인한다.

`Memory projection valid`에서 excluded count가 예상보다 크다
: 출력의 `excluded={...}`를 본다. 흔한 이유는 `private`, `notAccepted`, `notPublicSurface`, `missingSource`, `invalidSource`, `unsupportedSchema`다.

Astro route가 보이지 않는다
: 파일이 올바른 collection 폴더에 있는지, `status: "published"`와 `draft: false`가 모두 맞는지, 파일명이 route slug와 맞는지 확인한다. 개발 서버의 content state가 꼬였으면 서버를 재시작한다. list와 detail route는 모두 shared `published && !draft` selector를 사용한다.

실제 article source 16개 중 현재 공개된 것은 12개다.
`agents-md-vs-agent-skills-evidence`, `aws-static-frontend-serverless-bff`,
`shared-ai-conversation-evidence-boundaries`, `uncle-bob-ai-code-review-evidence`
4개는 publication authorization이 없어 의도적으로 `status: review`를 유지한다.
검증 또는 migration 위험 해소 요청만으로 이 상태를 바꾸지 않는다.
