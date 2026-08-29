import { describe, expect, it, vi } from 'vitest';
import {
  navigateToReadingOrigin,
  safeReadingFallback,
} from '../../src/ui/navigation/fallback';

describe('safeReadingFallback', () => {
  it.each([
    [{ kind: 'articles', anchorId: 'article-2' }, 'reviews', '/articles/#article-2'],
    [{ kind: 'reviews', anchorId: 'review-2' }, 'articles', '/reviews/#review-2'],
    [{ kind: 'analysis', anchorId: 'analysis-2' }, 'articles', '/analysis/#analysis-2'],
    [{ kind: 'ideas' }, 'articles', '/ideas/'],
    [{ kind: 'travel', anchorId: 'seoul-1' }, 'articles', '/travel/#seoul-1'],
    [{ kind: 'tags', anchorId: 'typescript' }, 'articles', '/tags/#typescript'],
  ])('derives a safe internal route from an allowlisted origin', (origin, collection, expected) => {
    expect(safeReadingFallback(origin, collection as never)).toBe(expected);
  });

  it('encodes a bounded search query and result anchor', () => {
    expect(safeReadingFallback(
      { kind: 'search', query: 'AI & 판단', anchorId: 'result-2' },
      'articles',
    )).toBe('/search/?q=AI+%26+%ED%8C%90%EB%8B%A8#result-2');
  });

  it('uses only an allowlisted record collection when the origin is missing or invalid', () => {
    expect(safeReadingFallback(null, 'reviews')).toBe('/reviews/');
    expect(safeReadingFallback({ kind: 'articles', anchorId: '../evil' }, 'memory')).toBe('/memory/');
  });
});

describe('navigateToReadingOrigin', () => {
  it('uses history.back only for a validated origin with the eligible marker', () => {
    const back = vi.fn();
    const assign = vi.fn();
    expect(navigateToReadingOrigin({
      history: { state: { keep: true, bwOrigin: { kind: 'articles', anchorId: 'article-2' }, bwHistoryReturnEligible: true }, back },
      location: { assign },
    }, 'reviews')).toBe('back');
    expect(back).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    [{ bwOrigin: { kind: 'articles', anchorId: 'article-2' } }, '/articles/#article-2'],
    [{ bwOrigin: { kind: 'articles', anchorId: '../evil' }, bwHistoryReturnEligible: true }, '/reviews/'],
    [null, '/reviews/'],
  ])('normally navigates to the derived fallback without validated eligibility', (state, expected) => {
    const back = vi.fn();
    const assign = vi.fn();
    expect(navigateToReadingOrigin({ history: { state, back }, location: { assign } }, 'reviews')).toBe('fallback');
    expect(back).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(expected);
  });
});
