import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DetailActionRail } from '../../src/ui/editorial/DetailActionRail';
import { EditorialDetailFrame } from '../../src/ui/editorial/EditorialDetailFrame';
import { EditorialListRow } from '../../src/ui/editorial/EditorialListRow';
import { EditorialPageHeader } from '../../src/ui/editorial/EditorialPageHeader';
import { copyCanonicalUrl } from '../../src/ui/editorial/copyCanonicalUrl';

describe('editorial primitives', () => {
  it('renders one page heading with optional description and controls', () => {
    const html = renderToStaticMarkup(createElement(EditorialPageHeader, {
      title: '아티클',
      description: '기술과 시스템을 오래 남는 문장으로 다룹니다.',
      children: createElement('nav', { 'aria-label': '주제' }, '전체'),
    }));

    expect(html).toContain('<h1>아티클</h1>');
    expect(html).toContain('기술과 시스템을 오래 남는 문장으로 다룹니다.');
    expect(html).toContain('aria-label="주제"');
  });

  it('makes the complete media row one canonical anchor with a decorative arrow', () => {
    const html = renderToStaticMarkup(createElement(EditorialListRow, {
      href: '/articles/an-editorial-row/',
      title: '아주 긴 한국어 제목도 행 전체에서 읽힌다',
      description: '한 줄 설명',
      date: '2026.08.29',
      media: createElement('img', { src: '/approved.webp', alt: '빛이 드는 건축 면', width: 800, height: 600 }),
    }));

    expect(html.match(/<a\b/gu)).toHaveLength(1);
    expect(html).toContain('<a class="editorial-list-row" href="/articles/an-editorial-row/">');
    expect(html).toContain('<h2>아주 긴 한국어 제목도 행 전체에서 읽힌다</h2>');
    expect(html).toContain('<time dateTime="2026-08-29">2026.08.29</time>');
    expect(html).toContain('빛이 드는 건축 면');
    expect(html).toContain('class="editorial-list-row__arrow" aria-hidden="true"');
  });

  it('preserves the complete book cover in review list rows', () => {
    const html = renderToStaticMarkup(createElement(EditorialListRow, {
      href: '/reviews/the-long-way/',
      title: 'The Long Way to a Small, Angry Planet',
      description: '표지 전체 비율을 보존하는 서평 행',
      date: '2026.08.29',
      media: createElement('img', {
        src: '/covers/the-long-way.jpg',
        alt: 'The Long Way cover',
      }),
      variant: 'review',
    }));

    expect(html).toContain('class="editorial-list-row editorial-list-row--review"');
    expect(html).toContain(
      '<span class="editorial-list-row__media" data-media-fit="contain">',
    );
    expect(html).not.toContain('data-media-fit="cover"');
  });

  it('uses a text-led row and detail frame when resolved media is absent', () => {
    const row = renderToStaticMarkup(createElement(EditorialListRow, {
      href: '/reviews/no-public-cover/',
      title: '표지 없는 서평',
      description: '권리 확인 전에는 텍스트로만 보여 줍니다.',
      date: '2026.08.29',
    }));
    const detail = renderToStaticMarkup(createElement(EditorialDetailFrame, {
      title: '이미지 없는 생각',
      summary: '빈 미디어 칸을 만들지 않습니다.',
      metadata: createElement('time', { dateTime: '2026-08-29' }, '2026.08.29'),
      actions: createElement('span', null, 'actions'),
      children: createElement('p', null, '본문'),
    }));

    expect(row).toContain('editorial-list-row editorial-list-row--text-led');
    expect(row).not.toContain('editorial-list-row__media');
    expect(detail).toContain('editorial-detail-frame editorial-detail-frame--text-led');
    expect(detail).not.toContain('editorial-detail-frame__media');
    expect(detail).toMatch(/actions[\s\S]*본문/u);
  });

  it('preserves the complete book cover in review detail frames', () => {
    const html = renderToStaticMarkup(createElement(EditorialDetailFrame, {
      variant: 'review',
      title: 'The Long Way to a Small, Angry Planet',
      actions: null,
      media: createElement('img', {
        src: '/covers/the-long-way.jpg',
        alt: 'The Long Way cover',
      }),
      children: createElement('p', null, '본문'),
    }));

    expect(html).toContain(
      '<figure class="editorial-detail-frame__media" data-media-fit="contain">',
    );
    expect(html).not.toContain('data-media-fit="cover"');
  });

  it('renders like and comment as count-free statuses and only copy as a control', () => {
    const html = renderToStaticMarkup(createElement(DetailActionRail, {
      canonicalUrl: 'https://example.test/articles/one/',
    }));

    expect(html).toContain('좋아요 · 준비 중');
    expect(html).toContain('댓글 · 준비 중');
    expect(html).toContain('링크 복사');
    expect(html).toContain('aria-label="상세 동작"');
    expect(html.match(/<button\b/gu)).toHaveLength(1);
    expect(html).not.toMatch(/disabled|좋아요[^<]*\d|댓글[^<]*\d/u);
    expect(html).toContain('aria-live="polite"');
  });
});

describe('copyCanonicalUrl', () => {
  it('copies the resolved document canonical instead of a root-relative record href', async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(copyCanonicalUrl('/articles/one/', { writeText }, {
      canonicalHref: 'https://canonical.example/articles/one/',
      documentUrl: 'http://127.0.0.1:4391/articles/one/',
    })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://canonical.example/articles/one/');
  });

  it('absolutizes the record href against the document when canonical metadata is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(copyCanonicalUrl('/articles/one/', { writeText }, {
      canonicalHref: null,
      documentUrl: 'https://fallback.example/current/',
    })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://fallback.example/articles/one/');
  });

  it('writes the exact canonical URL and reports success', async () => {
    const writeText = vi.fn(async () => undefined);

    await expect(copyCanonicalUrl('https://example.test/articles/one/', { writeText }))
      .resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://example.test/articles/one/');
  });

  it('reports clipboard rejection without throwing', async () => {
    const writeText = vi.fn(async () => { throw new Error('permission denied'); });

    await expect(copyCanonicalUrl('https://example.test/articles/one/', { writeText }))
      .resolves.toBe('failed');
  });
});
