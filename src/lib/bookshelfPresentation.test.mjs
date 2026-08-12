import { describe, expect, it } from 'vitest';
import {
  buildBookshelfPresentation,
  findRelatedBooks,
  formatLiteraryDate,
  getOneSentenceJudgment,
} from './bookshelfPresentation';

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
      coverImage: options.coverImage,
      tags: options.tags ?? ['book', 'review', 'naver-archive'],
      status: 'published',
      draft: false,
    },
  };
}

describe('bookshelf presentation', () => {
  it('keeps the physical shelf finite while the year rail and judgments cover every review', () => {
    const reviews = [
      review('a', '2026-06-16', { coverImage: 'https://example.com/a.jpg' }),
      review('b', '2026-06-02', { coverImage: 'https://example.com/b.jpg' }),
      review('c', '2026-05-27', { coverImage: 'https://example.com/c.jpg' }),
      review('d', '2026-05-19', { coverImage: 'https://example.com/d.jpg' }),
      review('e', '2026-05-12', { coverImage: 'https://example.com/e.jpg' }),
      review('f', '2026-04-21', { coverImage: 'https://example.com/f.jpg' }),
      review('g', '2026-04-16', { coverImage: 'https://example.com/g.jpg' }),
      review('h', '2026-04-06', { coverImage: 'https://example.com/h.jpg' }),
      review('i', '2026-03-24', { coverImage: 'https://example.com/i.jpg' }),
      review('j', '2025-12-10'),
    ];

    const result = buildBookshelfPresentation(reviews);

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
  });

  it('uses only the first authored sentence as the shelf judgment', () => {
    expect(getOneSentenceJudgment('첫 판단이다. 이 문장은 본문 소개다.')).toBe('첫 판단이다.');
    expect(getOneSentenceJudgment('질문으로 남는가? 다음 문장이다.')).toBe('질문으로 남는가?');
    expect(formatLiteraryDate(new Date('2026-06-16'))).toBe('2026.06.16');
  });

  it('places available covers in the approved literary shelf order without duplication', () => {
    const reviews = [
      review('art-thief', '2026-04-06', { coverImage: 'https://example.com/art-thief.jpg' }),
      review('changing-their-minds', '2026-06-16', { coverImage: 'https://example.com/changing.jpg' }),
      review('siddhartha', '2026-03-24', { coverImage: 'https://example.com/siddhartha.jpg' }),
      review('black-swan', '2026-05-27', { coverImage: 'https://example.com/black-swan.jpg' }),
      review('poor-charlies-almanack', '2026-04-16', { coverImage: 'https://example.com/charlie.jpg' }),
      review('lord-of-the-flies', '2026-06-02', { coverImage: 'https://example.com/lord.jpg' }),
      review('nevertheless', '2026-05-19', { coverImage: 'https://example.com/nevertheless.jpg' }),
      review('goethe-said-everything', '2026-05-12', { coverImage: 'https://example.com/goethe.jpg' }),
      review('another-book', '2026-06-20', { coverImage: 'https://example.com/another.jpg' }),
    ];

    const result = buildBookshelfPresentation(reviews);

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
