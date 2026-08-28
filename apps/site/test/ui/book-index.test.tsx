import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const approvedCover = {
  id: 'cover',
  kind: 'book-cover',
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
  redistributionEvidence: {
    state: 'approved',
    decision: 'approve-public-redistribution',
  },
} as ReleaseAsset;

const forgedCoverWithoutEvidence = {
  ...approvedCover,
  fallback: {
    ...approvedCover.fallback,
    src: '/assets/content/reviews/warning-cover/cover.jpg',
  },
  redistributionEvidence: undefined,
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

describe('public review editorial ledger', () => {
  it('renders one canonical row per review with truthful approved-cover and text-led variants', () => {
    const html = renderToStaticMarkup(createElement(BookIndexPage, {
      records: [
        review('warning-cover', {
          title: '권리 경고 표지',
          completedAt: '2026-08-28T00:00:00.000Z',
          verdict: '표지 없이 판정을 남긴다.',
          coverState: 'verified',
          coverMedia: 'cover',
        }),
        review('black-swan', {
          title: '블랙 스완',
          completedAt: '2026-08-29T00:00:00.000Z',
          verdict: '불확실성을 몸으로 읽는다.',
          coverState: 'verified',
          coverMedia: 'cover',
        }),
      ],
      assets: new Map([
        ['reviews/black-swan/cover', approvedCover],
        ['reviews/warning-cover/cover', forgedCoverWithoutEvidence],
      ]),
    }));

    expect(html).toContain('<h1>서평</h1>');
    expect(html.match(/class="editorial-list-row(?: |")/gu)).toHaveLength(2);
    expect(html.indexOf('블랙 스완')).toBeLessThan(html.indexOf('권리 경고 표지'));
    expect(html).toContain('불확실성을 몸으로 읽는다.');
    expect(html).toContain('표지 없이 판정을 남긴다.');
    expect(html).toContain('<time dateTime="2026-08-29">2026.08.29</time>');
    expect(html).toContain('data-media-fit="contain"');
    expect(html).toContain('width="400" height="600"');
    expect(html.match(/href="\/reviews\/black-swan\/"/gu)).toHaveLength(1);
    expect(html.match(/href="\/reviews\/warning-cover\/"/gu)).toHaveLength(1);
    expect(html).not.toContain('/assets/content/reviews/warning-cover/');
    expect(html).not.toMatch(/book-cover--set|book-objects|book-diary/u);
  });

  it('uses the exact review noun in the empty state', () => {
    const html = renderToStaticMarkup(createElement(BookIndexPage, {
      records: [],
      assets: new Map(),
    }));
    expect(html).toContain('<h1>서평</h1>');
    expect(html).toContain('아직 공개한 서평이 없습니다.');
    expect(html).not.toContain('아직 공개한 책');
  });
});
