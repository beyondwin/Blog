import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/navigation/OriginLink', () => ({
  OriginLink: ({ children, href }: { children: ReactNode; href: string }) => createElement(
    'a',
    { 'data-origin-link': 'true', href },
    children,
  ),
}));

import { SearchResults } from '../../src/ui/search/SearchResults';
import type { SearchInventoryItem } from '../../src/ui/search/searchModel';

const inventory: readonly SearchInventoryItem[] = [{
  id: 'articles/graphify-code-knowledge-graph-deep-dive',
  anchorId: 'record-articles-graphify-code-knowledge-graph-deep-dive',
  href: '/articles/graphify-code-knowledge-graph-deep-dive/',
  kind: 'article',
  title: 'Graphify는 코드 이해를 정말 더 빠르게 만드는가?',
  description: 'Graphify의 코드 지식 그래프를 검토한다.',
  topics: ['Graphify'],
}];

describe('SearchResults origin policy', () => {
  it('uses reading-continuity transport only for a location-restored GET result', () => {
    const html = renderToStaticMarkup(createElement(SearchResults, {
      inventory,
      originPolicy: 'search-continuation',
      query: 'Graphify',
    }));

    expect(html).toContain('data-origin-link="true"');
    expect(html).toContain('href="/articles/graphify-code-knowledge-graph-deep-dive/"');
  });

  it('renders an unenhanced canonical anchor for an explicit POST fallback', () => {
    const html = renderToStaticMarkup(createElement(SearchResults, {
      inventory,
      originPolicy: 'canonical-only',
      query: 'Graphify',
    }));

    expect(html).not.toContain('data-origin-link');
    expect(html).toContain('href="/articles/graphify-code-knowledge-graph-deep-dive/"');
    expect(html).not.toMatch(/__bw_|bw:origin|Graphify(?:%20|\+)/u);
  });
});
