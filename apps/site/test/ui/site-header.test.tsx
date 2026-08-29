import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '../../src/ui/components/SiteHeader';
import { SiteShell } from '../../src/ui/components/SiteShell';

type SiteShellProps = ComponentProps<typeof SiteShell>;

const siteShellHasNoArbitraryProps: string extends keyof SiteShellProps ? never : true = true;
const siteShellHasNoLegacyMode: 'mode' extends keyof SiteShellProps ? never : true = true;
const siteShellRejectsScene: 'scene' extends SiteShellProps['currentSection'] ? never : true = true;

describe('FORM & THOUGHT shared site header', () => {
  it('renders the two-line wordmark and approved primary navigation in exact order', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection: 'articles' }));

    expect(html).toContain('aria-label="FORM &amp; THOUGHT 홈"');
    expect(html).toContain('<span>FORM &amp;</span><span>THOUGHT</span>');
    expect(html).toMatch(/서평[\s\S]*아티클[\s\S]*생각[\s\S]*검색/u);
    expect(html).toContain('href="/articles/" aria-current="page"');
    expect(html).not.toMatch(/beyondwin|장면|>글<|>책<|찾기/u);
  });

  it('keeps canonical anchors in the server response and renders a three-line menu trigger', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection: null }));

    for (const href of ['/reviews/', '/articles/', '/thoughts/', '/search/']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('<noscript>');
    expect(html).toMatch(/<button[^>]*hidden=""/u);
    expect(html).toContain('aria-controls="site-navigation-menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html.match(/<i><\/i>/gu)).toHaveLength(3);
  });

  it('marks only the selected section and supports inverse home chrome', () => {
    for (const [currentSection, label] of [
      ['reviews', '서평'],
      ['articles', '아티클'],
      ['thoughts', '생각'],
      ['search', '검색'],
    ] as const) {
      const html = renderToStaticMarkup(createElement(SiteHeader, { currentSection }));
      expect(html.match(/aria-current="page"/gu)).toHaveLength(3);
      expect(html).toContain(`aria-current="page">${label}</a>`);
      expect(html).toMatch(new RegExp(`navigation-menu[\\s\\S]*aria-current="page">${label}</a>`, 'u'));
      expect(html).toMatch(new RegExp(`navigation-noscript[\\s\\S]*aria-current="page">${label}</a>`, 'u'));
    }

    const inverse = renderToStaticMarkup(createElement(SiteHeader, {
      currentSection: null,
      inverse: true,
    }));
    expect(inverse).toContain('site-header site-header--inverse');
    expect(inverse).not.toContain('aria-current="page"');
  });

  it('renders a header and main without a repeated footer or surface mode', () => {
    const html = renderToStaticMarkup(createElement(SiteShell, {
      currentSection: 'reviews',
      children: createElement('p', null, '본문'),
    }));

    expect(html).toContain('<header');
    expect(html).toContain('href="#main-content" data-evidence-modal-inert="true">본문으로 건너뛰기</a>');
    expect(html).toContain('<header class="site-header" aria-label="사이트 머리말" data-evidence-modal-inert="true">');
    expect(html).toMatch(/<main class="site-main" id="main-content" tabindex="-1" data-mobile-menu-inert/u);
    expect(html).not.toContain('<footer');
    expect(html).not.toContain('data-surface-mode');
  });

  it('exposes only the current editorial shell contract', () => {
    expect(siteShellHasNoArbitraryProps).toBe(true);
    expect(siteShellHasNoLegacyMode).toBe(true);
    expect(siteShellRejectsScene).toBe(true);
  });
});
