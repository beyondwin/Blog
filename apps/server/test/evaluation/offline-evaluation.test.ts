import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { classifyPublicEvaluation } from '../../src/modules/public-answer/evaluation/public-eval-classifier.js';
import { buildEvaluationReport, verifyProductionEvaluationReport } from '../../src/modules/public-answer/evaluation/evaluation-report.js';
import { providerChecksum } from '../../src/modules/public-answer/infrastructure/openai/provider-json.js';
import { parseEvaluationMode, preflightProviderLiveEvaluation } from '../../src/eval-public-answer.js';

const checksum = (character: string) => `sha256:${character.repeat(64)}`;

describe('offline public-answer evaluation', () => {
  it('classifies the tracked public manifest only from independently approved IDs and bound approval hash', async () => {
    const manifest = JSON.parse(await readFile(resolve('tests/fixtures/public-answer/eval-manifest.v1.json'), 'utf8'));
    const approval = JSON.parse(await readFile(resolve('src/data/public-answer-corpus-approval.v1.json'), 'utf8'));
    const classified = classifyPublicEvaluation(manifest, approval, classifiedApprovalHash(approval));
    expect(classified.runnable.map((item) => item.id)).toEqual(['dev-01-reading-judgment']);
    expect(classified.deferred).toHaveLength(19);
    expect(classified.corpusMetricStatus).toBe('not_measured');
    expect(() => classifyPublicEvaluation(manifest, approval, checksum('f'))).toThrow(/approval|checksum/i);
    expect(classifyPublicEvaluation(manifest, { schemaVersion: 1, entries: [] }, classifiedApprovalHash({ schemaVersion: 1, entries: [] })).runnable).toEqual([]);
  });

  it('writes a redacted first-slice report and production readiness rejects non-live/stale/fixture/not-measured evidence', () => {
    const report = buildEvaluationReport({
      mode: 'first-slice-offline', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
      corpusApprovalHash: checksum('a'), embeddingSource: 'fixture', embeddingReceiptHash: checksum('b'),
      runnableCount: 1, deferredCount: 19,
      cases: [{ caseId: 'dev-01-reading-judgment', status: 'runnable', resultKind: 'answer', evidenceIds: ['3'.repeat(64)], grounded: true, contractValid: true, latencyBucket: '<1s', tokenBucket: '0' }],
      absoluteFailures: {}, startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
    });
    expect(JSON.stringify(report)).not.toMatch(/question|claim|excerpt|url|path/iu);
    expect(report).toMatchObject({ verticalSliceStatus: 'pass', corpusMetricStatus: 'not_measured', rolloutReadiness: 'not-authorized' });
    expect(() => verifyProductionEvaluationReport(report, productionBinding())).toThrow(/hidden-provider-live|production|mode/i);
    const fixtureLive = buildEvaluationReport({
      mode: 'hidden-provider-live', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
      corpusApprovalHash: checksum('a'), embeddingSource: 'fixture', embeddingReceiptHash: checksum('b'),
      runnableCount: 60, deferredCount: 0, cases: hiddenCases(), absoluteFailures: zeroAbsoluteFailures(), runCount: 3,
      startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
      hiddenRuns: [hiddenRun(), hiddenRun(), hiddenRun()],
      providerDataControlReceiptHash: checksum('c'), providerPricingReceiptHash: checksum('d'),
      evaluationUsageReceiptHash: checksum('e'), hiddenManifestHash: checksum('f'), hiddenCustodianRole: 'site-owner',
    });
    expect(() => verifyProductionEvaluationReport(fixtureLive, productionBinding())).toThrow(/embedding|fixture/i);
    const providerLive = buildEvaluationReport({
      mode: 'hidden-provider-live', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
      corpusApprovalHash: checksum('a'), embeddingSource: 'provider', embeddingReceiptHash: checksum('b'),
      runnableCount: 60, deferredCount: 0, cases: hiddenCases(), absoluteFailures: zeroAbsoluteFailures(), runCount: 3,
      startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
      hiddenRuns: [hiddenRun(), hiddenRun(), hiddenRun()],
      providerDataControlReceiptHash: checksum('c'), providerPricingReceiptHash: checksum('d'),
      evaluationUsageReceiptHash: checksum('e'), hiddenManifestHash: checksum('f'), hiddenCustodianRole: 'site-owner',
    });
    expect(verifyProductionEvaluationReport(providerLive, productionBinding())).toBe(providerLive);
    const { reportHash: _reportHash, ...providerLiveBody } = providerLive;
    const reportWithUnknownField = {
      ...providerLiveBody,
      rawQuestion: 'must never be accepted',
    } as unknown as typeof providerLiveBody;
    expect(() => verifyProductionEvaluationReport({
      ...reportWithUnknownField,
      reportHash: providerChecksum(reportWithUnknownField),
    } as unknown as typeof providerLive, productionBinding())).toThrow(/schema|unknown|keys/i);
    const stale = buildEvaluationReport({
      mode: 'hidden-provider-live', contentReleaseId: '9'.repeat(64), answerReleaseId: '2'.repeat(64),
      corpusApprovalHash: checksum('a'), embeddingSource: 'provider', embeddingReceiptHash: checksum('b'),
      runnableCount: 60, deferredCount: 0, cases: hiddenCases(), absoluteFailures: zeroAbsoluteFailures(), runCount: 3,
      startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
      hiddenRuns: [hiddenRun(), hiddenRun(), hiddenRun()], providerDataControlReceiptHash: checksum('c'),
      providerPricingReceiptHash: checksum('d'), evaluationUsageReceiptHash: checksum('e'),
      hiddenManifestHash: checksum('f'), hiddenCustodianRole: 'site-owner',
    });
    expect(() => verifyProductionEvaluationReport(stale, productionBinding())).toThrow(/stale|mismatch/i);
  });

  it('fails provider-live closed before calls when any authority or confirmation is missing', async () => {
    expect(parseEvaluationMode(['--mode=first-slice-offline'])).toBe('first-slice-offline');
    let providerCalls = 0;
    await expect(preflightProviderLiveEvaluation({}, { providerCall: async () => { providerCalls += 1; } })).rejects.toThrow(/authority|confirmation|manifest|receipt/i);
    expect(providerCalls).toBe(0);
  });
});

function classifiedApprovalHash(value: unknown): string {
  const canonical = (input: any): string => input === null || typeof input !== 'object'
    ? JSON.stringify(input)
    : Array.isArray(input) ? `[${input.map(canonical).join(',')}]`
      : `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonical(input[key])}`).join(',')}}`;
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function productionBinding() {
  return {
    contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64), corpusApprovalHash: checksum('a'),
    embeddingSource: 'provider', embeddingReceiptHash: checksum('b'), generationModel: 'gpt-5.4-mini-2026-03-17',
    providerDataControlReceiptHash: checksum('c'), providerPricingReceiptHash: checksum('d'),
    evaluationUsageReceiptHash: checksum('e'),
  } as const;
}

function hiddenCases() {
  return Array.from({ length: 60 }, (_unused, index) => ({
    caseId: `hidden-${index + 1}`, status: 'runnable' as const,
    resultKind: index < 30 || index >= 54 ? 'answer' as const : 'search' as const,
    evidenceIds: index < 30 || index >= 54 ? ['3'.repeat(64)] : [],
    grounded: index < 30 || index >= 54, contractValid: true,
    latencyBucket: '<1s' as const, tokenBucket: '1-1k' as const,
  }));
}

function zeroAbsoluteFailures() {
  return {
    privateBoundarySentinel: 0, invalidLocator: 0, instructionInjectionSuccess: 0,
    criticalContradiction: 0, invalidFallback: 0,
  };
}

function hiddenRun() {
  return {
    complete: true, answerableCount: 30, hitAt3Count: 27, recallAt5Sum: 27, ndcgAt5Sum: 25.5,
    citedEvidenceCount: 100, correctCitationCount: 97, sentenceCharacters: 100, supportedSentenceCharacters: 95,
    criticalCharacters: 100, supportedCriticalCharacters: 100, groundedAnswerCount: 29,
    unanswerableSearchCount: 12, adversarialSearchCount: 12, robustnessGroundedCount: 5,
    privateBoundarySentinelCount: 0, invalidLocatorCount: 0, instructionInjectionSuccessCount: 0,
    criticalContradictionCount: 0, invalidFallbackCount: 0,
  } as const;
}
