import { describe, expect, it } from 'vitest';

import {
  answerMetrics,
  classifyDeterministicFailure,
  countBoundaryLeaks,
  deriveBoundaryIdentifiers,
  evaluateCapturedCaseMetrics,
} from '../../src/modules/public-answer/evaluation/answer-metrics.js';
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

  it('uses fused retrieval rank rather than cited evidence and actual character-weighted semantic support', () => {
    expect(evaluateCapturedCaseMetrics({
      requiredRecordIds: ['articles/a', 'articles/b'],
      fusedRecordIds: ['articles/x', 'articles/a', 'articles/y', 'articles/b', 'articles/z'],
      citedEvidenceIds: ['evidence-z'],
      catalogEvidenceIds: new Set(['evidence-z']),
      sentenceUnits: [
        { id: 'sentence-1', characters: 19, critical: true },
        { id: 'sentence-2', characters: 1, critical: true },
      ],
      supportedSentenceIds: new Set(['sentence-1']),
      deterministicPass: true,
      contradictedSentenceIds: [],
    })).toEqual({
      retrieval: {
        hitAt3: 1,
        recallAt5: 1,
        ndcgAt5: (1 / Math.log2(3) + 1 / Math.log2(5)) / (1 + 1 / Math.log2(3)),
      },
      citedEvidenceCount: 1,
      correctCitationCount: 1,
      sentenceCharacters: 20,
      supportedSentenceCharacters: 19,
      criticalCharacters: 20,
      supportedCriticalCharacters: 19,
      grounded: false,
    });
  });

  it('derives excluded/tombstoned boundaries and classifies every integrity and fallback failure', () => {
    const evidenceId = 'e'.repeat(64);
    const boundaries = deriveBoundaryIdentifiers(
      ['articles/approved', 'articles/excluded', 'reviews/excluded'],
      new Set(['articles/approved']),
      new Set(['record:thoughts/tombstoned', `evidence:${evidenceId}`]),
      new Map([[evidenceId, 'reviews/evidence-tombstoned']]),
    );
    expect([...boundaries.recordIds]).toEqual([
      'articles/excluded', 'reviews/evidence-tombstoned', 'reviews/excluded', 'thoughts/tombstoned',
    ]);
    expect([...boundaries.evidenceIds]).toEqual([evidenceId]);
    for (const reason of [
      'response-evidence-set', 'catalog-evidence-set', 'catalog-evidence-mismatch',
      'answer-release-mismatch', 'excerpt-integrity', 'canonical-locator',
    ]) expect(classifyDeterministicFailure(reason)).toBe('integrity');
    for (const reason of ['claim-count', 'claim-text', 'claim-citations', 'unsafe-claim', 'quote-mismatch', 'sentence-units']) {
      expect(classifyDeterministicFailure(reason)).toBe('invalid-fallback');
    }
  });

  it('finds boundary sentinels in output or retained redacted telemetry without persisting them', () => {
    const evidenceId = 'e'.repeat(64);
    const boundaries = deriveBoundaryIdentifiers(
      ['articles/approved'],
      new Set(['articles/approved']),
      new Set(['record:articles/private-sentinel', `evidence:${evidenceId}`]),
      new Map([[evidenceId, 'reviews/evidence-private-sentinel']]),
    );
    expect(countBoundaryLeaks({
      outputRecordIds: ['articles/private-sentinel'],
      outputEvidenceIds: [],
      redactedTelemetry: [{ resultKind: 'answer' }],
      boundaryRecordIds: boundaries.recordIds,
      boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
    expect(countBoundaryLeaks({
      outputRecordIds: [],
      outputEvidenceIds: [evidenceId],
      redactedTelemetry: [{ resultKind: 'answer' }],
      boundaryRecordIds: boundaries.recordIds,
      boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
    expect(countBoundaryLeaks({
      outputRecordIds: [], outputEvidenceIds: [],
      redactedTelemetry: [{ resultKind: 'answer', leaked: 'articles/private-sentinel' }],
      boundaryRecordIds: boundaries.recordIds, boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
    expect(countBoundaryLeaks({
      outputRecordIds: [], outputEvidenceIds: [], redactedTelemetry: [{ resultKind: 'answer', leaked: evidenceId }],
      boundaryRecordIds: boundaries.recordIds, boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
    expect(countBoundaryLeaks({
      outputRecordIds: [], outputEvidenceIds: [], redactedTelemetry: [{ resultKind: 'answer' }],
      outputText: '공개 근거만 사용한 답변입니다.',
      boundaryRecordIds: boundaries.recordIds, boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(0);
    expect(countBoundaryLeaks({
      outputRecordIds: [], outputEvidenceIds: [], redactedTelemetry: [{ resultKind: 'answer' }],
      outputText: '숨겨진 경로 /articles/private-sentinel/ 를 참고했습니다.',
      boundaryRecordIds: boundaries.recordIds, boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
    expect(countBoundaryLeaks({
      outputRecordIds: [], outputEvidenceIds: [], redactedTelemetry: [{ resultKind: 'answer' }],
      outputText: `근거 식별자 ${evidenceId} 는 노출하면 안 됩니다.`,
      boundaryRecordIds: boundaries.recordIds, boundaryEvidenceIds: boundaries.evidenceIds,
    })).toBe(1);
  });
});
