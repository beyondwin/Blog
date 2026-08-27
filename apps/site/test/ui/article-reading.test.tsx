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
