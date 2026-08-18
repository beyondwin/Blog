import { describe, expect, it } from 'vitest';
import { buildHomePresentation, selectHomeThought } from './homePresentation';
import { toRecordSummary } from './content/viewModels';

const localCover = {
  item: { id: 'cover', kind: 'book-cover', alt: '검증된 표지' },
  asset: { src: '/_astro/local-cover.jpg', width: 400, height: 600, format: 'jpg' },
};

function article(id, title, date) {
  return {
    id,
    collection: 'articles',
    data: {
      title,
      description: `${title} 설명`,
      createdAt: new Date(date),
      updatedAt: new Date(date),
      tags: ['AI'],
      status: 'published',
      draft: false,
    },
  };
}

function review(id, title, date) {
  return {
    id,
    collection: 'reviews',
    data: {
      title,
      itemTitle: title,
      itemType: 'book',
      description: `${title} 한 문장 판단`,
      completedAt: new Date(date),
      createdAt: new Date(date),
      updatedAt: new Date(date),
      itemAuthor: ['저자'],
      coverState: 'verified',
      coverMedia: 'cover',
      tags: ['book'],
      status: 'published',
      draft: false,
    },
  };
}

describe('home presentation', () => {
  it('prefers public lead ids and never features unpublished review-queue slugs', () => {
    const articles = [
      article('uncle-bob-ai-code-review-evidence', '올리면 안 되는 글', '2026-07-26'),
      article('lazycodex-agent-harness-analysis', 'LazyCodex', '2026-06-24'),
      article('ai-design-references', 'AI 디자인 도구를 보는 기준', '2026-05-16'),
    ];
    const reviews = [
      review('changing-their-minds', '그들의 생각을 바꾸는 방법', '2026-06-16'),
      review('black-swan', '블랙스완', '2026-05-27'),
      review('siddhartha', '싯다르타', '2026-03-24'),
    ];

    const result = buildHomePresentation(
      { articles, reviews },
      (entry) => toRecordSummary(entry, () => localCover),
    );

    expect(result.featuredArticle?.id).toBe('lazycodex-agent-harness-analysis');
    expect(result.featuredReview?.id).toBe('changing-their-minds');
    expect(result.moreArticles.map((entry) => entry.id)).toEqual(['ai-design-references']);
    expect(result.moreBooks.map((entry) => entry.id)).toEqual(['black-swan', 'siddhartha']);
    expect(result.moreArticles).toHaveLength(1);
    expect(result).not.toHaveProperty('openRecords');
    expect(result).not.toHaveProperty('featuredReading');
  });

  it('skips a preferred article id that is absent from the public input', () => {
    const result = buildHomePresentation({
      articles: [article('ai-design-references', 'AI 디자인 도구를 보는 기준', '2026-05-16')],
      reviews: [review('black-swan', '블랙스완', '2026-05-27')],
    });

    expect(result.featuredArticle?.id).toBe('ai-design-references');
    expect(result.featuredReview?.id).toBe('black-swan');
  });

  it('selects a single home thought with a page href', () => {
    const thought = selectHomeThought([
      { slug: 'other', claimKo: '다른 문장' },
      { slug: 'personal-sites-should-show-records-first', claimKo: '기록이 먼저다' },
    ]);

    expect(thought).toEqual({
      slug: 'personal-sites-should-show-records-first',
      claimKo: '기록이 먼저다',
      href: '/memory/personal-sites-should-show-records-first/',
    });
  });
});
