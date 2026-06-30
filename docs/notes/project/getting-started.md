# beyondwin 시작하기

이 튜토리얼은 새 checkout에서 사이트를 실행하고, 검증 gate를 통과시키고, MDX 파일 하나가 실제 route로 이어지는 경로를 확인한다.

## 준비물

- Node.js와 npm.
- 이 저장소의 local checkout.
- dependency가 없다면 `npm install`을 실행할 수 있는 네트워크.

## Step 1: dependency 설치

repo root에서 실행한다.

```bash
npm install
```

설치되는 주요 도구는 Astro, MDX, TypeScript, Vitest, `gray-matter`, `yaml`이다.

## Step 2: 전체 검증 실행

```bash
npm run validate
```

이 명령은 아래 순서로 실행된다.

1. [scripts/validate-content.mjs](../../../scripts/validate-content.mjs): collection frontmatter와 긴 blockquote를 검사한다.
2. [scripts/article-quality.mjs](../../../scripts/article-quality.mjs): `source-grounded` article의 필수 구조를 검사한다.
3. `npm run memory:validate`: public memory projection 입력을 검사한다.
4. `npm test`: Vitest 테스트를 실행한다.
5. `npm run build`: `astro check`와 `astro build`를 실행한다.

성공하면 앞부분에 이런 출력이 보인다.

```text
Content validation passed.
Article quality validation passed.
Memory projection valid. thoughts=<n> topics=<n> edges=<n> sources=<n> excluded={...}
```

Vitest와 Astro는 그 뒤에 별도 성공 출력을 낸다.

## Step 3: 개발 서버 실행

```bash
npm run dev
```

Astro가 출력한 URL을 연다. 보통 아래 주소다.

```text
http://localhost:4321/
```

첫 화면에서 확인할 것:

- 최신 article 또는 analysis가 featured 영역에 표시된다.
- `Articles`, `Analysis`, `Reviews`, `Ideas`, `Memory` lane count가 나온다.
- tag rack과 latest list가 비어 있지 않다.

## Step 4: 주요 route 확인

개발 서버가 켜진 상태에서 아래 route를 확인한다.

| Route | 확인할 내용 |
| --- | --- |
| `/articles/` | 개발 글 listing |
| `/analysis/` | queue 기반 분석 listing |
| `/reviews/` | 책, 도구, 강의, 글 리뷰 listing |
| `/ideas/` | 아이디어 listing |
| `/travel/` | 여행 기록 listing |
| `/tags/` | 전체 공개 콘텐츠 tag index |
| `/memory/` | public memory workbench, library, sources tab |

detail route는 파일 이름에서 slug가 정해진다. 예를 들어 [src/content/articles/example-article.mdx](../../../src/content/articles/example-article.mdx)는 `/articles/example-article/`가 된다.

## Step 5: 콘텐츠 한 건 추적

[src/content/articles/example-article.mdx](../../../src/content/articles/example-article.mdx)를 연다.

이 파일은 아래 경로를 거쳐 화면에 나온다.

```text
MDX frontmatter
  -> src/content.config.ts
  -> src/lib/content.ts
  -> src/pages/articles/[slug].astro
  -> src/layouts/ArticleLayout.astro
  -> src/components/ContentCard.astro
```

각 파일의 책임:

- [src/content.config.ts](../../../src/content.config.ts): `title`, `description`, `createdAt`, `updatedAt`, `tags`, `status`, `draft`를 검사한다.
- [src/lib/content.ts](../../../src/lib/content.ts): draft 제외, 날짜 선택, route href, tag 수집, 정렬을 처리한다.
- [src/pages/articles/[slug].astro](../../../src/pages/articles/[slug].astro): non-draft article detail page를 생성한다.
- [src/layouts/ArticleLayout.astro](../../../src/layouts/ArticleLayout.astro): article body shell을 렌더링한다.
- [src/components/ContentCard.astro](../../../src/components/ContentCard.astro): listing row preview를 렌더링한다.

## 완료 상태

이 튜토리얼을 끝내면 다음을 확인한 상태다.

- dependency가 설치되어 있다.
- `npm run validate`가 통과한다.
- local site가 열린다.
- content file 한 건이 schema, helper, route, layout을 거쳐 화면에 나오는 흐름을 설명할 수 있다.

다음 작업은 [콘텐츠 운영](publishing-workflows.md)을 따른다. 정확한 schema와 script 계약은 [아키텍처 레퍼런스](architecture-reference.md)에 있다.
