# 콘텐츠 운영

이 문서는 `beyondwin`에서 콘텐츠를 추가하고 유지하는 방법을 정리한다. 모든 작업은 repo root에서 실행한다.

## 공통 완료 기준

작업을 끝내기 전에는 항상 실행한다.

```bash
npm run validate
```

검증이 실패하면 결과를 먼저 고친다. route preview가 필요한 글은 `npm run dev`로 실제 페이지까지 확인한다.

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

```mdx
---
title: "공개 리뷰 제목"
description: "한 문장 요약."
createdAt: "2026-06-30"
updatedAt: "2026-06-30"
tags: ["book"]
status: "review"
itemType: "book"
itemTitle: "원본 항목 제목"
itemAuthor: "Author name"
rating: 4
completedAt: "2026-06-30"
sourceUrl: "https://example.com/original"
coverImage: "https://example.com/cover.jpg"
---

리뷰 본문.
```

제약:

- `itemType`은 `book`, `article`, `tool`, `course`, `other` 중 하나다.
- `rating`은 선택값이며 0 이상 5 이하 숫자다.
- `completedAt`이 있으면 review의 표시 날짜로 우선 사용된다.
- `sourceUrl`과 `coverImage`는 있으면 유효한 URL이어야 한다.

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

## How to Create A Source-Grounded Article Draft

외부 자료나 저장소를 깊게 읽고 쓰는 article은 evidence packet과 article draft를 같이 만든다.

```bash
npm run article:new -- "LazyCodex" --title "LazyCodex는 Codex를 어떻게 바꾸는가" --slug "lazycodex"
```

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

## How to Project Public Memory

`/memory`는 private source를 직접 읽지 않는다. 공개 페이지는 [src/data/memory.public.json](../../../src/data/memory.public.json)만 읽는다.

1. thought를 `memory/thoughts/`에 둔다.

2. public export 조건을 모두 맞춘다.

   ```yaml
   schema_version: 1
   confidentiality: public
   surfaces: [memory-public]
   review:
     status: accepted
   sources:
     - kind: article
       path: src/content/articles/example-article.mdx
       title: "Example Article"
   ```

3. projection을 생성한다.

   ```bash
   npm run memory:project
   ```

4. JSON을 쓰지 않고 검증만 하려면 실행한다.

   ```bash
   npm run memory:validate
   ```

5. `/memory/`에서 Workbench, Library, Sources tab을 확인한다.

주의:

- `confidentiality: private`는 export되지 않는다.
- `review.status`가 `accepted`가 아니면 export되지 않는다.
- local source path는 repo 내부의 안전한 relative path여야 한다.
- external source URL은 `http` 또는 `https`만 허용한다.

## How to Maintain Archive Docs

`docs/`는 source, curated note, generated navigation을 분리한다.

| Layer | Use |
| --- | --- |
| `docs/_inbox/` | 아직 분류하지 않은 local intake |
| `docs/raw/` | 원문 wording과 provenance가 중요한 source capture |
| `docs/notes/<topic>/` | 사람이 다듬은 장기 보관 문서 |
| `docs/wiki/` | 생성된 navigation |
| `graphify-out/` | 생성된 knowledge graph |

curated note를 추가하거나 옮길 때:

1. 파일을 `docs/notes/<topic>/` 아래에 둔다.
2. [docs/_index/catalog.yml](../../_index/catalog.yml)에 항목을 추가하거나 수정한다.
3. 안정적인 retrieval category가 새로 생겼다면 [docs/_index/topics.yml](../../_index/topics.yml)을 갱신한다.
4. [docs/INDEX.md](../../INDEX.md)를 갱신한다.

`docs/wiki/`와 `graphify-out/`은 source of truth가 아니다. 중요한 답변은 `docs/raw/` 또는 `docs/notes/`에서 다시 확인한다.

## Focused Verification

작업 종류에 따라 더 빠른 명령을 먼저 돌릴 수 있다.

```bash
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
: 파일이 올바른 collection 폴더에 있는지, `draft: true`가 아닌지, 파일명이 route slug와 맞는지 확인한다. 개발 서버의 content state가 꼬였으면 서버를 재시작한다.

Graphify 갱신이 실패한다
: code file을 수정했다면 `graphify update .`를 다시 실행한다. graph node 수가 줄어 overwrite를 거부하는 경우에는 변경 의도를 확인한 뒤 `graphify update . --force`를 쓴다.
