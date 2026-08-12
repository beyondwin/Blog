import { describe, expect, it } from 'vitest';
import { relationshipSchema, reviewFields } from './contracts';

describe('content contracts', () => {
  it('accepts at most three reasoned relationships', () => {
    const item = { target: 'articles/postgresql-bm25-pg-search', relation: 'extends', reason: '검색 판단을 확장한다.' };
    expect(relationshipSchema.array().max(3).safeParse([item, item, item]).success).toBe(true);
    expect(relationshipSchema.array().max(3).safeParse([item, item, item, item]).success).toBe(false);
  });

  it('supports a single author or author list during review migration', () => {
    expect(reviewFields.itemAuthor.safeParse('장강명').success).toBe(true);
    expect(reviewFields.itemAuthor.safeParse(['한스 로슬링', '올라 로슬링']).success).toBe(true);
  });

  it('rejects an unexplained relationship', () => {
    expect(relationshipSchema.safeParse({ target: 'memory/example', relation: 'related', reason: '' }).success).toBe(false);
  });
});
