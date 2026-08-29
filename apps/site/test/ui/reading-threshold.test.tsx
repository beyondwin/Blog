import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextReturn, contextReturnPresentation } from '../../src/ui/reading/ContextReturn';
import { ReadingThreshold } from '../../src/ui/reading/ReadingThreshold';

describe('quiet reading threshold', () => {
  it('server-renders the article collection fallback and no image for text-only records', () => {
    const html = renderToStaticMarkup(createElement(ReadingThreshold, {
      collection: 'articles',
      kindLabel: '글',
      title: '텍스트만 있는 글',
    }));

    expect(html).toContain('<a class="context-return" href="/articles/">글 목록으로</a>');
    expect(html).toContain('<h1>텍스트만 있는 글</h1>');
    expect(html).not.toContain('<img');
    expect(html.match(/reading-threshold__marker/gu)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders only the already-resolved media supplied by the route adapter', () => {
    const media = createElement('img', {
      src: '/assets/content/reviews/safe/cover.webp',
      alt: '검증된 판본 표지',
      width: 320,
      height: 480,
    });
    const html = renderToStaticMarkup(createElement(ReadingThreshold, {
      collection: 'reviews',
      kindLabel: '책',
      title: '검증된 책',
      media,
    }));

    expect(html).toContain('<img src="/assets/content/reviews/safe/cover.webp"');
    expect(html).toContain('alt="검증된 판본 표지"');
    expect(html).toContain('<a class="context-return" href="/reviews/">책 목록으로</a>');
  });

  it.each([
    [{ kind: 'articles', anchorId: 'article-2' }, '글 목록으로', '/articles/#article-2'],
    [{ kind: 'reviews', anchorId: 'review-2' }, '책 목록으로', '/reviews/#review-2'],
    [{ kind: 'search', query: 'AI 판단', anchorId: 'result-2' }, '“AI 판단” 결과로', '/search/?q=AI+%ED%8C%90%EB%8B%A8#result-2'],
    [{ kind: 'analysis', anchorId: 'analysis-2' }, '조사 목록으로', '/analysis/#analysis-2'],
    [{ kind: 'ideas' }, '아이디어 목록으로', '/ideas/'],
    [{ kind: 'travel', anchorId: 'seoul-1' }, '여행 목록으로', '/travel/#seoul-1'],
    [{ kind: 'tags', anchorId: 'typescript' }, '태그 목록으로', '/tags/#typescript'],
  ] as const)('derives an allowlisted contextual label and href for %#', (origin, label, href) => {
    expect(contextReturnPresentation(origin, 'articles')).toEqual({ label, href });
  });

  it('fails closed to the current collection for malformed or stale origin input', () => {
    expect(contextReturnPresentation({ kind: 'search', query: 'bad\nquery', anchorId: 'safe' }, 'reviews'))
      .toEqual({ label: '책 목록으로', href: '/reviews/' });
    expect(contextReturnPresentation({ kind: 'scene', focusId: 'retired-focus' }, 'articles'))
      .toEqual({ label: '글 목록으로', href: '/articles/' });

    const html = renderToStaticMarkup(createElement(ContextReturn, { collection: 'reviews' }));
    expect(html).toBe('<a class="context-return" href="/reviews/">책 목록으로</a>');
    expect(html).not.toMatch(/__bw_|javascript:|https?:/u);
  });
});
