import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { classifyPublicEvaluation } from '../../src/modules/public-answer/evaluation/public-eval-classifier.js';
import {
  buildEvaluationReport,
  EVALUATOR_HASH,
  EVALUATOR_VERSION,
  GENERATION_MODEL,
  PROMPT_SCHEMA_HASH,
  PROMPT_SCHEMA_VERSION,
  RETRIEVER_VERSION,
  SEMANTIC_VERIFIER_HASH,
  SEMANTIC_VERIFIER_VERSION,
  verifyProductionEvaluationReport,
} from '../../src/modules/public-answer/evaluation/evaluation-report.js';
import { providerChecksum } from '../../src/modules/public-answer/infrastructure/openai/provider-json.js';
import { verifyPreauthorizedProviderEmbeddingReceipt } from '../../src/index-answer-release.js';
import {
  openHiddenAfterAuthorizedProviderBinding,
  openHiddenAfterAuthorizedProviderIndexing,
  parseEvaluationMode,
  runAfterProviderLivePreflight,
} from '../../src/eval-public-answer.js';

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
      contentManifestHash: checksum('1'), answerManifestHash: checksum('2'), answerArtifactHash: checksum('3'),
      corpusApprovalHash: checksum('a'), embeddingSource: 'provider', embeddingReceiptHash: checksum('b'),
      runnableCount: 60, deferredCount: 0, cases: hiddenCases(), absoluteFailures: zeroAbsoluteFailures(), runCount: 3,
      startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
      hiddenRuns: [hiddenRun(), hiddenRun(), hiddenRun()],
      providerDataControlReceiptHash: checksum('c'), providerPricingReceiptHash: checksum('d'),
      evaluationUsageReceiptHash: checksum('e'), hiddenManifestHash: checksum('f'), hiddenCustodianRole: 'site-owner',
      publicManifestHash: checksum('4'), retrievalPolicyHash: checksum('5'),
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
    const complete: NodeJS.ProcessEnv = {
      FORM_THOUGHT_CONFIRM_HIDDEN_EVAL: 'true', FORM_THOUGHT_CONFIRM_LIVE_PROVIDER: 'true',
      FORM_THOUGHT_PROVIDER_LIVE_EVAL_AUTHORIZED: 'true', FORM_THOUGHT_HIDDEN_EVAL_MANIFEST: '/authority/hidden.json',
      FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH: checksum('1'), FORM_THOUGHT_PUBLIC_ANSWER_EVAL_REPORT: '/authority/report.json',
      FORM_THOUGHT_EVAL_USAGE_RECEIPT: '/authority/usage.json', FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: '/authority/control.json',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: '/authority/edge.json', FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: '/authority/embedding',
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH: checksum('2'), FORM_THOUGHT_HIDDEN_MANIFEST_HASH: checksum('3'),
      FORM_THOUGHT_RETRIEVAL_POLICY_HASH: checksum('4'), FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/',
      FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1', OPENAI_API_KEY: 'never-called-test-key',
    };
    for (const missing of [
      'FORM_THOUGHT_CONFIRM_HIDDEN_EVAL', 'FORM_THOUGHT_CONFIRM_LIVE_PROVIDER', 'FORM_THOUGHT_PROVIDER_LIVE_EVAL_AUTHORIZED',
      'FORM_THOUGHT_HIDDEN_EVAL_MANIFEST', 'FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH', 'FORM_THOUGHT_PUBLIC_ANSWER_EVAL_REPORT',
      'FORM_THOUGHT_EVAL_USAGE_RECEIPT', 'FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT', 'FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT',
      'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT', 'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH',
      'FORM_THOUGHT_HIDDEN_MANIFEST_HASH', 'FORM_THOUGHT_RETRIEVAL_POLICY_HASH', 'FORM_THOUGHT_PUBLIC_ORIGIN',
      'FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES', 'OPENAI_API_KEY',
    ]) {
      let providerCalls = 0;
      const env = { ...complete };
      delete env[missing];
      await expect(runAfterProviderLivePreflight(env, async () => { providerCalls += 1; }), missing)
        .rejects.toThrow(/authority|confirmation|missing/i);
      expect(providerCalls, missing).toBe(0);
    }
  });

  it('opens hidden authority only after an exact preauthorized active provider binding', async () => {
    const events: string[] = [];
    const expected = checksum('b');
    await expect(openHiddenAfterAuthorizedProviderIndexing(expected, {
      async indexAuthorizedReceipt() { events.push('index'); },
      async readActiveBinding() {
        events.push('binding');
        return { embeddingSource: 'provider', embeddingReceiptHash: expected };
      },
      async openHiddenManifest() { events.push('hidden'); return { split: 'hidden-runtime' as const }; },
    })).resolves.toEqual({ split: 'hidden-runtime' });
    expect(events).toEqual(['index', 'binding', 'hidden']);

    events.length = 0;
    await expect(openHiddenAfterAuthorizedProviderIndexing(expected, {
      async indexAuthorizedReceipt() { events.push('index'); },
      async readActiveBinding() {
        events.push('binding');
        return { embeddingSource: 'provider', embeddingReceiptHash: checksum('0') };
      },
      async openHiddenManifest() { events.push('hidden'); return { split: 'hidden-runtime' as const }; },
    })).rejects.toThrow(/provenance|receipt|binding/i);
    expect(events).toEqual(['index', 'binding']);

    await expect(openHiddenAfterAuthorizedProviderBinding(expected, {
      async readActiveBinding() { return { embeddingSource: 'fixture', embeddingReceiptHash: expected }; },
      async openHiddenManifest() { throw new Error('hidden must stay closed'); },
    })).rejects.toThrow(/provenance|receipt|binding/i);
  });

  it('binds preauthorized provider indexing timestamps and release authorities before a billable call', () => {
    const answer = {
      contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
      manifest: { identity: { contentManifestHash: checksum('1') } },
      manifestHash: checksum('2'), artifactHash: checksum('3'), corpusApprovalHash: checksum('4'),
      indexInputs: [{ chunkChecksum: checksum('9') }],
    };
    const receipt = {
      contentReleaseId: answer.contentReleaseId, answerReleaseId: answer.answerReleaseId,
      contentManifestHash: checksum('1'), answerManifestHash: checksum('2'), answerArtifactHash: checksum('3'),
      corpusApprovalHash: checksum('4'), providerDataControlReceiptHash: checksum('5'),
      providerPricingReceiptHash: checksum('6'), createdAt: '2026-08-30T00:00:00.000Z',
      completedAt: '2026-08-30T00:00:01.000Z', inputTokens: 100, costMicroUsd: 13,
      entries: [{ chunkChecksum: checksum('9'), vectorChecksum: checksum('a') }],
    };
    expect(verifyPreauthorizedProviderEmbeddingReceipt(answer as any, receipt as any, {
      providerDataControlReceiptHash: checksum('5'), providerPricingReceiptHash: checksum('6'),
      maxInputTokens: 100_000, maxCostMicroUsd: 20_000,
    })).toEqual({ createdAt: receipt.createdAt, completedAt: receipt.completedAt });
    expect(() => verifyPreauthorizedProviderEmbeddingReceipt(answer as any, {
      ...receipt, answerArtifactHash: checksum('0'),
    } as any, {
      providerDataControlReceiptHash: checksum('5'), providerPricingReceiptHash: checksum('6'),
      maxInputTokens: 100_000, maxCostMicroUsd: 20_000,
    })).toThrow(/preauthorized|release|receipt|mismatch/i);
  });

  it('rejects every substituted active provenance field even when the report hash is recomputed', () => {
    const report = buildEvaluationReport({
      mode: 'hidden-provider-live', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
      contentManifestHash: checksum('1'), answerManifestHash: checksum('2'), answerArtifactHash: checksum('3'),
      corpusApprovalHash: checksum('a'), embeddingSource: 'provider', embeddingReceiptHash: checksum('b'),
      runnableCount: 60, deferredCount: 0, cases: hiddenCases(), absoluteFailures: zeroAbsoluteFailures(), runCount: 3,
      startedAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
      hiddenRuns: [hiddenRun(), hiddenRun(), hiddenRun()], providerDataControlReceiptHash: checksum('c'),
      providerPricingReceiptHash: checksum('d'), evaluationUsageReceiptHash: checksum('e'),
      hiddenManifestHash: checksum('f'), hiddenCustodianRole: 'site-owner', publicManifestHash: checksum('4'),
      retrievalPolicyHash: checksum('5'),
    });
    const binding = productionBinding();
    expect(verifyProductionEvaluationReport(report, binding)).toBe(report);
    const mutations = {
      contentManifestHash: checksum('6'), answerManifestHash: checksum('6'), answerArtifactHash: checksum('6'),
      publicManifestHash: checksum('6'), embeddingModel: 'other-embedding-model', retrieverVersion: 'other-retriever',
      retrievalPolicyHash: checksum('6'), evaluatorVersion: 'other-evaluator', evaluatorHash: checksum('6'),
      promptSchemaVersion: 'other-prompt', promptSchemaHash: checksum('6'),
      semanticVerifierVersion: 'other-semantic', semanticVerifierHash: checksum('6'), generationModel: 'other-model',
    } as const;
    for (const [field, value] of Object.entries(mutations)) {
      const { reportHash: _hash, ...body } = report;
      const changed = { ...body, [field]: value };
      expect(() => verifyProductionEvaluationReport({
        ...changed,
        reportHash: providerChecksum(changed),
      } as unknown as typeof report, binding), field).toThrow(/stale|mismatch|provenance|model|version/i);
    }
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
    contentManifestHash: checksum('1'), answerManifestHash: checksum('2'), answerArtifactHash: checksum('3'),
    publicManifestHash: checksum('4'), embeddingSource: 'provider', embeddingReceiptHash: checksum('b'),
    embeddingModel: 'text-embedding-3-large', generationModel: GENERATION_MODEL,
    retrieverVersion: RETRIEVER_VERSION, retrievalPolicyHash: checksum('5'),
    evaluatorVersion: EVALUATOR_VERSION, evaluatorHash: EVALUATOR_HASH,
    promptSchemaVersion: PROMPT_SCHEMA_VERSION, promptSchemaHash: PROMPT_SCHEMA_HASH,
    semanticVerifierVersion: SEMANTIC_VERIFIER_VERSION, semanticVerifierHash: SEMANTIC_VERIFIER_HASH,
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
