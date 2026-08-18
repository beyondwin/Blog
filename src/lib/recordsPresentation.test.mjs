import { describe, expect, it } from 'vitest';
import {
  articleJudgment,
  articleSpecies,
  buildArticleIndex,
  leftoverSentence,
  previousImpressions,
} from './recordsPresentation';

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

  it('uses the first emphasis as the investigation judgment', () => {
    const entry = article('graphify-code-knowledge-graph-deep-dive', ['source-grounded']);
    entry.body = 'Intro. **단독 진실 공급원으로 쓰기에는 아직 위험하다.**\n\n## 실제 구조\n';

    expect(articleJudgment(entry)).toBe('단독 진실 공급원으로 쓰기에는 아직 위험하다.');
    expect(articleJudgment(article('ai-era-why-i-read', ['reading']))).toBe('ai-era-why-i-read 판단.');
  });

  it('builds 이전 쇄 only from public article relationships', () => {
    const current = article('now', ['source-grounded'], {
      relationships: [
        { target: 'articles/older-public', relation: 'refines', reason: '직전 판단' },
        { target: 'articles/still-review', relation: 'extends', reason: '미발행' },
        { target: 'reviews/a-book', relation: 'related', reason: '책이 아님' },
      ],
    });

    expect(previousImpressions(current, [
      article('older-public', ['reading'], { title: '이전 판단' }),
    ])).toEqual([
      { href: '/articles/older-public/', title: '이전 판단', reason: '직전 판단' },
    ]);
    expect(previousImpressions(article('now'), [article('older-public')])).toEqual([]);
  });

  it('keeps at most one leftover sentence on a thought page href', () => {
    expect(leftoverSentence({
      linked: [{ slug: 'first-thought', claimKo: '남는 문장' }],
      related: [{ slug: 'second-thought', claimKo: '다른 문장' }],
    })).toEqual({
      href: '/memory/first-thought/',
      claim: '남는 문장',
    });
    expect(leftoverSentence({ linked: [], related: [] })).toBeUndefined();
  });
});
