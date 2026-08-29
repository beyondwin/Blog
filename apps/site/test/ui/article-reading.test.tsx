import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import { ArticleReadingPage } from '../../src/ui/reading/ArticleReadingPage';

function article(overrides: Record<string, unknown> = {}) {
  return {
    collection: 'articles', id: 'pgvector-hybrid-search', href: '/articles/pgvector-hybrid-search/',
    title: 'pgvector로 벡터 검색 이해하기', description: '임베딩과 키워드 검색을 함께 쓰는 기준.',
    createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z',
    tags: ['source-grounded'], media: [], relationships: [], memoryLinks: [],
    bodyHtml: [
      '<p><strong>벡터 검색은 의미가 가까운 줄을 찾는다.</strong></p>',
      '<h2 id="실제-구조">실제 구조</h2><p>실제 본문</p>',
      '<h2 id="내-결론">내 결론</h2><p>적용 기준</p>',
      '<h2 id="확인한-자료">확인한 자료</h2><ul><li>PostgreSQL Docs</li></ul>',
    ].join(''), ...overrides,
  } as Extract<PublicRecord, { collection: 'articles' }>;
}

describe('article reference-03 detail', () => {
  it('renders the article type, hero metadata, action rail, real prose, TOC, and colophon', () => {
    const html = renderToStaticMarkup(createElement(ArticleReadingPage, {
      record: article(), continuations: [],
      media: createElement('img', { src: '/assets/content/articles/pgvector-hybrid-search/hero.png', alt: '어두운 건축 면', width: 1536, height: 1024 }),
    }));

    expect(html).toContain('editorial-detail-frame editorial-detail-frame--split');
    expect(html).toContain('<h1>pgvector로 벡터 검색 이해하기</h1>');
    expect(html).toContain('아티클');
    expect(html).toContain('<time dateTime="2026-08-29T00:00:00.000Z">2026.08.29</time>');
    expect(html).toContain('좋아요 · 준비 중');
    expect(html).toContain('댓글 · 준비 중');
    expect(html).toContain('링크 복사');
    expect(html).toContain('<a class="context-return" href="/articles/">아티클 목록으로</a>');
    expect(html).toContain('aria-label="절"');
    expect(html).toContain('href="#실제-구조"');
    expect(html).toContain('class="article-colophon"');
    expect(html).toContain('실제 본문');
    expect(html).toContain('PostgreSQL Docs');
    expect(html).not.toMatch(/조사 · \d+분|>에세이</u);
  });

  it('uses the text-led frame and omits optional TOC and colophon when media and sources are absent', () => {
    const html = renderToStaticMarkup(createElement(ArticleReadingPage, {
      record: article({ id: 'ai-design-references', href: '/articles/ai-design-references/', tags: [], bodyHtml: '<p>에세이 본문</p><h2 id="하나">하나</h2>' }),
      continuations: [],
    }));
    expect(html).toContain('editorial-detail-frame editorial-detail-frame--text-led');
    expect(html).not.toContain('editorial-detail-frame__media');
    expect(html).not.toContain('aria-label="절"');
    expect(html).not.toContain('article-colophon');
    expect(html).toContain('에세이 본문');
  });
});
