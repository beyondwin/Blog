import { describe, expect, it } from 'vitest';

import {
  GENERATION_MODEL,
  buildEvaluationReport,
} from '../../src/modules/public-answer/evaluation/evaluation-report.js';
import { PROVIDER_MODEL_POLICY } from '../../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

describe('evaluation report identity', () => {
  it('uses the current Luna generation model', () => {
    expect(GENERATION_MODEL).toBe('gpt-5.6-luna');
    expect(GENERATION_MODEL).toBe(PROVIDER_MODEL_POLICY.generationModel);
    const report = buildEvaluationReport({
      mode: 'first-slice-offline',
      contentReleaseId: '1'.repeat(64),
      answerReleaseId: '2'.repeat(64),
      corpusApprovalHash: `sha256:${'a'.repeat(64)}`,
      embeddingSource: 'fixture',
      embeddingReceiptHash: `sha256:${'b'.repeat(64)}`,
      runnableCount: 1,
      deferredCount: 0,
      cases: [{
        caseId: 'dev-01-reading-judgment',
        status: 'runnable',
        resultKind: 'answer',
        evidenceIds: ['3'.repeat(64)],
        grounded: true,
        contractValid: true,
        latencyBucket: '<1s',
        tokenBucket: '0',
      }],
      absoluteFailures: {},
      startedAt: '2026-09-02T00:00:00.000Z',
      completedAt: '2026-09-02T00:00:01.000Z',
    });
    expect(report.generationModel).toBe('gpt-5.6-luna');
    expect(report.embeddingModel).toBe('text-embedding-3-large');
  });
});
