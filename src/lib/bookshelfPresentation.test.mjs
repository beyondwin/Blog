import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildBookshelfPresentation,
  findRelatedBooks,
  formatBookWhisper,
  formatLiteraryDate,
  formatReadMonth,
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
      relationships: options.relationships ?? [],
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

  it('puts the most recent books first as a finite field of objects', () => {
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
      'another-book',
      'changing-their-minds',
      'lord-of-the-flies',
      'black-swan',
      'nevertheless',
      'goethe-said-everything',
      'poor-charlies-almanack',
      'art-thief',
    ]);
  });

  it('relates books only when a written reason exists', () => {
    const current = review('current', '2026-06-16', {
      relationships: [
        { target: 'reviews/risk-a', relation: 'related', reason: '같은 위험을 다른 각도에서 본다.' },
        { target: 'reviews/missing', relation: 'related', reason: '없는 책' },
        { target: 'articles/not-a-book', relation: 'related', reason: '글이다.' },
      ],
    });

    expect(findRelatedBooks(current, [
      review('risk-a', '2026-06-14'),
      review('risk-b', '2026-06-13'),
    ]).map((item) => ({
      id: item.entry.id,
      reason: item.relationshipReason,
    }))).toEqual([
      { id: 'risk-a', reason: '같은 위험을 다른 각도에서 본다.' },
    ]);
  });

  it('does not invent related books from structural tags', () => {
    const blackSwan = review('black-swan', '2026-05-27', { tags: ['book', 'review', 'risk'] });
    const factfulness = review('factfulness', '2025-11-17', { tags: ['book', 'review', 'risk'] });
    expect(findRelatedBooks(blackSwan, [factfulness])).toEqual([]);
  });

  it('formats a human finished month', () => {
    expect(formatReadMonth(new Date('2026-05-27'))).toBe('2026년 5월에 읽음');
  });

  it('does not repeat a publisher already named in the edition', () => {
    expect(formatBookWhisper(
      '동녘사이언스',
      '동녘사이언스 2018 개정증보판, 차익종·김현구 옮김',
    )).toBe('동녘사이언스 2018 개정증보판, 차익종·김현구 옮김');
    expect(formatBookWhisper('문학동네', '세계문학전집 173')).toBe('문학동네 · 세계문학전집 173');
    expect(formatBookWhisper('문학동네')).toBe('문학동네');
    expect(formatBookWhisper(undefined, '무선판')).toBe('무선판');
  });

  it('keeps book pages free of the literary shelf and staff tickets', async () => {
    const index = await readFile(new URL('../pages/reviews/index.astro', import.meta.url), 'utf8');
    const layout = await readFile(new URL('../layouts/ReviewLayout.astro', import.meta.url), 'utf8');
    const css = await readFile(new URL('../styles/press.css', import.meta.url), 'utf8');

    for (const source of [index, layout]) {
      expect(source).not.toContain('책장');
      expect(source).not.toContain('표지 확인 중');
      expect(source).not.toContain('headerVariant');
      expect(source).not.toContain('missingCoverEntries');
      expect(source).not.toContain('bookshelf-literary');
      expect(source).not.toContain('모두 ');
    }

    expect(index).toContain('SiteFooter');
    expect(index).toContain('book-objects');
    expect(index).toContain('book-diary');
    expect(index).toContain('book-cover--set" aria-hidden="true"');
    expect(layout).toContain('SiteFooter');
    expect(index).toContain('entry.title');
    expect(layout).toContain('itemTitle');
    expect(layout).toContain('formatReadMonth');
    expect(layout).toContain('formatBookWhisper');
    expect(layout).toContain('slot="header-mark"');
    expect(css).not.toMatch(/\.book-verdict\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.book-title\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.book-author\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/position:\s*fixed;[\s\S]*left:\s*12px/);
  });
});
