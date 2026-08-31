import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { providerChecksum } from '../infrastructure/openai/provider-json.js';
import {
  evaluateFirstSliceGate,
  evaluateHiddenGate,
  type HiddenEvaluationRun,
} from './evaluation-gate.js';

export const EVALUATOR_VERSION = 'public-answer-evaluator-v1' as const;
export const EVALUATOR_HASH = providerChecksum({ version: EVALUATOR_VERSION, gates: 'hidden-30-12-12-6-v1' });
export const RETRIEVER_VERSION = 'postgres-hybrid-rrf-v1' as const;
export const GENERATION_MODEL = 'gpt-5.4-mini-2026-03-17' as const;
export const PROMPT_SCHEMA_VERSION = 'public-answer-generation-and-support-v1' as const;
export const PROMPT_SCHEMA_HASH = providerChecksum({ generation: 'public_answer_claims_v1', semantic: 'public_answer_support_v1' });
export const SEMANTIC_VERIFIER_VERSION = 'semantic-support-v1' as const;
export const SEMANTIC_VERIFIER_HASH = providerChecksum({ version: SEMANTIC_VERIFIER_VERSION, coverage: 0.95, critical: 1 });

export type EvaluationMode = 'first-slice-offline' | 'hidden-offline' | 'hidden-provider-live';
export interface EvaluationCaseReport {
  readonly caseId: string;
  readonly status: 'runnable' | 'deferred';
  readonly resultKind: 'answer' | 'search' | 'error' | 'deferred';
  readonly evidenceIds: readonly string[];
  readonly grounded: boolean;
  readonly contractValid: boolean;
  readonly latencyBucket: '<1s' | '1-4s' | '4-8s' | '>=8s';
  readonly tokenBucket: '0' | '1-1k' | '1k-5k' | '5k-15k';
}
export interface EvaluationReportInput {
  readonly mode: EvaluationMode;
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly corpusApprovalHash: string;
  readonly embeddingSource: 'fixture' | 'provider';
  readonly embeddingReceiptHash: string;
  readonly runnableCount: number;
  readonly deferredCount: number;
  readonly cases: readonly EvaluationCaseReport[];
  readonly absoluteFailures: Readonly<Record<string, number>>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly runCount?: number;
  readonly contentManifestHash?: string;
  readonly answerManifestHash?: string;
  readonly answerArtifactHash?: string;
  readonly providerDataControlReceiptHash?: string | null;
  readonly providerPricingReceiptHash?: string | null;
  readonly evaluationUsageReceiptHash?: string | null;
  readonly publicManifestHash?: string;
  readonly hiddenManifestHash?: string | null;
  readonly hiddenCustodianRole?: 'site-owner' | null;
  readonly retrievalPolicyHash?: string;
  readonly corpusMetricStatus?: 'not_measured' | 'pass' | 'fail';
  readonly hiddenRuns?: readonly HiddenEvaluationRun[];
  readonly usageTotals?: Readonly<{
    applicationRequests: number; applicationProviderTokens: number; applicationCostMicroUsd: number;
    indexProviderTokens: number; indexCostMicroUsd: number;
  }>;
}

export interface EvaluationReport extends ReturnType<typeof reportBody> { readonly reportHash: string }

function reportBody(input: EvaluationReportInput) {
  const grounded = input.cases.filter((item) => item.status === 'runnable' && item.resultKind === 'answer'
    && item.grounded && item.contractValid).length;
  const absoluteFailureCount = Object.values(input.absoluteFailures).reduce((sum, value) => sum + value, 0);
  const firstSlicePass = input.mode === 'first-slice-offline' && evaluateFirstSliceGate({
    runnableCount: input.runnableCount,
    deferredCount: input.deferredCount,
    groundedContractValidCount: grounded,
    absoluteFailureCount,
  });
  const hiddenGate = evaluateHiddenGate(input.hiddenRuns ?? []);
  const verticalSliceStatus = firstSlicePass || (input.mode !== 'first-slice-offline' && hiddenGate.pass) ? 'pass' : 'fail';
  const corpusMetricStatus = input.mode === 'first-slice-offline' ? 'not_measured' : hiddenGate.pass ? 'pass' : 'fail';
  const hiddenRuns = Object.freeze((input.hiddenRuns ?? []).map((run, index) => Object.freeze({ run: index + 1, ...run })));
  const sum = (key: keyof HiddenEvaluationRun) => (input.hiddenRuns ?? []).reduce((total, run) => {
    const value = run[key];
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
  const ratioMetric = (numerator: number, denominator: number) => Object.freeze({
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
    status: input.mode === 'first-slice-offline' ? 'not_measured' as const : hiddenGate.pass ? 'pass' as const : 'fail' as const,
  });
  return {
    schemaVersion: 1 as const,
    mode: input.mode,
    contentReleaseId: input.contentReleaseId,
    answerReleaseId: input.answerReleaseId,
    contentManifestHash: input.contentManifestHash ?? null,
    answerManifestHash: input.answerManifestHash ?? null,
    answerArtifactHash: input.answerArtifactHash ?? null,
    corpusApprovalHash: input.corpusApprovalHash,
    embeddingModel: 'text-embedding-3-large' as const,
    embeddingSource: input.embeddingSource,
    embeddingReceiptHash: input.embeddingReceiptHash,
    providerDataControlReceiptHash: input.providerDataControlReceiptHash ?? null,
    providerPricingReceiptHash: input.providerPricingReceiptHash ?? null,
    evaluationUsageReceiptHash: input.evaluationUsageReceiptHash ?? null,
    generationModel: GENERATION_MODEL,
    promptSchemaVersion: PROMPT_SCHEMA_VERSION,
    promptSchemaHash: PROMPT_SCHEMA_HASH,
    semanticVerifierVersion: SEMANTIC_VERIFIER_VERSION,
    semanticVerifierHash: SEMANTIC_VERIFIER_HASH,
    retrieverVersion: RETRIEVER_VERSION,
    retrievalPolicyHash: input.retrievalPolicyHash ?? null,
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatorHash: EVALUATOR_HASH,
    publicManifestHash: input.publicManifestHash ?? null,
    hiddenManifestHash: input.hiddenManifestHash ?? null,
    hiddenCustodianRole: input.hiddenCustodianRole ?? null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    runCount: input.runCount ?? 1,
    classification: Object.freeze({
      runnable: input.runnableCount,
      deferred: input.deferredCount,
      deferredReasons: Object.freeze({ 'deferred-unapproved-record': input.deferredCount }),
    }),
    formulas: Object.freeze({
      hitAt3: 'answerable expected record present in first 3 fused candidates',
      recallAt5: 'macro mean |expected intersect top5| / |expected|',
      ndcgAt5: 'macro mean binary DCG@5 / ideal DCG@5',
      citationCorrectness: 'catalog-valid cited IDs / all cited IDs',
      sentenceCoverage: 'supported sentence-unit characters / all sentence-unit characters; every v1 unit critical',
      tieBreak: 'rrfScore-desc/chunkId-asc',
      nondeterministicTolerance: 'numeric gates pass 2 of 3 complete runs; absolute gates pass all 3',
    }),
    metrics: input.mode === 'first-slice-offline' ? Object.freeze({
      hitAt3: Object.freeze({ numerator: null, denominator: input.runnableCount, value: null, status: 'not_measured' as const }),
      recallAt5: Object.freeze({ numerator: null, denominator: input.runnableCount, value: null, status: 'not_measured' as const }),
      ndcgAt5: Object.freeze({ numerator: null, denominator: input.runnableCount, value: null, status: 'not_measured' as const }),
      citationCorrectness: Object.freeze({ numerator: null, denominator: null, value: null, status: 'not_measured' as const }),
      sentenceCitationCoverage: Object.freeze({ numerator: null, denominator: null, value: null, status: 'not_measured' as const }),
      groundedAnswerRate: Object.freeze({ numerator: grounded, denominator: input.runnableCount, value: input.runnableCount === 0 ? null : grounded / input.runnableCount, status: 'diagnostic' as const }),
    }) : Object.freeze({
      hitAt3: ratioMetric(sum('hitAt3Count'), sum('answerableCount')),
      recallAt5: ratioMetric(sum('recallAt5Sum'), sum('answerableCount')),
      ndcgAt5: ratioMetric(sum('ndcgAt5Sum'), sum('answerableCount')),
      citationCorrectness: ratioMetric(sum('correctCitationCount'), sum('citedEvidenceCount')),
      sentenceCitationCoverage: ratioMetric(sum('supportedSentenceCharacters'), sum('sentenceCharacters')),
      criticalSentenceCoverage: ratioMetric(sum('supportedCriticalCharacters'), sum('criticalCharacters')),
      groundedAnswerRate: ratioMetric(sum('groundedAnswerCount'), sum('answerableCount')),
      unanswerableSearchRate: ratioMetric(sum('unanswerableSearchCount'), 36),
      adversarialSearchRate: ratioMetric(sum('adversarialSearchCount'), 36),
      robustnessGroundedRate: ratioMetric(sum('robustnessGroundedCount'), 18),
    }),
    runs: hiddenRuns,
    usage: Object.freeze(input.usageTotals ?? {
      applicationRequests: 0, applicationProviderTokens: 0, applicationCostMicroUsd: 0,
      indexProviderTokens: 0, indexCostMicroUsd: 0,
    }),
    absoluteFailures: Object.freeze({ ...input.absoluteFailures }),
    cases: Object.freeze(input.cases.map((item) => Object.freeze({
      caseId: item.caseId,
      status: item.status,
      resultKind: item.resultKind,
      evidenceIds: Object.freeze([...item.evidenceIds]),
      grounded: item.grounded,
      contractValid: item.contractValid,
      latencyBucket: item.latencyBucket,
      tokenBucket: item.tokenBucket,
    }))),
    verticalSliceStatus,
    corpusMetricStatus,
    rolloutReadiness: 'not-authorized' as const,
  };
}

export function buildEvaluationReport(input: EvaluationReportInput): Readonly<EvaluationReport> {
  const body = reportBody(input);
  return Object.freeze({ ...body, reportHash: providerChecksum(body) });
}

export interface ProductionEvaluationBinding {
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly corpusApprovalHash: string;
  readonly embeddingSource: 'provider';
  readonly embeddingReceiptHash: string;
  readonly generationModel: typeof GENERATION_MODEL;
  readonly providerDataControlReceiptHash?: string;
  readonly providerPricingReceiptHash?: string;
  readonly evaluationUsageReceiptHash?: string;
  readonly retrievalPolicyHash?: string;
  readonly evaluatorHash?: string;
  readonly promptSchemaHash?: string;
  readonly semanticVerifierHash?: string;
}

function assertExactObjectKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`production evaluation report ${label} schema is invalid`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new Error(`production evaluation report ${label} has unknown or missing keys`);
  }
}

function assertProductionReportSchema(report: EvaluationReport): void {
  assertExactObjectKeys(report, [
    'schemaVersion', 'mode', 'contentReleaseId', 'answerReleaseId', 'contentManifestHash', 'answerManifestHash',
    'answerArtifactHash', 'corpusApprovalHash', 'embeddingModel', 'embeddingSource', 'embeddingReceiptHash',
    'providerDataControlReceiptHash', 'providerPricingReceiptHash', 'evaluationUsageReceiptHash', 'generationModel',
    'promptSchemaVersion', 'promptSchemaHash', 'semanticVerifierVersion', 'semanticVerifierHash', 'retrieverVersion',
    'retrievalPolicyHash', 'evaluatorVersion', 'evaluatorHash', 'publicManifestHash', 'hiddenManifestHash',
    'hiddenCustodianRole', 'startedAt', 'completedAt', 'runCount', 'classification', 'formulas', 'metrics', 'runs',
    'usage', 'absoluteFailures', 'cases', 'verticalSliceStatus', 'corpusMetricStatus', 'rolloutReadiness', 'reportHash',
  ], 'top level');
  assertExactObjectKeys(report.classification, ['runnable', 'deferred', 'deferredReasons'], 'classification');
  assertExactObjectKeys(report.classification.deferredReasons, ['deferred-unapproved-record'], 'deferred reasons');
  assertExactObjectKeys(report.formulas, [
    'hitAt3', 'recallAt5', 'ndcgAt5', 'citationCorrectness', 'sentenceCoverage', 'tieBreak', 'nondeterministicTolerance',
  ], 'formulas');
  assertExactObjectKeys(report.metrics, [
    'hitAt3', 'recallAt5', 'ndcgAt5', 'citationCorrectness', 'sentenceCitationCoverage', 'criticalSentenceCoverage',
    'groundedAnswerRate', 'unanswerableSearchRate', 'adversarialSearchRate', 'robustnessGroundedRate',
  ], 'metrics');
  for (const metric of Object.values(report.metrics)) {
    assertExactObjectKeys(metric, ['numerator', 'denominator', 'value', 'status'], 'metric');
  }
  assertExactObjectKeys(report.usage, [
    'applicationRequests', 'applicationProviderTokens', 'applicationCostMicroUsd', 'indexProviderTokens', 'indexCostMicroUsd',
  ], 'usage');
  assertExactObjectKeys(report.absoluteFailures, [
    'privateBoundarySentinel', 'invalidLocator', 'instructionInjectionSuccess', 'criticalContradiction', 'invalidFallback',
  ], 'absolute failures');
  const runKeys = [
    'run', 'complete', 'answerableCount', 'hitAt3Count', 'recallAt5Sum', 'ndcgAt5Sum', 'citedEvidenceCount',
    'correctCitationCount', 'sentenceCharacters', 'supportedSentenceCharacters', 'criticalCharacters',
    'supportedCriticalCharacters', 'groundedAnswerCount', 'unanswerableSearchCount', 'adversarialSearchCount',
    'robustnessGroundedCount', 'privateBoundarySentinelCount', 'invalidLocatorCount', 'instructionInjectionSuccessCount',
    'criticalContradictionCount', 'invalidFallbackCount',
  ] as const;
  report.runs.forEach((run) => assertExactObjectKeys(run, runKeys, 'run'));
  const seenCaseIds = new Set<string>();
  for (const item of report.cases) {
    assertExactObjectKeys(item, [
      'caseId', 'status', 'resultKind', 'evidenceIds', 'grounded', 'contractValid', 'latencyBucket', 'tokenBucket',
    ], 'case');
    if (!/^hidden-[a-z0-9][a-z0-9-]*$/u.test(item.caseId) || seenCaseIds.has(item.caseId)
      || item.status !== 'runnable' || item.resultKind === 'deferred'
      || !Array.isArray(item.evidenceIds) || item.evidenceIds.some((id) => !/^[a-f0-9]{64}$/u.test(id))) {
      throw new Error('production evaluation report case schema is invalid');
    }
    seenCaseIds.add(item.caseId);
  }
}

export function verifyProductionEvaluationReport(report: EvaluationReport, binding: ProductionEvaluationBinding): EvaluationReport {
  const { reportHash, ...body } = report;
  if (reportHash !== providerChecksum(body)) throw new Error('production evaluation report hash drift');
  assertProductionReportSchema(report);
  const hiddenGate = evaluateHiddenGate(report.runs.map(({ run: _run, ...metrics }) => metrics));
  if (report.mode !== 'hidden-provider-live' || report.runCount !== 3 || report.runs.length !== 3 || !hiddenGate.pass
    || report.verticalSliceStatus !== 'pass'
    || report.corpusMetricStatus !== 'pass' || report.rolloutReadiness !== 'not-authorized') {
    throw new Error('production evaluation requires a complete hidden-provider-live pass');
  }
  if (report.embeddingSource !== 'provider' || report.embeddingSource !== binding.embeddingSource
    || report.embeddingReceiptHash !== binding.embeddingReceiptHash) throw new Error('production evaluation embedding provenance drift');
  const receiptHashes = [
    report.providerDataControlReceiptHash,
    report.providerPricingReceiptHash,
    report.evaluationUsageReceiptHash,
    report.hiddenManifestHash,
  ];
  if (receiptHashes.some((value) => typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value))
    || report.hiddenCustodianRole !== 'site-owner' || report.classification.runnable !== 60
    || report.classification.deferred !== 0 || report.cases.length !== 60
    || Object.values(report.absoluteFailures).some((value) => value !== 0)
    || Object.values(report.metrics).some((metric) => metric.status !== 'pass')
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(report.startedAt)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(report.completedAt)
    || Date.parse(report.completedAt) < Date.parse(report.startedAt)) {
    throw new Error('production evaluation report receipt, case, metric, or time evidence is incomplete');
  }
  if (report.contentReleaseId !== binding.contentReleaseId || report.answerReleaseId !== binding.answerReleaseId
    || report.corpusApprovalHash !== binding.corpusApprovalHash || report.generationModel !== binding.generationModel
    || report.evaluatorHash !== (binding.evaluatorHash ?? EVALUATOR_HASH)
    || report.promptSchemaHash !== (binding.promptSchemaHash ?? PROMPT_SCHEMA_HASH)
    || report.semanticVerifierHash !== (binding.semanticVerifierHash ?? SEMANTIC_VERIFIER_HASH)
    || (binding.providerDataControlReceiptHash !== undefined && report.providerDataControlReceiptHash !== binding.providerDataControlReceiptHash)
    || (binding.providerPricingReceiptHash !== undefined && report.providerPricingReceiptHash !== binding.providerPricingReceiptHash)
    || (binding.evaluationUsageReceiptHash !== undefined && report.evaluationUsageReceiptHash !== binding.evaluationUsageReceiptHash)
    || (binding.retrievalPolicyHash !== undefined && report.retrievalPolicyHash !== binding.retrievalPolicyHash)) {
    throw new Error('production evaluation report is stale or mismatched');
  }
  return report;
}

export async function readProductionEvaluationReport(path: string, binding: ProductionEvaluationBinding): Promise<EvaluationReport> {
  if (!isAbsolute(path)) throw new Error('production evaluation report path must be absolute');
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('production evaluation report must not be a symbolic link');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || state.size > 2 * 1024 * 1024
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) throw new Error('production evaluation report must be one owned regular file');
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) throw new Error('production evaluation report changed while reading');
    const report = JSON.parse(bytes.toString('utf8')) as EvaluationReport;
    return verifyProductionEvaluationReport(report, binding);
  } finally { await handle.close(); }
}
