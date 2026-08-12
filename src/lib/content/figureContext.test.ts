import { describe, expect, it } from 'vitest';
import { resolveFigureContext } from './figureContext';

describe('article Figure context', () => {
  it('derives a canonical article collection and slug from its detail route', () => {
    expect(resolveFigureContext('/articles/pgvector-hybrid-search/')).toEqual({
      collection: 'articles',
      slug: 'pgvector-hybrid-search',
    });
  });

  it('rejects non-content and nested paths instead of guessing an asset owner', () => {
    expect(() => resolveFigureContext('/search/')).toThrow('content detail route');
    expect(() => resolveFigureContext('/articles/nested/slug/')).toThrow('content detail route');
  });
});
