import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const cover = {
  id: 'cover',
  alt: '블랙 스완 표지',
  width: 400,
  height: 600,
  sources: [
    { type: 'image/avif', candidates: [{ src: '/assets/content/reviews/black-swan/cover.avif', width: 400 }] },
    { type: 'image/webp', candidates: [{ src: '/assets/content/reviews/black-swan/cover.webp', width: 400 }] },
  ],
  fallback: {
    src: '/assets/content/reviews/black-swan/cover.jpg',
    candidates: [{ src: '/assets/content/reviews/black-swan/cover.jpg', width: 400 }],
  },
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

describe('book index objects and diary', () => {
  it('renders cover objects, a yearly diary, record anchors, and a hold plate', () => {
    const html = renderToStaticMarkup(createElement(BookIndexPage, {
      records: [
        review('black-swan', {
          title: '블랙 스완',
          completedAt: '2026-05-27T00:00:00.000Z',
          verdict: '불확실성을 몸으로 읽는다.',
          coverState: 'verified',
          coverMedia: 'cover',
        }),
        review('devotion-of-suspect-x', {
          title: '용의자 X의 헌신',
          completedAt: '2026-03-01T00:00:00.000Z',
          verdict: '헌신의 형태를 남긴다.',
          coverState: 'hold',
        }),
      ],
      assets: new Map([['reviews/black-swan/cover', cover]]),
    }));
    expect(html).toContain('class="book-objects"');
    expect(html).toContain('class="book-diary"');
    expect(html).toContain('<h2>2026</h2>');
    expect(html).toContain('id="record-reviews-black-swan"');
    expect(html).toContain('href="/reviews/black-swan/"');
    expect(html).toMatch(/class="book-cover book-cover--set"[^>]*>[\s\S]*용의자 X의 헌신/u);
    expect(html).not.toContain('record-row');
  });

  it('renders the empty copy when there are no reviews', () => {
    const html = renderToStaticMarkup(createElement(BookIndexPage, {
      records: [],
      assets: new Map(),
    }));
    expect(html).toContain('아직 공개한 책이 없습니다.');
  });
});
