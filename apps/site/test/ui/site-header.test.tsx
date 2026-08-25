import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '../../src/ui/components/SiteHeader';

describe('shared public site header', () => {
  it('renders the approved public nouns in one labeled primary navigation', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection: 'articles' }));

    expect(html.match(/<nav\b/gu)).toHaveLength(1);
    expect(html).toContain('aria-label="주 탐색"');
    expect(html).toMatch(/장면[\s\S]*글[\s\S]*책[\s\S]*찾기/u);
    expect(html).toContain('href="/articles/" aria-current="page"');
  });

  it('uses an explicit 44px mobile control without production decoration', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection: 'scene' }));

    expect(html).toContain('<button');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('class="mobile-navigation__button touch-target"');
    expect(html).not.toMatch(/brand__mark|crop|cmyk|production-bar|>\+<|aria-label="beyondwin home"/iu);
    expect(html).toContain('aria-label="beyondwin 홈"');
  });

  it('marks only the matching route family as current', () => {
    for (const [currentSection, label] of [
      ['scene', '장면'],
      ['articles', '글'],
      ['reviews', '책'],
      ['search', '찾기'],
    ] as const) {
      const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection }));
      expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
      expect(html).toContain(`aria-current="page">${label}</a>`);
    }

    const unselected = renderToStaticMarkup(createElement(SiteHeader, { currentSection: null }));
    expect(unselected).not.toContain('aria-current="page"');
  });
});
