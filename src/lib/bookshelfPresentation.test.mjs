import { describe, expect, it } from 'vitest';
import {
  buildBookshelfPresentation,
  findRelatedBooks,
  formatLiteraryDate,
  getOneSentenceJudgment,
} from './bookshelfPresentation';
import { toRecordSummary } from './content/viewModels';

const localCover = {
  item: { id: 'cover', kind: 'book-cover', alt: '검증된 표지' },
  asset: { src: '/_astro/local-cover.jpg', width: 400, height: 600, format: 'jpg' },
};

const summarize = (entry) => toRecordSummary(entry, () => (
  entry.data.coverState === 'verified' ? localCover : undefined
));

function review(id, date, options = {}) {
  const title = options.title ?? `책 ${id}`;

  return {
    id,
    collection: 'reviews',
    data: {
      title,
      itemTitle: title,
      itemType: 'book',
      description: options.description ?? `${title}에 남은 판단이다. 이어지는 소개 문장이다.`,
      completedAt: new Date(date),
      createdAt: new Date(date),
      updatedAt: new Date(date),
      itemAuthor: options.itemAuthor ?? ['저자 한', '저자 두'],
      coverState: options.coverState ?? 'hold',
      coverMedia: options.coverState === 'verified' ? 'cover' : undefined,
      tags: options.tags ?? ['book', 'review', 'naver-archive'],
      status: 'published',
      draft: false,
    },
  };
}

describe('bookshelf presentation', () => {
  it('keeps the physical shelf finite while the year rail and judgments cover every review', () => {
    const reviews = [
      review('a', '2026-06-16', { coverState: 'verified' }),
      review('b', '2026-06-02', { coverState: 'verified' }),
      review('c', '2026-05-27', { coverState: 'verified' }),
      review('d', '2026-05-19', { coverState: 'verified' }),
      review('e', '2026-05-12', { coverState: 'verified' }),
      review('f', '2026-04-21', { coverState: 'verified' }),
      review('g', '2026-04-16', { coverState: 'verified' }),
      review('h', '2026-04-06', { coverState: 'verified' }),
      review('i', '2026-03-24', { coverState: 'verified' }),
      review('j', '2025-12-10'),
    ];

    const result = buildBookshelfPresentation(reviews, (...args) => {
      expect(args).toHaveLength(1);
      return summarize(args[0]);
    });

    expect(result.yearCounts).toEqual([
      { year: 2026, count: 9 },
      { year: 2025, count: 1 },
    ]);
    expect(result.shelfTiers.flat().map((entry) => entry.id)).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ]);
    expect(result.judgmentEntries.map((entry) => entry.id)).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
    ]);
    expect(result.missingCoverEntries.map((entry) => entry.id)).toEqual(['j']);
    expect(result.shelfTiers[0][0].media.asset.src).toBe('/_astro/local-cover.jpg');
    expect(result.shelfTiers[0][0].authors).toEqual(['저자 한', '저자 두']);
  });

  it('uses only the first authored sentence as the shelf judgment', () => {
    expect(getOneSentenceJudgment('첫 판단이다. 이 문장은 본문 소개다.')).toBe('첫 판단이다.');
    expect(getOneSentenceJudgment('질문으로 남는가? 다음 문장이다.')).toBe('질문으로 남는가?');
    expect(formatLiteraryDate(new Date('2026-06-16'))).toBe('2026.06.16');
  });

  it('places available covers in the approved literary shelf order without duplication', () => {
    const reviews = [
      review('art-thief', '2026-04-06', { coverState: 'verified' }),
      review('changing-their-minds', '2026-06-16', { coverState: 'verified' }),
      review('siddhartha', '2026-03-24', { coverState: 'verified' }),
      review('black-swan', '2026-05-27', { coverState: 'verified' }),
      review('poor-charlies-almanack', '2026-04-16', { coverState: 'verified' }),
      review('lord-of-the-flies', '2026-06-02', { coverState: 'verified' }),
      review('nevertheless', '2026-05-19', { coverState: 'verified' }),
      review('goethe-said-everything', '2026-05-12', { coverState: 'verified' }),
      review('another-book', '2026-06-20', { coverState: 'verified' }),
    ];

    const result = buildBookshelfPresentation(reviews, summarize);

    expect(result.shelfTiers.flat().map((entry) => entry.id)).toEqual([
      'changing-their-minds',
      'black-swan',
      'lord-of-the-flies',
      'goethe-said-everything',
      'nevertheless',
      'art-thief',
      'poor-charlies-almanack',
      'siddhartha',
    ]);
  });

  it('relates at most three books only through meaningful shared tags', () => {
    const current = review('current', '2026-06-16', { tags: ['book', 'review', 'risk'] });
    const candidates = [
      review('generic', '2026-06-15'),
      review('risk-a', '2026-06-14', { tags: ['book', 'risk'] }),
      review('risk-b', '2026-06-13', { tags: ['review', 'risk'] }),
      review('risk-c', '2026-06-12', { tags: ['risk'] }),
      review('risk-d', '2026-06-11', { tags: ['risk'] }),
    ];

    expect(findRelatedBooks(current, candidates).map((item) => ({
      id: item.entry.id,
      reason: item.relationshipReason,
    }))).toEqual([
      { id: 'risk-a', reason: '같은 주제 · risk' },
      { id: 'risk-b', reason: '같은 주제 · risk' },
      { id: 'risk-c', reason: '같은 주제 · risk' },
    ]);
  });
});
