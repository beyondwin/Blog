import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import {
  buildBookshelfPresentation,
  getOneSentenceJudgment,
} from '../../src/ui/reviews/bookshelfPresentation';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

const cover = {
  id: 'cover',
  fallback: { src: '/assets/content/reviews/a/cover.jpg' },
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

describe('bookshelf presentation', () => {
  it('takes the first sentence as the judgment', () => {
    expect(getOneSentenceJudgment('지난달 읽은 책이다. 다음 문장.')).toBe('지난달 읽은 책이다.');
    expect(getOneSentenceJudgment('종결 없는 판정')).toBe('종결 없는 판정');
  });

  it('builds two shelf tiers of four and keeps the ninth book in the diary only', () => {
    const records = Array.from({ length: 9 }, (_, index) => review(`book-${index}`, {
      completedAt: `2026-08-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`,
      verdict: `판정 ${index}이다.`,
      coverState: index === 8 ? 'hold' : 'verified',
      coverMedia: index === 8 ? undefined : 'cover',
    }));
    const assets = new Map<string, ReleaseAsset>(
      records.flatMap((record) => (
        record.coverMedia
          ? [[`reviews/${record.id}/cover`, cover] as const]
          : []
      )),
    );
    const result = buildBookshelfPresentation(records, assets);
    expect(result.shelfTiers).toHaveLength(2);
    expect(result.shelfTiers[0]).toHaveLength(4);
    expect(result.shelfTiers[1]).toHaveLength(4);
    expect(result.shelfTiers.flat().map((item) => item.id)).not.toContain('book-8');
    expect(result.diary[0]?.year).toBe(2026);
    expect(result.diary[0]?.entries).toHaveLength(9);
    expect(result.diary[0]?.entries[8]?.coverAsset).toBeUndefined();
    expect(result.shelfTiers[0]?.[0]?.coverAsset).toEqual(cover);
    expect(result.shelfTiers[0]?.[0]?.verdict).toBe('판정 0이다.');
  });

  it('returns empty tiers for no reviews', () => {
    expect(buildBookshelfPresentation([], new Map())).toEqual({ shelfTiers: [], diary: [] });
  });
});
