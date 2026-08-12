import { describe, expect, it } from 'vitest';
import type { SiteCollection, SiteEntry } from '../content';
import type { RecordSummary } from './viewModels';
import {
  isPublicEntry,
  selectUniqueHomeRecords,
  visibleCollectionKeys,
} from './publication';

function entry(
  collection: SiteCollection,
  id: string,
  status: 'review' | 'published' | 'archived' = 'published',
  draft = false,
): SiteEntry {
  return {
    collection,
    id,
    data: { status, draft },
  } as unknown as SiteEntry;
}

function summary(item: SiteEntry): RecordSummary {
  return {
    id: item.id,
    href: `/${item.collection}/${item.id}/`,
    collection: item.collection,
    typeLabel: item.collection,
    title: item.id,
    description: item.id,
    primaryDate: new Date('2026-08-12'),
    tags: [],
    authors: [],
  };
}

describe('publication selection', () => {
  it('publishes only explicit published non-drafts', () => {
    expect(isPublicEntry({ data: { status: 'published', draft: false } })).toBe(true);
    expect(isPublicEntry({ data: { status: 'review', draft: false } })).toBe(false);
    expect(isPublicEntry({ data: { status: 'archived', draft: false } })).toBe(false);
    expect(isPublicEntry({ data: { status: 'published', draft: true } })).toBe(false);
  });

  it('hides empty lanes in the stable collection order', () => {
    expect(visibleCollectionKeys({
      travel: [],
      reviews: [entry('reviews', 'book')],
      articles: [entry('articles', 'note')],
      ideas: [],
      analysis: [],
    })).toEqual(['articles', 'reviews']);
  });

  it('selects unique featured, open, and shelf records in input order', () => {
    const entries = [
      entry('analysis', 'analysis-first'),
      entry('reviews', 'review-first'),
      entry('articles', 'article-first'),
      entry('articles', 'article-second'),
      entry('reviews', 'review-second'),
      entry('ideas', 'idea-first'),
    ];

    const selected = selectUniqueHomeRecords(
      entries,
      { openRecords: 2, shelf: 2, memories: 3 },
      summary,
    );

    expect(selected.featuredTechnical?.href).toBe('/articles/article-first/');
    expect(selected.featuredReview?.href).toBe('/reviews/review-first/');
    expect(selected.openRecords.map((item) => item.href)).toEqual([
      '/analysis/analysis-first/',
      '/articles/article-second/',
    ]);
    expect(selected.shelf.map((item) => item.href)).toEqual(['/reviews/review-second/']);

    const allHrefs = [
      selected.featuredTechnical?.href,
      selected.featuredReview?.href,
      ...selected.openRecords.map((item) => item.href),
      ...selected.shelf.map((item) => item.href),
    ].filter(Boolean);
    expect(new Set(allHrefs).size).toBe(allHrefs.length);
    expect(selected).not.toHaveProperty('memories');
  });

  it('falls back to analysis for technical feature and excludes non-public entries', () => {
    const selected = selectUniqueHomeRecords(
      [
        entry('articles', 'review-article', 'review'),
        entry('analysis', 'published-analysis'),
        entry('reviews', 'draft-review', 'published', true),
      ],
      { openRecords: 3, shelf: 8 },
      summary,
    );

    expect(selected.featuredTechnical?.href).toBe('/analysis/published-analysis/');
    expect(selected.featuredReview).toBeUndefined();
    expect(selected.openRecords).toEqual([]);
    expect(selected.shelf).toEqual([]);
  });
});
