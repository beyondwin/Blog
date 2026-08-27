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
