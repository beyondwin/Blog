# 공개 글·책 독서 지면 Implementation Plan

> 종료 기록이다. 현재 운영 지침이 아니다. [레거시 종료 기록](README.md)과 ADR을 본다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React 공개 사이트의 `/articles/`를 팸플릿으로, `/reviews/`를 표지 객체+연도 일기로, 조사 글 상세를 TOC/colophon/표 접힘이 있는 독서 지면으로 옮긴다.

**Architecture:** 공개 release 스키마는 그대로 둔다. 글/책 목록 presentation은 `apps/site` 순수 함수가 공개 record에서 파생하고, 질문/짧은 판단 표만 `packages/content` MDX compile이 조사 글 `bodyHtml`에 접어 넣는다. `CollectionPage`는 보조 lane에 남긴다. 장면 문법, origin, `이어서 읽기`는 유지한다.

**Tech Stack:** Node 24 (`/opt/homebrew/opt/node@24/bin`), npm workspaces, React Router 8 `apps/site`, `@beyondwin/contracts`, `@beyondwin/content` trusted MDX, Vitest 4, Playwright CLI.

**Spec:** [docs/notes/project/reading-surface-density-design.md](reading-surface-density-design.md)

## Global Constraints

- Node 24만 사용한다: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- 새 npm dependency, 새 HTML 파서, 새 클라이언트 JavaScript를 추가하지 않는다.
- 공개 record schema와 release manifest field를 추가하지 않는다.
- `CollectionPage` / `RecordRow`를 글·책 전용으로 확장하지 않는다. 보조 lane·태그·찾기는 행 목록을 유지한다.
- 장면(`/`), Continuity Zoom, origin transport, `ContextReturn`, `ContinueReading` 계약을 바꾸지 않는다.
- relationship을 `이전 쇄`로 표시하지 않는다. `남은 문장` aside를 부활시키지 않는다.
- press-proof 재단선, `+` mark, 회색 부스를 가져오지 않는다.
- 워킹트리의 `apps/site/verified-release-assets.ts`, `apps/site/vite.config.ts`, `apps/site/build-static-export.ts`, `apps/site/.gitignore`, 루트 `beyondwin-*.png`는 이 작업과 무관하다. stage하지 않는다.
- 기존 dev server를 종료하거나 포트를 빼앗지 않는다. 미리보기는 4384 이상 별도 port를 사용한다.
- 커밋은 해당 task Files에 적힌 경로만 stage한다. push하지 않는다.
- 구현이 ADR-0006 reading mode와 모순되면 구현을 고친다. 새 ADR을 만들지 않는다.
- `DESIGN.md`는 Task 7 전에 shipped된 것처럼 고치지 않는다.

## File map

| File | Responsibility |
| --- | --- |
| `apps/site/src/ui/articles/articlePresentation.ts` | 종 구분, 한 줄 이해, 분량, 본문 분리, 리드/장부, 상세 presentation |
| `apps/site/src/ui/articles/ArticleIndexPage.tsx` | `/articles/` 팸플릿 |
| `apps/site/src/ui/reading/ArticleReadingPage.tsx` | kicker, 한 줄 이해, TOC, prose, colophon |
| `apps/site/src/ui/reviews/bookshelfPresentation.ts` | 최근 8권 2단, 연도 일기, 한 줄 판정, 표지 선택 |
| `apps/site/src/ui/reviews/BookIndexPage.tsx` | `/reviews/` 표지 객체 + 일기 |
| `apps/site/app/routes/articles-index.tsx` | 팸플릿 loader/presentation |
| `apps/site/app/routes/reviews-index.tsx` | 책장 loader/presentation |
| `apps/site/app/release.server.ts` | preferred lead id를 article presentation에서 import |
| `apps/site/src/ui/styles/route-article.css` | 팸플릿, TOC, figure, brief, colophon |
| `apps/site/src/ui/styles/route-review.css` | 표지 격자, 일기, 텍스트 판 |
| `packages/content/src/mdx/components.tsx` | 조사 글 질문/짧은 판단 표 `<details>` |
| `packages/content/src/release/build-release.ts` | `foldBriefTable` 전달, renderer v3 |
| `DESIGN.md` | 구현 후 React 글/책 지면 built truth |

---

### Task 1: Article presentation helpers

**Files:**
- Create: `apps/site/src/ui/articles/articlePresentation.ts`
- Test: `apps/site/test/ui/article-presentation.test.ts`
- Modify: `apps/site/app/release.server.ts` (preferred lead constant만 재export)

**Interfaces:**
- Consumes: `Extract<PublicRecord, { collection: 'articles' }>`
- Produces:

```ts
export const PREFERRED_PUBLIC_ARTICLE_LEAD_ID = 'graphify-code-knowledge-graph-deep-dive';
export type ArticleSpecies = '조사' | '에세이';
export type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
export interface ArticleTocItem { href: string; label: string }
export interface ArticleIndexItem {
  id: string;
  href: string;
  title: string;
  stake: string;
  monthLabel: string;
  species: ArticleSpecies;
  hasEvidence: boolean;
}
export interface ArticleReadingPresentation {
  species: ArticleSpecies;
  kicker: string;
  stake: string;
  toc: ArticleTocItem[];
  proseHtml: string;
  colophonHtml?: string;
}
export function articleSpecies(record: Pick<ArticleRecord, 'evidenceState' | 'tags'>): ArticleSpecies;
export function articleStake(record: Pick<ArticleRecord, 'bodyHtml' | 'description'>): string;
export function articleReadingMinutes(bodyHtml: string): number;
export function splitArticleBody(bodyHtml: string): {
  proseHtml: string;
  toc: ArticleTocItem[];
  colophonHtml?: string;
};
export function buildArticleIndex(records: readonly ArticleRecord[]): {
  lead?: ArticleIndexItem;
  ledger: ArticleIndexItem[];
};
export function articleReadingPresentation(record: ArticleRecord): ArticleReadingPresentation;
```

- [ ] **Step 1: Write the failing test**

Create `apps/site/test/ui/article-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import {
  PREFERRED_PUBLIC_ARTICLE_LEAD_ID,
  articleReadingMinutes,
  articleReadingPresentation,
  articleSpecies,
  articleStake,
  buildArticleIndex,
  splitArticleBody,
} from '../../src/ui/articles/articlePresentation';

const base = {
  collection: 'articles' as const,
  description: '설명 문장.',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  tags: [] as string[],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>본문</p>',
};

function article(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    id,
    href: `/articles/${id}/`,
    title: id,
    ...overrides,
  } as ArticleRecord;
}

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

describe('article presentation', () => {
  it('marks source-grounded work as 조사 without exposing field names', () => {
    expect(articleSpecies(article('g', { tags: ['source-grounded'] }))).toBe('조사');
    expect(articleSpecies(article('e', { evidenceState: 'source-grounded' }))).toBe('조사');
    expect(articleSpecies(article('n', { tags: ['AI'] }))).toBe('에세이');
  });

  it('uses the first strong in the first paragraph as the stake', () => {
    const record = article('g', {
      bodyHtml: '<p>Intro. <strong>단독 진실 공급원으로 쓰기에는 아직 위험하다.</strong></p><p>다음</p>',
    });
    expect(articleStake(record)).toBe('단독 진실 공급원으로 쓰기에는 아직 위험하다.');
  });

  it('falls back to description when the first paragraph has no strong', () => {
    expect(articleStake(article('g'))).toBe('설명 문장.');
  });

  it('counts reading minutes from stripped HTML words', () => {
    expect(articleReadingMinutes('<p>one</p>')).toBe(1);
    expect(articleReadingMinutes(`<p>${'word '.repeat(390)}</p>`)).toBe(2);
  });

  it('splits 확인한 자료 out of prose and keeps other h2s for TOC', () => {
    const split = splitArticleBody([
      '<h2 id="실제-구조">실제 구조</h2><p>A</p>',
      '<h2 id="내-결론">내 결론</h2><p>B</p>',
      '<h2 id="확인한-자료">확인한 자료</h2><ul><li>Source</li></ul>',
    ].join(''));
    expect(split.toc.map((item) => item.label)).toEqual(['실제 구조', '내 결론']);
    expect(split.proseHtml).not.toContain('확인한 자료');
    expect(split.colophonHtml).toContain('확인한 자료');
    expect(split.colophonHtml).toContain('Source');
  });

  it('builds a preferred lead plus a ledger in input order', () => {
    const lead = article(PREFERRED_PUBLIC_ARTICLE_LEAD_ID, {
      tags: ['source-grounded'],
      updatedAt: '2026-01-01T00:00:00.000Z',
      bodyHtml: '<p><strong>그래프가 중심이다.</strong></p>',
    });
    const newer = article('why-i-read-in-the-ai-era', { updatedAt: '2026-08-01T00:00:00.000Z' });
    const result = buildArticleIndex([newer, lead]);
    expect(result.lead?.id).toBe(PREFERRED_PUBLIC_ARTICLE_LEAD_ID);
    expect(result.lead?.species).toBe('조사');
    expect(result.lead?.hasEvidence).toBe(true);
    expect(result.lead?.monthLabel).toBe('1월');
    expect(result.lead?.stake).toBe('그래프가 중심이다.');
    expect(result.ledger.map((item) => item.id)).toEqual(['why-i-read-in-the-ai-era']);
  });

  it('falls back to newest updatedAt when the preferred lead is absent', () => {
    const older = article('old', { updatedAt: '2026-01-01T00:00:00.000Z' });
    const newest = article('new', { updatedAt: '2026-08-01T00:00:00.000Z' });
    expect(buildArticleIndex([older, newest]).lead?.id).toBe('new');
  });

  it('shows 조사 TOC only when two or more non-colophon headings exist', () => {
    const investigation = article('g', {
      tags: ['source-grounded'],
      bodyHtml: [
        '<p>Intro</p>',
        '<h2 id="실제-구조">실제 구조</h2><p>A</p>',
        '<h2 id="내-결론">내 결론</h2><p>B</p>',
        '<h2 id="확인한-자료">확인한 자료</h2><p>C</p>',
      ].join(''),
    });
    const reading = articleReadingPresentation(investigation);
    expect(reading.kicker).toMatch(/^조사 · \d+분$/);
    expect(reading.toc).toEqual([
      { href: '#실제-구조', label: '실제 구조' },
      { href: '#내-결론', label: '내 결론' },
    ]);
    expect(reading.proseHtml).not.toContain('확인한 자료');
    expect(reading.colophonHtml).toContain('확인한 자료');

    const essay = articleReadingPresentation(article('e', {
      bodyHtml: '<h2 id="하나">하나</h2><h2 id="둘">둘</h2>',
    }));
    expect(essay.kicker).toBe('에세이');
    expect(essay.toc).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-presentation.test.ts
```

Expected: FAIL, `articlePresentation` 모듈이 없음.

- [ ] **Step 3: Write minimal implementation**

Create `apps/site/src/ui/articles/articlePresentation.ts`:

```ts
import type { PublicRecord } from '@beyondwin/contracts';

export const PREFERRED_PUBLIC_ARTICLE_LEAD_ID = 'graphify-code-knowledge-graph-deep-dive';
export type ArticleSpecies = '조사' | '에세이';
export type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
export interface ArticleTocItem { href: string; label: string }
export interface ArticleIndexItem {
  id: string;
  href: string;
  title: string;
  stake: string;
  monthLabel: string;
  species: ArticleSpecies;
  hasEvidence: boolean;
}
export interface ArticleReadingPresentation {
  species: ArticleSpecies;
  kicker: string;
  stake: string;
  toc: ArticleTocItem[];
  proseHtml: string;
  colophonHtml?: string;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

export function articleSpecies(record: Pick<ArticleRecord, 'evidenceState' | 'tags'>): ArticleSpecies {
  return record.evidenceState === 'source-grounded' || record.tags.includes('source-grounded')
    ? '조사'
    : '에세이';
}

export function articleStake(record: Pick<ArticleRecord, 'bodyHtml' | 'description'>): string {
  const firstParagraph = record.bodyHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  const emphasis = firstParagraph.match(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  return (emphasis ? stripTags(emphasis) : '') || record.description;
}

export function articleReadingMinutes(bodyHtml: string): number {
  const words = stripTags(bodyHtml).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 260));
}

export function splitArticleBody(bodyHtml: string): {
  proseHtml: string;
  toc: ArticleTocItem[];
  colophonHtml?: string;
} {
  const heading = /<h2 id="([^"]*)">([\s\S]*?)<\/h2>/gi;
  let colophonAt = -1;
  for (const match of bodyHtml.matchAll(heading)) {
    const id = match[1] ?? '';
    const label = stripTags(match[2] ?? '');
    if (id === '확인한-자료' || label === '확인한 자료') {
      colophonAt = match.index ?? -1;
      break;
    }
  }
  const proseHtml = colophonAt >= 0 ? bodyHtml.slice(0, colophonAt) : bodyHtml;
  const colophonHtml = colophonAt >= 0 ? bodyHtml.slice(colophonAt) : undefined;
  const toc = [...proseHtml.matchAll(/<h2 id="([^"]*)">([\s\S]*?)<\/h2>/gi)]
    .map((match) => ({ href: `#${match[1]}`, label: stripTags(match[2] ?? '') }))
    .filter((item) => item.href.length > 1 && item.label.length > 0);
  return colophonHtml === undefined ? { proseHtml, toc } : { proseHtml, toc, colophonHtml };
}

export function buildArticleIndex(records: readonly ArticleRecord[]): {
  lead?: ArticleIndexItem;
  ledger: ArticleIndexItem[];
} {
  if (records.length === 0) return { ledger: [] };
  const preferred = records.find((record) => record.id === PREFERRED_PUBLIC_ARTICLE_LEAD_ID);
  const leadRecord = preferred ?? [...records].sort((left, right) => {
    const date = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return date || left.id.localeCompare(right.id);
  })[0];
  const toItem = (record: ArticleRecord): ArticleIndexItem => {
    const species = articleSpecies(record);
    return {
      id: record.id,
      href: record.href,
      title: record.title,
      stake: articleStake(record),
      monthLabel: `${new Date(record.updatedAt).getUTCMonth() + 1}월`,
      species,
      hasEvidence: species === '조사',
    };
  };
  return {
    lead: toItem(leadRecord),
    ledger: records.filter((record) => record.id !== leadRecord.id).map(toItem),
  };
}

export function articleReadingPresentation(record: ArticleRecord): ArticleReadingPresentation {
  const species = articleSpecies(record);
  const split = splitArticleBody(record.bodyHtml);
  return {
    species,
    kicker: species === '조사' ? `조사 · ${articleReadingMinutes(record.bodyHtml)}분` : species,
    stake: articleStake(record),
    toc: species === '조사' && split.toc.length >= 2 ? split.toc : [],
    proseHtml: split.proseHtml,
    ...(split.colophonHtml ? { colophonHtml: split.colophonHtml } : {}),
  };
}
```

In `apps/site/app/release.server.ts` replace the local constant with:

```ts
import { PREFERRED_PUBLIC_ARTICLE_LEAD_ID } from '../src/ui/articles/articlePresentation';
```

Delete the old `const PREFERRED_PUBLIC_ARTICLE_LEAD_ID = '...'`.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/ui/articles/articlePresentation.ts \
  apps/site/test/ui/article-presentation.test.ts \
  apps/site/app/release.server.ts
git commit -m "$(cat <<'EOF'
feat: derive article pamphlet and reading presentation

EOF
)"
```

---

### Task 2: Fold 조사 brief tables in trusted MDX

**Files:**
- Modify: `packages/content/src/mdx/components.tsx`
- Modify: `packages/content/src/release/build-release.ts`
- Test: `packages/content/test/mdx-render.test.tsx`

**Interfaces:**
- Consumes: `TrustedMdxComponentOptions.media`; article `SourceRecord.evidenceState` / `tags`
- Produces: `TrustedMdxComponentOptions.foldBriefTable?: boolean`. 조사 글이면서 표 텍스트에 `질문`과 `짧은 판단`이 있으면 `<details class="article-brief"><summary>질문과 짧은 판단</summary><table>…</table></details>`. `PUBLIC_RELEASE_RENDERER_VERSION`은 `mdx-3.1.1-sharp-0.35.3-v3`.

- [ ] **Step 1: Write the failing test**

Append to `packages/content/test/mdx-render.test.tsx` inside the existing describe:

```ts
  const briefTable = [
    '| 질문 | 짧은 판단 |',
    '| --- | --- |',
    '| 무엇을 고르나? | 공개 가능한 것만. |',
  ].join('\n');

  it('folds 질문/짧은 판단 tables only when foldBriefTable is set', async () => {
    const folded = await renderTrustedMdx(briefTable, { media: new Map(), foldBriefTable: true });
    expect(folded).toContain('<details class="article-brief">');
    expect(folded).toContain('<summary>질문과 짧은 판단</summary>');
    expect(folded).toContain('<table>');
    expect(folded).toContain('무엇을 고르나?');

    const plain = await renderTrustedMdx(briefTable, { media: new Map() });
    expect(plain).toContain('<table>');
    expect(plain).not.toContain('article-brief');
  });

  it('leaves ordinary tables unfolded even when foldBriefTable is set', async () => {
    const html = await renderTrustedMdx([
      '| Contract | State |',
      '| --- | --- |',
      '| Public | Ready |',
    ].join('\n'), { media: new Map(), foldBriefTable: true });
    expect(html).toContain('<table>');
    expect(html).not.toContain('article-brief');
  });
```

Keep the existing GFM table assertion (`expect(html).toContain('<table>')`) as the default `foldBriefTable: false` path.

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/content -- test/mdx-render.test.tsx
```

Expected: FAIL, `foldBriefTable` is not a known option or tables are never wrapped.

- [ ] **Step 3: Write minimal implementation**

In `packages/content/src/mdx/components.tsx`:

```ts
export interface TrustedMdxComponentOptions {
  media: ReadonlyMap<string, ReleaseMediaAsset>;
  foldBriefTable?: boolean;
}
```

Inside `createTrustedMdxComponents`, add a `table` component. Walk `children` recursively for string/number text (no extra parser). If `options.foldBriefTable` and the text includes both `질문` and `짧은 판단`, wrap `<table>{children}</table>` in `<details class="article-brief"><summary>질문과 짧은 판단</summary>…</details>`. Otherwise return `<table>{children}</table>`. Do not add `table` to the JSX allowlist; GFM tables are HTML mappings.

Return `{ Callout, Figure, table: Table }`.

In `packages/content/src/release/build-release.ts`:

```ts
export const PUBLIC_RELEASE_RENDERER_VERSION = 'mdx-3.1.1-sharp-0.35.3-v3';
```

When calling `renderTrustedMdx`:

```ts
const foldBriefTable = record.collection === 'articles'
  && (record.evidenceState === 'source-grounded' || record.tags.includes('source-grounded'));
const bodyHtml = await renderTrustedMdx(record.body, { media: recordAssets, foldBriefTable });
```

Do not rewrite sealed evidence JSON under `docs/notes/project/evidence/`. Those reports stay on v2.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/content -- test/mdx-render.test.tsx
npm run test --workspace @beyondwin/content -- test/build-release.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/content/src/mdx/components.tsx \
  packages/content/src/release/build-release.ts \
  packages/content/test/mdx-render.test.tsx
git commit -m "$(cat <<'EOF'
feat: fold source-grounded brief tables in public HTML

EOF
)"
```

---

### Task 3: Article pamphlet index

**Files:**
- Create: `apps/site/src/ui/articles/ArticleIndexPage.tsx`
- Test: `apps/site/test/ui/article-index.test.tsx`
- Modify: `apps/site/app/routes/articles-index.tsx`
- Modify: `apps/site/src/ui/styles/route-article.css`

**Interfaces:**
- Consumes: `buildArticleIndex`, `OriginLink`, `recordAnchor`
- Produces: `/articles/` markup with `.article-lead` and `.article-ledger`. Empty copy `아직 공개한 글이 없습니다.` Critical CSS is `route-reading.css` + `route-article.css` (not `route-collections.css`).

- [ ] **Step 1: Write the failing test**

Create `apps/site/test/ui/article-index.test.tsx`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import { ArticleIndexPage } from '../../src/ui/articles/ArticleIndexPage';
import { PREFERRED_PUBLIC_ARTICLE_LEAD_ID } from '../../src/ui/articles/articlePresentation';

function article(id: string, overrides: Record<string, unknown> = {}) {
  return {
    collection: 'articles',
    id,
    href: `/articles/${id}/`,
    title: `제목 ${id}`,
    description: `${id} 설명.`,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    tags: [],
    media: [],
    relationships: [],
    memoryLinks: [],
    bodyHtml: '<p>본문</p>',
    ...overrides,
  } as Extract<PublicRecord, { collection: 'articles' }>;
}

describe('article index pamphlet', () => {
  it('renders a lead and ledger with species labels and record anchors', () => {
    const html = renderToStaticMarkup(createElement(ArticleIndexPage, {
      records: [
        article(PREFERRED_PUBLIC_ARTICLE_LEAD_ID, {
          tags: ['source-grounded'],
          title: 'Graphify',
          bodyHtml: '<p><strong>그래프가 중심이다.</strong></p>',
        }),
        article('why-i-read-in-the-ai-era', { title: '왜 읽는가' }),
      ],
    }));
    expect(html).toContain('class="article-lead"');
    expect(html).toContain('class="article-ledger"');
    expect(html).toContain('id="record-articles-graphify-code-knowledge-graph-deep-dive"');
    expect(html).toContain('href="/articles/graphify-code-knowledge-graph-deep-dive/"');
    expect(html).toContain('조사 · 근거');
    expect(html).toContain('에세이');
    expect(html).toContain('그래프가 중심이다.');
    expect(html).not.toContain('record-row');
    expect(html).not.toContain('collection-page');
  });

  it('renders the empty copy when there are no articles', () => {
    const html = renderToStaticMarkup(createElement(ArticleIndexPage, { records: [] }));
    expect(html).toContain('아직 공개한 글이 없습니다.');
    expect(html).not.toContain('article-lead');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-index.test.tsx
```

Expected: FAIL, `ArticleIndexPage` 없음.

- [ ] **Step 3: Write minimal implementation**

`ArticleIndexPage` takes `{ records: readonly ArticleRecord[] }`, calls `buildArticleIndex`, and renders a `section.reading-sheet.article-index`. Lead is `OriginLink` with `origin={{ kind: 'articles', anchorId }}` wrapping kicker, `h1`, stake. Ledger is an `ol` of the same origin links with month, title, stake, kind (`조사 · 근거` or `에세이`). Lead `id` is `recordAnchor('articles', lead.id)`. Do not render images.

Replace `apps/site/app/routes/articles-index.tsx` `ArticlesIndexPresentation` to use `ArticleIndexPage` and `recordsForCollection(..., 'articles')` instead of `CollectionPage` / `summariesForCollection`. Loader:

```ts
export async function loader() {
  return { records: recordsForCollection(await loadVerifiedRelease(), 'articles') };
}
```

Critical CSS: `route-reading.css` + `route-article.css` only.

Append mineral pamphlet CSS to `apps/site/src/ui/styles/route-article.css`. Translate Astro `.article-lead` / `.article-ledger` using `--bw-ink`, `--bw-soft-ink`, `--bw-cobalt`, `--bw-line`. Hover underline on title only. Mobile: ledger collapses to one column (`grid-template-columns: 2.6rem minmax(0, 1fr)` then kind wraps). Do not copy crop marks.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-index.test.tsx test/ui/route-presentations.test.tsx
```

Expected: PASS. `route-presentations` still uses `CollectionPage` as a generic component fixture; do not change that fixture to `ArticleIndexPage`.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/ui/articles/ArticleIndexPage.tsx \
  apps/site/test/ui/article-index.test.tsx \
  apps/site/app/routes/articles-index.tsx \
  apps/site/src/ui/styles/route-article.css
git commit -m "$(cat <<'EOF'
feat: render the article index as a pamphlet

EOF
)"
```

---

### Task 4: Article reading TOC, colophon, and figures

**Files:**
- Modify: `apps/site/src/ui/reading/ArticleReadingPage.tsx`
- Test: `apps/site/test/ui/article-reading.test.tsx`
- Modify: `apps/site/src/ui/styles/route-article.css`

**Interfaces:**
- Consumes: `articleReadingPresentation(record)`
- Produces: threshold kicker `조사 · n분` or `에세이`; stake instead of raw description; TOC before prose when non-empty; colophon section; `dangerouslySetInnerHTML` uses `proseHtml` not full `bodyHtml`.

- [ ] **Step 1: Write the failing test**

Create `apps/site/test/ui/article-reading.test.tsx`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import { ArticleReadingPage } from '../../src/ui/reading/ArticleReadingPage';

function article(overrides: Record<string, unknown> = {}) {
  return {
    collection: 'articles',
    id: 'pgvector-hybrid-search',
    href: '/articles/pgvector-hybrid-search/',
    title: 'pgvector',
    description: '설명.',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    tags: ['source-grounded'],
    media: [],
    relationships: [],
    memoryLinks: [],
    bodyHtml: [
      '<p><strong>벡터 검색은 의미가 가까운 줄을 찾는다.</strong></p>',
      '<h2 id="실제-구조">실제 구조</h2><p>본문</p>',
      '<h2 id="내-결론">내 결론</h2><p>끝</p>',
      '<h2 id="확인한-자료">확인한 자료</h2><ul><li>Docs</li></ul>',
    ].join(''),
    ...overrides,
  } as Extract<PublicRecord, { collection: 'articles' }>;
}

describe('article reading page', () => {
  it('places investigation kicker, stake, TOC, and colophon', () => {
    const html = renderToStaticMarkup(createElement(ArticleReadingPage, {
      record: article(),
      continuations: [],
    }));
    expect(html).toMatch(/조사 · \d+분/);
    expect(html).toContain('벡터 검색은 의미가 가까운 줄을 찾는다.');
    expect(html).toContain('aria-label="절"');
    expect(html).toContain('href="#실제-구조"');
    expect(html).toContain('class="article-colophon"');
    expect(html).toContain('글 목록으로');
    expect(html).toContain('이어서 읽기');
    const prose = html.match(/<div class="prose"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(prose).not.toContain('확인한 자료');
    expect(html).toContain('Docs');
  });

  it('omits TOC and colophon for an essay without sources', () => {
    const html = renderToStaticMarkup(createElement(ArticleReadingPage, {
      record: article({
        id: 'why-i-read-in-the-ai-era',
        href: '/articles/why-i-read-in-the-ai-era/',
        tags: ['reading'],
        bodyHtml: '<p>에세이</p><h2 id="하나">하나</h2>',
      }),
      continuations: [],
    }));
    expect(html).toContain('에세이');
    expect(html).not.toContain('aria-label="절"');
    expect(html).not.toContain('article-colophon');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-reading.test.tsx
```

Expected: FAIL, kicker is still `글` and body still contains `확인한 자료`.

- [ ] **Step 3: Write minimal implementation**

`ArticleReadingPage` calls `articleReadingPresentation(record)`:

```tsx
const reading = articleReadingPresentation(record);
const summary = reading.stake;
return (
  <article className="reading-sheet reading-detail article-reading-page">
    <ReadingThreshold collection="articles" kindLabel={reading.kicker} media={media} title={record.title} />
    <div className="reading-detail__body">
      {summary ? <p className="reading-detail__summary">{summary}</p> : null}
      {reading.toc.length > 0 ? (
        <nav className="article-toc" aria-label="절">
          <ol>
            {reading.toc.map((item) => (
              <li key={item.href}><a href={item.href}>{item.label}</a></li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="prose" dangerouslySetInnerHTML={{ __html: reading.proseHtml }} />
    </div>
    {reading.colophonHtml ? (
      <section className="article-colophon" dangerouslySetInnerHTML={{ __html: reading.colophonHtml }} />
    ) : null}
    <ContinueReading items={continuations} collectionHref="/articles/" collectionLabel="글 전체 보기" />
  </article>
);
```

DOM order: threshold, summary, TOC, prose, colophon, continue. CSS may not reorder TOC after prose (`order` 사용 금지).

Append to `route-article.css`:

- `.article-toc` quiet list, no sticky, `--bw-soft-ink`, hover/focus `--bw-ink` underline.
- `.article-colophon` top border `--bw-line`, same 42em measure.
- `.article-brief` / summary min-height 44px, no card chrome.
- `.content-figure` stays in 42em; caption/provenance remain; no box-shadow.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/article-reading.test.tsx test/ui/article-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/ui/reading/ArticleReadingPage.tsx \
  apps/site/test/ui/article-reading.test.tsx \
  apps/site/src/ui/styles/route-article.css
git commit -m "$(cat <<'EOF'
feat: add investigation TOC and source colophon to articles

EOF
)"
```

---

### Task 5: Bookshelf presentation helpers

**Files:**
- Create: `apps/site/src/ui/reviews/bookshelfPresentation.ts`
- Test: `apps/site/test/ui/bookshelf-presentation.test.ts`

**Interfaces:**
- Consumes: `Extract<PublicRecord, { collection: 'reviews' }>`, `PublicReleaseManifest['assets'][string]`
- Produces:

```ts
export type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
export type ReleaseAsset = PublicReleaseManifest['assets'][string];
export interface BookShelfRecord {
  id: string;
  href: string;
  title: string;
  authors: readonly string[];
  verdict: string;
  year: number;
  coverAsset?: ReleaseAsset;
}
export function getOneSentenceJudgment(text: string): string;
export function reviewSortDate(record: ReviewRecord): string;
export function buildBookshelfPresentation(
  records: readonly ReviewRecord[],
  assets: ReadonlyMap<string, ReleaseAsset>,
): {
  shelfTiers: BookShelfRecord[][];
  diary: Array<{ year: number; entries: BookShelfRecord[] }>;
};
```

Cover asset is included only when `coverState === 'verified'` and `assets.get(\`reviews/${id}/${coverMedia}\`)` exists.

- [ ] **Step 1: Write the failing test**

Create `apps/site/test/ui/bookshelf-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import {
  buildBookshelfPresentation,
  getOneSentenceJudgment,
} from '../../src/ui/reviews/bookshelfPresentation';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const cover = {
  id: 'cover',
  fallback: { src: '/assets/content/reviews/a/cover.jpg' },
} as ReleaseAsset;

function review(id: string, overrides: Record<string, unknown> = {}): ReviewRecord {
  return {
    collection: 'reviews',
    id,
    href: `/reviews/${id}/`,
    title: id,
    description: `${id} 설명입니다.`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    media: [],
    relationships: [],
    memoryLinks: [],
    bodyHtml: '<p>본문</p>',
    itemType: 'book',
    authors: ['저자'],
    readEditionVerified: true,
    ...overrides,
  } as ReviewRecord;
}

describe('bookshelf presentation', () => {
  it('takes the first sentence as the judgment', () => {
    expect(getOneSentenceJudgment('지난달 읽은 책이다. 다음 문장.')).toBe('지난달 읽은 책이다.');
    expect(getOneSentenceJudgment('종결 없는 판정')).toBe('종결 없는 판정');
  });

  it('builds two shelf tiers of four and keeps the ninth book in the diary only', () => {
    const records = Array.from({ length: 9 }, (_, index) => review(`book-${index}`, {
      completedAt: `2026-08-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`,
      verdict: `판정 ${index}이다.`,
      coverState: index === 8 ? 'hold' : 'verified',
      coverMedia: index === 8 ? undefined : 'cover',
    }));
    const assets = new Map<string, ReleaseAsset>(
      records.flatMap((record) => (
        record.coverMedia
          ? [[`reviews/${record.id}/cover`, cover] as const]
          : []
      )),
    );
    const result = buildBookshelfPresentation(records, assets);
    expect(result.shelfTiers).toHaveLength(2);
    expect(result.shelfTiers[0]).toHaveLength(4);
    expect(result.shelfTiers[1]).toHaveLength(4);
    expect(result.shelfTiers.flat().map((item) => item.id)).not.toContain('book-8');
    expect(result.diary[0]?.year).toBe(2026);
    expect(result.diary[0]?.entries).toHaveLength(9);
    expect(result.diary[0]?.entries[8]?.coverAsset).toBeUndefined();
    expect(result.shelfTiers[0]?.[0]?.coverAsset).toEqual(cover);
    expect(result.shelfTiers[0]?.[0]?.verdict).toBe('판정 0이다.');
  });

  it('returns empty tiers for no reviews', () => {
    expect(buildBookshelfPresentation([], new Map())).toEqual({ shelfTiers: [], diary: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/bookshelf-presentation.test.ts
```

Expected: FAIL, module 없음.

- [ ] **Step 3: Write minimal implementation**

Create `apps/site/src/ui/reviews/bookshelfPresentation.ts`:

```ts
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';

export type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
export type ReleaseAsset = PublicReleaseManifest['assets'][string];
export interface BookShelfRecord {
  id: string;
  href: string;
  title: string;
  authors: readonly string[];
  verdict: string;
  year: number;
  coverAsset?: ReleaseAsset;
}

export function getOneSentenceJudgment(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return normalized.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? normalized;
}

export function reviewSortDate(record: ReviewRecord): string {
  return record.completedAt ?? record.createdAt;
}

function toShelfRecord(
  record: ReviewRecord,
  assets: ReadonlyMap<string, ReleaseAsset>,
): BookShelfRecord {
  const coverAsset = record.coverState === 'verified' && record.coverMedia
    ? assets.get(`reviews/${record.id}/${record.coverMedia}`)
    : undefined;
  return {
    id: record.id,
    href: record.href,
    title: record.title,
    authors: record.authors,
    verdict: getOneSentenceJudgment(record.verdict ?? record.description),
    year: new Date(reviewSortDate(record)).getUTCFullYear(),
    ...(coverAsset ? { coverAsset } : {}),
  };
}

export function buildBookshelfPresentation(
  records: readonly ReviewRecord[],
  assets: ReadonlyMap<string, ReleaseAsset>,
): {
  shelfTiers: BookShelfRecord[][];
  diary: Array<{ year: number; entries: BookShelfRecord[] }>;
} {
  const ordered = [...records].sort((left, right) => {
    const date = Date.parse(reviewSortDate(right)) - Date.parse(reviewSortDate(left));
    return date || left.id.localeCompare(right.id);
  }).map((record) => toShelfRecord(record, assets));
  const shelf = ordered.slice(0, 8);
  const shelfTiers = [shelf.slice(0, 4), shelf.slice(4, 8)].filter((tier) => tier.length > 0);
  const diary: Array<{ year: number; entries: BookShelfRecord[] }> = [];
  for (const entry of ordered) {
    const current = diary.at(-1);
    if (!current || current.year !== entry.year) diary.push({ year: entry.year, entries: [entry] });
    else current.entries.push(entry);
  }
  return { shelfTiers, diary };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/bookshelf-presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/ui/reviews/bookshelfPresentation.ts \
  apps/site/test/ui/bookshelf-presentation.test.ts
git commit -m "$(cat <<'EOF'
feat: derive review shelf and yearly diary presentation

EOF
)"
```

---

### Task 6: Book index objects and diary

**Files:**
- Create: `apps/site/src/ui/reviews/BookIndexPage.tsx`
- Test: `apps/site/test/ui/book-index.test.tsx`
- Modify: `apps/site/app/routes/reviews-index.tsx`
- Modify: `apps/site/src/ui/styles/route-review.css`
- Modify: `apps/site/test/css-source-accounting.test.ts`

**Interfaces:**
- Consumes: `buildBookshelfPresentation`, `OriginLink`, `ResponsivePicture`, `recordAnchor`
- Produces: `/reviews/` `.book-objects` + `.book-diary`. HOLD/missing cover → `.book-cover--set` text plate with title and authors. Mobile CSS does not `display:none` title or verdict. Critical CSS is `route-reading.css` + `route-review.css`.

- [ ] **Step 1: Write the failing test**

Create `apps/site/test/ui/book-index.test.tsx` that renders `BookIndexPage` with two records: one verified cover asset, one `coverState: 'hold'`. Assert:

- `class="book-objects"`
- `class="book-diary"`
- year heading
- `id="record-reviews-black-swan"`
- `href="/reviews/black-swan/"`
- hold plate contains title text inside `.book-cover--set`
- `not.toContain('record-row')`
- empty records → `아직 공개한 책이 없습니다.`

Also extend `apps/site/test/css-source-accounting.test.ts` to load `route-article.css` / `route-review.css` as now, and assert:

```ts
expect(criticalCssForPath('/articles/', sources)).toContain('.article-lead');
expect(criticalCssForPath('/articles/', sources)).not.toContain('.public-scene');
expect(criticalCssForPath('/reviews/', sources)).toContain('.book-objects');
expect(criticalCssForPath('/reviews/', sources)).not.toContain('.public-scene');
```

`.article-lead` / `.book-objects` will fail until CSS lands in this task.

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/book-index.test.tsx test/css-source-accounting.test.ts
```

Expected: FAIL, `BookIndexPage` 없음 또는 `.book-objects` 없음.

- [ ] **Step 3: Write minimal implementation**

`reviews-index.tsx` loader:

```ts
export async function loader() {
  const release = await loadVerifiedRelease();
  return {
    records: recordsForCollection(release, 'reviews'),
    assets: release.manifest.assets,
  };
}
```

Map `assets` to `Map` and pass into `BookIndexPage`. For each `BookShelfRecord`, if `coverAsset` render `ResponsivePicture` with `sizes="(max-width: 720px) 42vw, 11.5rem"` (diary `42px` still uses the same picture, CSS constrains width). Else text plate. Wrap cards and diary rows in `OriginLink` `{ kind: 'reviews', anchorId }`. First four shelf covers may be `eager`.

CSS in `route-review.css`: 4-column `.book-objects`, cover `aspect-ratio: 2 / 3`, shadow only on raster covers (`0 8px 18px color-mix(in srgb, var(--bw-ink) 18%, transparent)`), `.book-cover--set` 1px `--bw-line` and no shadow. `@media (max-width: 720px)` use 2 columns, **do not hide** `.book-title` or `.book-verdict`. Diary: `42px` cover + copy.

Keep existing `.review-reading-page .content-figure` rule.

`reviews-index` handle CSS: `route-reading.css` + `route-review.css` only.

- [ ] **Step 4: Run the tests and make sure they pass**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run test --workspace @beyondwin/site -- test/ui/book-index.test.tsx test/css-source-accounting.test.ts test/ui/route-presentations.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/ui/reviews/BookIndexPage.tsx \
  apps/site/test/ui/book-index.test.tsx \
  apps/site/app/routes/reviews-index.tsx \
  apps/site/src/ui/styles/route-review.css \
  apps/site/test/css-source-accounting.test.ts
git commit -m "$(cat <<'EOF'
feat: render reviews as cover objects and a yearly diary

EOF
)"
```

---

### Task 7: Browser evidence, DESIGN.md, validate

**Files:**
- Modify: `DESIGN.md` (reading route 절만, 구현이 통과한 뒤)
- Modify: `docs/notes/project/README.md` if the plan is not already in the hub
- Test: browser on port **4384**; `npm run validate`

**Interfaces:**
- Consumes: Tasks 1–6 UI
- Produces: `DESIGN.md` built truth for React 글 팸플릿 / 책 표지+일기 / mineral reading sheet. Press-proof crop marks are rollback-only language, not current public site.

- [ ] **Step 1: Rebuild the public release and focused tests**

Folded tables exist only in newly compiled `bodyHtml`.

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run public-release:build
npm run test --workspace @beyondwin/site -- \
  test/ui/article-presentation.test.ts \
  test/ui/article-index.test.tsx \
  test/ui/article-reading.test.tsx \
  test/ui/bookshelf-presentation.test.ts \
  test/ui/book-index.test.tsx \
  test/css-source-accounting.test.ts
npm run test --workspace @beyondwin/content -- test/mdx-render.test.tsx
```

Expected: PASS. Do not treat a stale release as Task 2 failure.

- [ ] **Step 2: Preview on an unused port**

Do not touch processes on 3000, 4327, or 5173.

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run site:build
npm run site:preview -- --port 4384
```

Expected: preview listens on `127.0.0.1:4384`.

- [ ] **Step 3: Browser matrix**

Desktop 1440 and mobile 390. Existing Playwright CLI if present, otherwise the session browser tools.

Routes:

- `http://127.0.0.1:4384/articles/`
- `http://127.0.0.1:4384/articles/pgvector-hybrid-search/`
- `http://127.0.0.1:4384/articles/why-i-read-in-the-ai-era/`
- `http://127.0.0.1:4384/reviews/`
- `http://127.0.0.1:4384/reviews/doing-good-better/`
- `http://127.0.0.1:4384/` → 글 읽기 → 목록 또는 장면 복귀

Check: 팸플릿 리드/장부, 조사 TOC 해시 이동, figure 캡션, 에세이에 절 목록 없음, 책 표지와 일기, 모바일에서 책 제목·판정 보임, 긴 제목 overflow 없음, 보이는 포커스, `prefers-reduced-motion`에서 새 애니메이션 없음, 콘솔 에러 없음.

If a check fails, fix in the owning file from Tasks 3–6 and re-run the focused test before continuing.

- [ ] **Step 4: Update DESIGN.md built truth**

In `DESIGN.md` 「기존 reading route 레이아웃」:

- React 공개 사이트의 글/책은 mineral field + optical-white sheet다. 회색 부스와 재단선은 Astro rollback baseline이다.
- `/articles/`는 리드 하나와 `조사`/`에세이` 장부 팸플릿이다.
- 조사 글 상세는 본문 앞 절 목록과 `확인한 자료` colophon을 쓴다.
- `/reviews/`는 최근 표지 객체와 연도별 일기다. 모바일에서 제목과 판정을 숨기지 않는다.

Do not claim the scene was redesigned. Do not add studio/DB language.

- [ ] **Step 5: Final gates**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run validate
git diff --check
```

Expected: validate PASS. `git diff --check` silent. Review the diff: no verified-release-asset WIP, no screenshots, no unrelated docs.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md docs/notes/project/README.md
git commit -m "$(cat <<'EOF'
docs: record mineral article pamphlet and review shelf as built truth

EOF
)"
```

Stop the 4384 preview only if this session started it.

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| 글 팸플릿 리드/장부, preferred lead, 조사/에세이 | 1, 3 |
| 한 줄 이해, 분량, TOC≥2, colophon 분리 | 1, 4 |
| 질문/짧은 판단 표 접힘 | 2 |
| figure 42em, no lightbox | 4 |
| 책 8권 2단 + 연도 일기, HOLD 판 | 5, 6 |
| 모바일 제목·판정 유지 | 6, 7 |
| CollectionPage 유지, 찾기/기억/보조 lane 제외 | 3, 6 (do not touch) |
| origin/이어서 읽기/threshold | 3, 4, 6 |
| 새 JS/스키마/ADR 없음 | Global |
| DESIGN.md after implementation | 7 |
| browser + validate | 7 |
