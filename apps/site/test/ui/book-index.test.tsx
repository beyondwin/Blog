import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePublicRecord, type PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

function reviewCoverAsset(recordId: string, approved: boolean): ReleaseAsset {
  const sourceAsset = `/assets/content/reviews/${recordId}/cover.jpg`;
  const sourceChecksum = `sha256:${'0'.repeat(64)}`;
  return {
    id: 'cover',
    collection: 'reviews',
    recordId,
    kind: 'book-cover',
    alt: `${recordId} 표지`,
    credit: 'Test bookseller',
    provenanceUrl: `https://covers.example.com/${recordId}.jpg`,
    verifiedAt: '2026-08-29',
    rightsNote: approved ? 'Public redistribution approved.' : 'Identification only.',
    width: 400,
    height: 600,
    sourceChecksum,
    sources: [
      {
        type: 'image/avif',
        candidates: [{
          src: `/assets/content/reviews/${recordId}/cover-400w.avif`,
          width: 400,
          height: 600,
          checksum: `sha256:${'1'.repeat(64)}`,
        }],
      },
      {
        type: 'image/webp',
        candidates: [{
          src: `/assets/content/reviews/${recordId}/cover-400w.webp`,
          width: 400,
          height: 600,
          checksum: `sha256:${'2'.repeat(64)}`,
        }],
      },
    ],
    fallback: {
      src: sourceAsset,
      format: 'jpg',
      checksum: `sha256:${'3'.repeat(64)}`,
      candidates: [{
        src: sourceAsset,
        width: 400,
        height: 600,
        checksum: `sha256:${'3'.repeat(64)}`,
      }],
    },
    redistributionEvidence: approved ? {
      state: 'approved',
      decision: 'approve-public-redistribution',
      decisionDocument: `docs/notes/project/assets/review-cover-rights/${recordId}/redistribution-decision.yml`,
      decisionChecksum: `sha256:${'d'.repeat(64)}`,
      sourceAsset,
      sourceChecksum,
      width: 400,
      height: 600,
      bibliographicIdentity: {
        title: recordId,
        authors: ['저자'],
        publisher: '출판사',
        isbn13: '9788990247674',
        editionLabel: '출판사 2026 초판',
        publicationYear: 2026,
      },
    } : undefined,
  };
}

const approvedCover = reviewCoverAsset('black-swan', true);
const forgedCoverWithoutEvidence = reviewCoverAsset('warning-cover', false);

function review(id: string, overrides: Record<string, unknown> = {}): ReviewRecord {
  const parsed = parsePublicRecord({
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
    itemTitle: id,
    authors: ['저자'],
    readEditionVerified: true,
    ...overrides,
  });
  if (parsed.collection !== 'reviews') throw new Error('expected review fixture');
  return parsed;
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
    expect(html).toContain('<span class="editorial-list-row__media" data-media-fit="contain">');
    expect(html).not.toContain('data-media-fit="cover"');
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
