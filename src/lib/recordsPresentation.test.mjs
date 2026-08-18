import { describe, expect, it } from 'vitest';
import { articleSpecies, buildArticleIndex } from './recordsPresentation';

function article(id, tags = [], extra = {}) {
  return {
    id,
    collection: 'articles',
    data: {
      title: id,
      description: `${id} 판단.`,
      createdAt: new Date('2026-07-12'),
      updatedAt: new Date('2026-07-12'),
      tags,
      status: 'published',
      draft: false,
      ...extra,
    },
  };
}

describe('article index presentation', () => {
  it('marks source-grounded work as 조사 without exposing field names', () => {
    expect(articleSpecies(article('g', ['source-grounded']))).toBe('조사');
    expect(articleSpecies(article('e', ['AI']))).toBe('에세이');
  });

  it('builds a lead plus a ledger and no filter facets', () => {
    const result = buildArticleIndex([
      article('graphify-code-knowledge-graph-deep-dive', ['source-grounded']),
      article('ai-era-why-i-read', ['reading']),
    ]);

    expect(result.lead?.id).toBe('graphify-code-knowledge-graph-deep-dive');
    expect(result.lead?.species).toBe('조사');
    expect(result.lead?.hasEvidence).toBe(true);
    expect(result.lead?.monthLabel).toBe('7월');
    expect(result.entries.map((entry) => entry.id)).toEqual(['ai-era-why-i-read']);
    expect(result).not.toHaveProperty('topics');
    expect(result).not.toHaveProperty('years');
  });
});
