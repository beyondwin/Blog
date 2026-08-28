import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import {
  buildBookshelfPresentation,
  formatReviewDate,
  getOneSentenceJudgment,
} from '../../src/ui/reviews/bookshelfPresentation';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const approvedCover = {
  id: 'cover',
  kind: 'book-cover',
  fallback: { src: '/assets/content/reviews/a/cover.jpg' },
  redistributionEvidence: {
    state: 'approved',
    decision: 'approve-public-redistribution',
  },
} as ReleaseAsset;

const forgedCoverWithoutEvidence = {
  id: 'cover',
  kind: 'book-cover',
  fallback: { src: '/assets/content/reviews/warning-cover/cover.jpg' },
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
    publisher: '출판사',
    editionLabel: '출판사 2026 초판',
    ...overrides,
  } as ReviewRecord;
}

describe('review editorial presentation', () => {
  it('takes the first sentence as the judgment', () => {
    expect(getOneSentenceJudgment('지난달 읽은 책이다. 다음 문장.')).toBe('지난달 읽은 책이다.');
    expect(getOneSentenceJudgment('종결 없는 판정')).toBe('종결 없는 판정');
  });

  it('orders every review by completedAt then createdAt and preserves its editorial facts', () => {
    const result = buildBookshelfPresentation([
      review('created-fallback', {
        title: '생성일 기준 서평',
        createdAt: '2026-08-20T00:00:00.000Z',
        verdict: '생성일을 사용한다. 다음 문장은 목록에 나오지 않는다.',
        coverState: 'hold',
      }),
      review('approved-cover', {
        title: '승인된 표지의 서평',
        completedAt: '2026-08-21T00:00:00.000Z',
        verdict: '판정이 먼저 남는다. 두 번째 문장.',
        coverState: 'verified',
        coverMedia: 'cover',
      }),
      review('warning-cover', {
        title: '권리 경고 표지의 서평',
        completedAt: '2026-08-19T00:00:00.000Z',
        verdict: '표지 없이도 판단을 읽는다.',
        coverState: 'verified',
        coverMedia: 'cover',
      }),
      review('unverified-edition', {
        completedAt: '2026-08-18T00:00:00.000Z',
        coverState: 'verified',
        coverMedia: 'cover',
        readEditionVerified: false,
      }),
    ], new Map([
      ['reviews/approved-cover/cover', approvedCover],
      ['reviews/warning-cover/cover', forgedCoverWithoutEvidence],
      ['reviews/unverified-edition/cover', approvedCover],
    ]));

    expect(result.map(({ id }) => id)).toEqual([
      'approved-cover',
      'created-fallback',
      'warning-cover',
      'unverified-edition',
    ]);
    expect(result[0]).toMatchObject({
      authors: ['저자'],
      coverAsset: approvedCover,
      date: '2026-08-21T00:00:00.000Z',
      edition: '출판사 2026 초판',
      rightsState: 'approved',
      verdict: '판정이 먼저 남는다.',
    });
    expect(result[1]).toMatchObject({ date: '2026-08-20T00:00:00.000Z', rightsState: 'hold' });
    expect(result[2]).toMatchObject({ rightsState: 'warning' });
    expect(result[2]?.coverAsset).toBeUndefined();
    expect(result[3]).toMatchObject({ rightsState: 'unverified' });
    expect(result[3]?.coverAsset).toBeUndefined();
  });

  it('formats review dates as fixed tabular editorial dates', () => {
    expect(formatReviewDate('2026-08-29T04:00:00.000Z')).toBe('2026.08.29');
  });

  it('returns an empty ledger for no reviews', () => {
    expect(buildBookshelfPresentation([], new Map())).toEqual([]);
  });
});
