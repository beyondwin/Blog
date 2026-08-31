import { describe, expect, it } from 'vitest';

import { answerMetrics } from '../../src/modules/public-answer/evaluation/answer-metrics.js';
import { retrievalMetrics } from '../../src/modules/public-answer/evaluation/retrieval-metrics.js';

describe('evaluation metric arithmetic', () => {
  it('computes Hit@3, macro Recall@5, and binary nDCG@5 with explicit empty denominators', () => {
    expect(retrievalMetrics(['articles/a'], ['articles/x', 'articles/a', 'articles/y'])).toMatchObject({ hitAt3: 1, recallAt5: 1 });
    expect(retrievalMetrics(['articles/a', 'articles/b'], ['articles/a'])).toMatchObject({
      hitAt3: 1,
      recallAt5: 0.5,
      ndcgAt5: 1 / (1 + 1 / Math.log2(3)),
    });
    expect(retrievalMetrics([], [])).toEqual({ hitAt3: 0, recallAt5: null, ndcgAt5: null });
  });

  it('computes citation correctness, weighted sentence coverage, critical coverage, and grounding', () => {
    expect(answerMetrics({
      citedEvidenceIds: ['a', 'b'], catalogEvidenceIds: new Set(['a']),
      sentenceUnits: [{ characters: 9, supported: true, critical: true }, { characters: 1, supported: false, critical: true }],
      deterministicPass: true, semanticPass: false,
    })).toEqual({ citationCorrectness: 0.5, sentenceCitationCoverage: 0.9, criticalCoverage: 0.9, grounded: false });
    expect(answerMetrics({ citedEvidenceIds: [], catalogEvidenceIds: new Set(), sentenceUnits: [], deterministicPass: false, semanticPass: false }))
      .toEqual({ citationCorrectness: null, sentenceCitationCoverage: null, criticalCoverage: null, grounded: false });
  });
});
