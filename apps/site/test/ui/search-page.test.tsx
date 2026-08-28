import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  boundedSearchQuery,
  matchSearchItem,
  SearchPage,
  searchMatches,
  type SearchInventoryItem,
} from '../../src/ui/search/SearchPage';
import { popularKeywords } from '../../src/ui/search/popularKeywords';

function item(
  kind: 'article' | 'review' | 'thought',
  id: string,
  overrides: Partial<SearchInventoryItem> = {},
): SearchInventoryItem {
  return {
    id: `${kind}s/${id}`,
    anchorId: `record-${kind}s-${id}`,
    href: `/${kind}s/${id}/`,
    kind,
    title: `${kind} ${id}`,
    description: `${kind} description`,
    topics: [],
    ...overrides,
  };
}

const inventory = [
  item('article', 'title-match', {
    title: 'Graphify 검색 설계',
    description: '검색 결과의 설명에도 Graphify가 있다.',
    topics: ['Graphify', 'AI', 'agent', 'source-grounded'],
  }),
  item('review', 'tag-match', {
    title: '태그로 찾는 서평',
    description: '다른 설명',
    topics: ['Graphify', 'AI', 'book', 'naver-archive', 'review'],
  }),
  item('thought', 'description-match', {
    title: '읽는다는 것',
    description: 'Graphify를 떠올리며 질문을 늦춘다.',
    topics: ['AI', 'reading', 'published'],
  }),
];

const discovery = [inventory[1], inventory[0], inventory[2]];

function renderSearch(initialQuery: string) {
  return renderToStaticMarkup(createElement(SearchPage as any, {
    discovery,
    initialQuery,
    inventory,
  }));
}

describe('FORM & THOUGHT public search', () => {
  it('renders exact search chrome, a canonical GET form, corpus keywords, and one fixed real card per primary lane', () => {
    const html = renderSearch('');

    expect(html).toContain('<h1 id="search-title">검색</h1>');
    expect(html).toContain('<form class="search-page__form" role="search" action="/search/" method="get">');
    expect(html).toContain('name="q"');
    expect(html).toContain('aria-label="검색어"');
    expect(html).toContain('href="/search/?q=AI"');
    expect(html).toContain('href="/search/?q=%EB%8F%85%EC%84%9C"');
    expect(html.match(/class="search-keywords__link"/gu)?.length).toBeLessThanOrEqual(8);
    expect(html.match(/<a class="search-discovery-card /gu)).toHaveLength(3);
    expect(html).toMatch(/>서평<[\s\S]*>아티클<[\s\S]*>생각</u);
    expect(html).not.toMatch(/>글<|>책<|>문장<|주제와 태그/u);
    expect(html).not.toMatch(/검색은 정보|search-page__closure/u);
  });

  it('keeps query bounding pure and ranks title before tag before description in one flat list', () => {
    expect(boundedSearchQuery(` ${'가'.repeat(120)} `)).toBe('가'.repeat(120));
    expect(boundedSearchQuery('가'.repeat(121))).toBe('');
    expect(matchSearchItem(inventory[0], 'Graphify')).toEqual({
      field: 'title',
      rank: 0,
      reason: '제목이 검색어와 일치합니다',
    });
    expect(matchSearchItem(inventory[1], 'Graphify')).toEqual({
      field: 'tag',
      rank: 1,
      reason: '태그 “Graphify”와 일치합니다',
    });
    expect(matchSearchItem(inventory[2], 'Graphify')).toEqual({
      field: 'description',
      rank: 2,
      reason: '설명에 검색어가 있습니다',
    });

    const html = renderSearch('Graphify');
    expect(html).toContain('<h2 id="search-results-title">검색 결과</h2>');
    expect(html.match(/class="search-result-list"/gu)).toHaveLength(1);
    expect(html.indexOf('Graphify 검색 설계')).toBeLessThan(html.indexOf('태그로 찾는 서평'));
    expect(html.indexOf('태그로 찾는 서평')).toBeLessThan(html.indexOf('읽는다는 것'));
    expect(html).toMatch(/search-result__kind">아티클<[\s\S]*search-result__kind">서평<[\s\S]*search-result__kind">생각</u);
    expect(html).not.toMatch(/search-page__group|>글<|>책<|>문장</u);
  });

  it('renders only real corpus keyword suggestions for zero results and no discovery-card grid', () => {
    const html = renderSearch('존재하지않는검색어');

    expect(html).toContain('일치하는 결과가 없습니다.');
    expect(html).toContain('다른 키워드로 이어서 찾아보세요.');
    expect(html).toContain('href="/search/?q=AI"');
    expect(html).not.toMatch(/search-discovery-card|검색어와 제목이 일치합니다/u);
  });

  it('makes every mapped keyword link find exactly the unique primary records counted for that label', () => {
    const keywordInventory = [
      item('article', 'agent-aliases', {
        title: '첫 기록',
        description: '첫 설명',
        topics: ['agent', 'agents', 'source-grounded'],
      }),
      item('review', 'agent-and-book', {
        title: '둘째 기록',
        description: '둘째 설명',
        topics: ['agent', 'book', 'review'],
      }),
      item('thought', 'agents-and-book', {
        title: '셋째 기록',
        description: '셋째 설명',
        topics: ['agents', 'book', 'published'],
      }),
    ];

    const keywords = popularKeywords(keywordInventory);
    expect(keywords).toEqual([
      { count: 3, href: '/search/?q=%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8', label: '에이전트' },
      { count: 2, href: '/search/?q=%EB%8F%85%EC%84%9C', label: '독서' },
    ]);

    for (const keyword of keywords) {
      const query = new URL(keyword.href, 'https://beyondwin.test').searchParams.get('q')!;
      const matches = searchMatches(keywordInventory, query);
      expect(matches, keyword.label).toHaveLength(keyword.count);
      expect(matches.every(({ match }) => match.field === 'tag'), keyword.label).toBe(true);
    }
  });

  it('excludes internal-only tags and orders equal-frequency mapped labels by Korean label', () => {
    const tieInventory = [
      item('article', 'design', { topics: ['design', 'source-grounded'] }),
      item('review', 'database', { topics: ['database', 'review'] }),
      item('thought', 'excluded', { topics: ['published'] }),
    ];

    expect(popularKeywords(tieInventory)).toEqual([
      { count: 1, href: '/search/?q=%EB%8D%B0%EC%9D%B4%ED%84%B0%EB%B2%A0%EC%9D%B4%EC%8A%A4', label: '데이터베이스' },
      { count: 1, href: '/search/?q=%EB%94%94%EC%9E%90%EC%9D%B8', label: '디자인' },
    ]);
  });
});
