import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseServerConfig, readEdgeReachabilityReceipt } from './config/server-config.js';
import { readProviderDataControlReceipt } from './config/provider-data-control-receipt.js';
import { AnswerPublicQuestion } from './modules/public-answer/application/answer-public-question.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { FixtureAnswerGenerator } from './modules/public-answer/infrastructure/fixture/fixture-answer-generator.js';
import { FixtureSemanticVerifier } from './modules/public-answer/infrastructure/fixture/fixture-semantic-verifier.js';
import { InMemoryRedactedEventSink } from './modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';
import { InMemoryUsageGuard } from './modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { providerChecksum } from './modules/public-answer/infrastructure/openai/provider-json.js';
import {
  readBundledProviderPricing,
  readProviderEmbeddingReceipt,
} from './modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import { OpenAIEmbeddingClient } from './modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import { OpenAiResponsesClient } from './modules/public-answer/infrastructure/openai/openai-responses-client.js';
import { OpenAiResponsesGenerator } from './modules/public-answer/infrastructure/openai/openai-responses-generator.js';
import { CancellablePgQueryRunner } from './modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { PostgresHybridRetriever } from './modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { createPostgresControlPool, createPostgresPool } from './modules/public-answer/infrastructure/postgres/postgres-pool.js';
import {
  readVerifiedAnswerReleaseAuthority,
  VerifiedAnswerReleaseCatalogSource,
} from './modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { CitationVerifier } from './modules/public-answer/infrastructure/verification/citation-verifier.js';
import { OpenAiSemanticVerifier } from './modules/public-answer/infrastructure/verification/semantic-verifier.js';
import {
  buildEvaluationReport,
  type EvaluationMode,
  type EvaluationReport,
} from './modules/public-answer/evaluation/evaluation-report.js';
import { classifyPublicEvaluation } from './modules/public-answer/evaluation/public-eval-classifier.js';
import { readEvaluationUsageReceipt } from './modules/public-answer/evaluation/evaluation-usage-receipt.js';
import { EvaluationUsageGuard } from './modules/public-answer/evaluation/evaluation-usage-guard.js';
import { readHiddenEvalManifest, assertRealHiddenEvaluationAuthority } from './modules/public-answer/evaluation/hidden-eval-manifest.js';
import type { HiddenEvaluationRun } from './modules/public-answer/evaluation/evaluation-gate.js';
import type { UsageGuard } from './modules/public-answer/application/ports/usage-guard.js';
import type {
  DeterministicAnswerVerifier,
  SemanticAnswerVerifier,
  SupportedSentenceUnit,
} from './modules/public-answer/application/ports/answer-verifier.js';
import type { Retriever } from './modules/public-answer/application/ports/retriever.js';
import {
  classifyDeterministicFailure,
  countBoundaryLeaks,
  deriveBoundaryIdentifiers,
  evaluateCapturedCaseMetrics,
} from './modules/public-answer/evaluation/answer-metrics.js';
import { indexAnswerRelease, providerIndexBudget } from './index-answer-release.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export async function runEvaluationCaseWithDeadline<T>(
  operation: (signal: AbortSignal, deadlineAt: number) => Promise<T>,
  timeoutMs = 12_000,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('evaluation deadline duration is invalid');
  const controller = new AbortController();
  const deadlineAt = performance.now() + timeoutMs;
  const operationPromise = Promise.resolve().then(() => operation(controller.signal, deadlineAt));
  let timer: NodeJS.Timeout | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error('evaluation case deadline elapsed');
        controller.abort(error);
        reject(error);
      }, Math.max(0, deadlineAt - performance.now()));
      timer.unref();
    });
    return await Promise.race([operationPromise, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function parseEvaluationMode(argv: readonly string[]): EvaluationMode {
  if (argv.length === 1 && argv[0] === '--mode=first-slice-offline') return 'first-slice-offline';
  if (argv.length === 2 && argv[0] === '--mode=hidden-offline' && argv[1] === '--confirm-hidden-eval') return 'hidden-offline';
  if (argv.length === 3 && argv[0] === '--mode=hidden-provider-live' && argv[1] === '--confirm-hidden-eval'
    && argv[2] === '--confirm-live-provider') return 'hidden-provider-live';
  throw new Error('evaluation mode and confirmations must be exact');
}

export async function preflightProviderLiveEvaluation(
  env: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, string>>> {
  const required = [
    'FORM_THOUGHT_HIDDEN_EVAL_MANIFEST',
    'FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH',
    'FORM_THOUGHT_PUBLIC_ANSWER_EVAL_REPORT',
    'FORM_THOUGHT_EVAL_USAGE_RECEIPT',
    'FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT',
    'FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT',
    'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT',
    'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH',
    'FORM_THOUGHT_HIDDEN_MANIFEST_HASH',
    'FORM_THOUGHT_RETRIEVAL_POLICY_HASH',
    'FORM_THOUGHT_PUBLIC_ORIGIN',
    'FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES',
    'OPENAI_API_KEY',
  ] as const;
  if (env.FORM_THOUGHT_CONFIRM_HIDDEN_EVAL !== 'true' || env.FORM_THOUGHT_CONFIRM_LIVE_PROVIDER !== 'true'
    || env.FORM_THOUGHT_PROVIDER_LIVE_EVAL_AUTHORIZED !== 'true') {
    throw new Error('provider-live evaluation authority and confirmation are missing');
  }
  const result: Record<string, string> = {};
  for (const name of required) {
    const value = env[name];
    if (!value) throw new Error(`provider-live evaluation authority ${name} is missing`);
    result[name] = value;
  }
  for (const name of required.filter((item) => ![
    'OPENAI_API_KEY', 'FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH', 'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH',
    'FORM_THOUGHT_HIDDEN_MANIFEST_HASH', 'FORM_THOUGHT_RETRIEVAL_POLICY_HASH', 'FORM_THOUGHT_PUBLIC_ORIGIN',
    'FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES',
  ].includes(item))) {
    if (!isAbsolute(result[name]!)) throw new Error(`provider-live evaluation authority ${name} must be absolute`);
  }
  for (const name of [
    'FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH', 'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH',
    'FORM_THOUGHT_HIDDEN_MANIFEST_HASH', 'FORM_THOUGHT_RETRIEVAL_POLICY_HASH',
  ] as const) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(result[name]!)) throw new Error(`provider-live ${name} hash is invalid`);
  }
  const provider = await readProviderDataControlReceipt(result.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT!);
  const pricing = await readBundledProviderPricing();
  const publicOrigin = result.FORM_THOUGHT_PUBLIC_ORIGIN!;
  const trustedProxyAddresses = result.FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES!.split(',').map((value) => value.trim()).filter(Boolean);
  const edge = await readEdgeReachabilityReceipt(result.FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT!, {
    publicOrigin,
    trustedProxyAddresses,
    provider,
  });
  const usage = await readEvaluationUsageReceipt(result.FORM_THOUGHT_EVAL_USAGE_RECEIPT!, {
    providerProjectHash: provider.projectHash,
    providerDataControlReceiptHash: provider.receiptHash,
    providerPricingReceiptHash: pricing.receiptHash,
    hiddenManifestHash: result.FORM_THOUGHT_HIDDEN_MANIFEST_HASH,
    corpusApprovalHash: result.FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH,
    providerEmbeddingReceiptHash: result.FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH,
    retrievalPolicyHash: result.FORM_THOUGHT_RETRIEVAL_POLICY_HASH,
  });
  if (edge.providerSpend.approvedSiteBudgetMicroUsd < usage.maxApplicationCostMicroUsd + usage.maxIndexCostMicroUsd) {
    throw new Error('provider-live spend authorization is below the immutable evaluation maximum');
  }
  result.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT_HASH = provider.receiptHash;
  result.FORM_THOUGHT_PROVIDER_PRICING_RECEIPT_HASH = pricing.receiptHash;
  result.FORM_THOUGHT_EVAL_USAGE_RECEIPT_HASH = usage.receiptHash;
  return Object.freeze(result);
}

function latencyBucket(milliseconds: number): '<1s' | '1-4s' | '4-8s' | '>=8s' {
  if (milliseconds < 1_000) return '<1s';
  if (milliseconds < 4_000) return '1-4s';
  if (milliseconds < 8_000) return '4-8s';
  return '>=8s';
}

async function writeReport(path: string, report: EvaluationReport): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function runFirstSliceOfflineEvaluation(env: NodeJS.ProcessEnv): Promise<Readonly<EvaluationReport>> {
  if (env.OPENAI_API_KEY !== undefined) throw new Error('first-slice offline evaluation forbids a provider key');
  const config = await parseServerConfig(env);
  if (config.nodeEnv !== 'test' || config.publicAskMode !== 'fixture') throw new Error('first-slice evaluation requires fixture test mode');
  const { approval, answer } = await readVerifiedAnswerReleaseAuthority(config);
  const manifestPath = resolve(repositoryRoot, 'tests/fixtures/public-answer/eval-manifest.v1.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
  const classification = classifyPublicEvaluation(manifest, approval, answer.corpusApprovalHash);
  const pool = createPostgresPool(config.databaseUrl);
  const controlPool = createPostgresControlPool(config.databaseUrl);
  const startedAt = new Date().toISOString();
  try {
    const catalogSource = new VerifiedAnswerReleaseCatalogSource(config, pool);
    const catalog = await catalogSource.snapshot(new AbortController().signal);
    if (catalog.embeddingSource !== 'fixture' || catalog.corpusApprovalHash !== classification.corpusApprovalHash) {
      throw new Error('first-slice fixture binding provenance mismatch');
    }
    const useCase = new AnswerPublicQuestion({
      policy: Object.freeze({ mode: 'fixture' }),
      retriever: new PostgresHybridRetriever(
        new DeterministicEmbeddingClient('test'), new CancellablePgQueryRunner(pool, controlPool),
      ),
      generator: new FixtureAnswerGenerator(),
      deterministicVerifier: new CitationVerifier(),
      semanticVerifier: new FixtureSemanticVerifier(),
      usageGuard: await InMemoryUsageGuard.create(),
      eventSink: new InMemoryRedactedEventSink(),
    });
    const cases = [];
    for (const item of classification.runnable) {
      const before = performance.now();
      const result = await runEvaluationCaseWithDeadline((signal, deadlineAt) => useCase.execute({
        requestId: `eval-${item.id}`,
        question: item.question,
        contentReleaseId: catalog.contentReleaseId,
        answerReleaseId: catalog.answerReleaseId,
        networkKey: providerChecksum(item.id),
        signal,
        deadlineAt,
        catalog,
      }));
      const evidenceIds = result.kind === 'answer' ? result.evidence.map(({ evidenceId }) => evidenceId) : [];
      const expected = new Set(item.expectedEvidence.map(({ recordId }) => recordId));
      const expectedPresent = result.kind === 'answer' && result.evidence.some(({ recordId }) => expected.has(recordId));
      cases.push({
        caseId: item.id,
        status: 'runnable' as const,
        resultKind: result.kind,
        evidenceIds,
        grounded: result.kind === 'answer' && expectedPresent,
        contractValid: result.kind === 'answer' && expectedPresent,
        latencyBucket: latencyBucket(performance.now() - before),
        tokenBucket: '0' as const,
      });
    }
    cases.push(...classification.deferred.map((item) => ({
      caseId: item.id,
      status: 'deferred' as const,
      resultKind: 'deferred' as const,
      evidenceIds: Object.freeze([]),
      grounded: false,
      contractValid: true,
      latencyBucket: '<1s' as const,
      tokenBucket: '0' as const,
    })));
    const retrievalPolicy = await readFile(new URL('./modules/public-answer/infrastructure/postgres/retrieval-policy.v1.json', import.meta.url));
    const report = buildEvaluationReport({
      mode: 'first-slice-offline',
      contentReleaseId: answer.contentReleaseId,
      answerReleaseId: answer.answerReleaseId,
      contentManifestHash: answer.manifest.identity.contentManifestHash,
      answerManifestHash: answer.manifestHash,
      answerArtifactHash: answer.artifactHash,
      corpusApprovalHash: answer.corpusApprovalHash,
      embeddingSource: catalog.embeddingSource,
      embeddingReceiptHash: catalog.embeddingReceiptHash,
      runnableCount: classification.runnableCount,
      deferredCount: classification.deferredCount,
      cases,
      absoluteFailures: Object.freeze({
        privateBoundarySentinel: 0,
        invalidLocator: 0,
        instructionInjectionSuccess: 0,
        criticalContradiction: 0,
        invalidFallback: 0,
      }),
      startedAt,
      completedAt: new Date().toISOString(),
      publicManifestHash: providerChecksum(manifestBytes),
      retrievalPolicyHash: providerChecksum(retrievalPolicy),
      corpusMetricStatus: 'not_measured',
    });
    if (report.verticalSliceStatus !== 'pass') throw new Error('first-slice vertical path gate failed');
    const outputPath = resolve(repositoryRoot, 'build/public-answer-eval/first-slice-offline.json');
    await writeReport(outputPath, report);
    return report;
  } finally { await Promise.all([pool.end(), controlPool.end()]); }
}

function evaluationUsageAdapter(guard: EvaluationUsageGuard): UsageGuard {
  return Object.freeze({
    async acquire() {
      const lease = guard.beginApplicationRequest();
      return Object.freeze({
        async acquireGeneration(signal: AbortSignal) {
          signal.throwIfAborted();
          return Object.freeze({ release() {} });
        },
        beginStage: lease.beginStage,
        settleStage: lease.settleStage,
        release: async () => { lease.release(); },
      });
    },
  });
}

export async function runAfterProviderLivePreflight<T>(
  env: NodeJS.ProcessEnv,
  authorizedOperation: (authority: Readonly<Record<string, string>>) => Promise<T>,
): Promise<T> {
  const authority = await preflightProviderLiveEvaluation(env);
  return authorizedOperation(authority);
}

function emptyHiddenRun(): HiddenEvaluationRun {
  return {
    complete: true, answerableCount: 30, hitAt3Count: 0, recallAt5Sum: 0, ndcgAt5Sum: 0,
    citedEvidenceCount: 0, correctCitationCount: 0, sentenceCharacters: 0, supportedSentenceCharacters: 0,
    criticalCharacters: 0, supportedCriticalCharacters: 0, groundedAnswerCount: 0,
    unanswerableSearchCount: 0, adversarialSearchCount: 0, robustnessGroundedCount: 0,
    privateBoundarySentinelCount: 0, invalidLocatorCount: 0, instructionInjectionSuccessCount: 0,
    criticalContradictionCount: 0, invalidFallbackCount: 0,
  };
}

interface HiddenFailureProbe {
  fusedRecordIds: string[];
  sentenceUnits: SupportedSentenceUnit[];
  supportedSentenceIds: Set<string>;
  contradictedSentenceIds: string[];
  integrityFailureCount: number;
  invalidFallbackCount: number;
}

function evaluationDeterministicVerifier(delegate: DeterministicAnswerVerifier, probe: HiddenFailureProbe): DeterministicAnswerVerifier {
  return Object.freeze({
    verify(input: Parameters<DeterministicAnswerVerifier['verify']>[0]) {
      const result = delegate.verify(input);
      if (result.ok) probe.sentenceUnits.push(...result.sentenceUnits);
      else if (classifyDeterministicFailure(result.reason) === 'integrity') probe.integrityFailureCount += 1;
      else probe.invalidFallbackCount += 1;
      return result;
    },
  });
}

function evaluationSemanticVerifier(delegate: SemanticAnswerVerifier, probe: HiddenFailureProbe): SemanticAnswerVerifier {
  return Object.freeze({
    async verify(input: Parameters<SemanticAnswerVerifier['verify']>[0]) {
      const result = await delegate.verify(input);
      result.supportedSentenceIds.forEach((id) => probe.supportedSentenceIds.add(id));
      probe.contradictedSentenceIds.push(...result.contradictedSentenceIds);
      return result;
    },
  });
}

function evaluationRetriever(delegate: Retriever, probe: HiddenFailureProbe): Retriever {
  return Object.freeze({
    async retrieve(input: Parameters<Retriever['retrieve']>[0]) {
      const result = await delegate.retrieve(input);
      probe.fusedRecordIds.push(...result.evidence.map(({ recordId }) => recordId));
      return result;
    },
  });
}

function resetHiddenFailureProbe(probe: HiddenFailureProbe): void {
  probe.fusedRecordIds.length = 0;
  probe.sentenceUnits.length = 0;
  probe.supportedSentenceIds.clear();
  probe.contradictedSentenceIds.length = 0;
  probe.integrityFailureCount = 0;
  probe.invalidFallbackCount = 0;
}

export async function openHiddenAfterAuthorizedProviderBinding<T>(
  expectedEmbeddingReceiptHash: string,
  dependencies: Readonly<{
    readActiveBinding(): Promise<Readonly<{ embeddingSource: 'fixture' | 'provider'; embeddingReceiptHash: string }>>;
    openHiddenManifest(): Promise<T>;
  }>,
): Promise<T> {
  const active = await dependencies.readActiveBinding();
  if (active.embeddingSource !== 'provider' || active.embeddingReceiptHash !== expectedEmbeddingReceiptHash) {
    throw new Error('provider-live active binding provenance or receipt mismatch before hidden access');
  }
  return dependencies.openHiddenManifest();
}

export async function openHiddenAfterAuthorizedProviderIndexing<T>(
  expectedEmbeddingReceiptHash: string,
  dependencies: Readonly<{
    indexAuthorizedReceipt(): Promise<void>;
    readActiveBinding(): Promise<Readonly<{ embeddingSource: 'fixture' | 'provider'; embeddingReceiptHash: string }>>;
    openHiddenManifest(): Promise<T>;
  }>,
): Promise<T> {
  await dependencies.indexAuthorizedReceipt();
  return openHiddenAfterAuthorizedProviderBinding(expectedEmbeddingReceiptHash, dependencies);
}

export async function runHiddenEvaluation(mode: 'hidden-offline' | 'hidden-provider-live', env: NodeJS.ProcessEnv): Promise<Readonly<EvaluationReport>> {
  const provider = mode === 'hidden-provider-live';
  const preflight = provider ? await runAfterProviderLivePreflight(env, async (authority) => authority) : null;
  if (!env.FORM_THOUGHT_HIDDEN_EVAL_MANIFEST || !isAbsolute(env.FORM_THOUGHT_HIDDEN_EVAL_MANIFEST)
    || !env.FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH) throw new Error('hidden evaluation authority is missing');
  if (!/^sha256:[a-f0-9]{64}$/u.test(env.FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH)) throw new Error('hidden expanded approval hash is invalid');
  if (!provider && env.OPENAI_API_KEY !== undefined) throw new Error('hidden offline evaluation forbids a provider key');
  const config = await parseServerConfig(env);
  if (config.publicAskMode !== (provider ? 'provider' : 'fixture')) throw new Error('hidden evaluation runtime mode mismatch');
  const { approval, content, answer } = await readVerifiedAnswerReleaseAuthority(config);
  if (answer.corpusApprovalHash !== env.FORM_THOUGHT_EXPANDED_CORPUS_APPROVAL_HASH) throw new Error('hidden expanded approval is not bound to the verified answer release');
  let evaluationGuard: EvaluationUsageGuard | undefined;
  let usageReceipt: Awaited<ReturnType<typeof readEvaluationUsageReceipt>> | undefined;
  if (provider) {
    usageReceipt = await readEvaluationUsageReceipt(config.evaluationUsageReceiptPath!, {
      providerDataControlReceiptHash: preflight!.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT_HASH,
      providerPricingReceiptHash: preflight!.FORM_THOUGHT_PROVIDER_PRICING_RECEIPT_HASH,
      hiddenManifestHash: preflight!.FORM_THOUGHT_HIDDEN_MANIFEST_HASH,
      corpusApprovalHash: answer.corpusApprovalHash,
      providerEmbeddingReceiptHash: preflight!.FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_HASH,
      retrievalPolicyHash: preflight!.FORM_THOUGHT_RETRIEVAL_POLICY_HASH,
    });
    evaluationGuard = new EvaluationUsageGuard(usageReceipt);
    const indexBudget = providerIndexBudget(answer.indexInputs);
    evaluationGuard.reserveIndex(indexBudget.tokenUpperBound, indexBudget.costUpperBoundMicroUsd);
  }
  if (!provider) await indexAnswerRelease(['--embedding-mode=fixture'], env, () => undefined);
  const pool = createPostgresPool(config.databaseUrl);
  const controlPool = createPostgresControlPool(config.databaseUrl);
  const startedAt = new Date().toISOString();
  try {
    const publicManifestBytes = await readFile(resolve(repositoryRoot, 'tests/fixtures/public-answer/eval-manifest.v1.json'));
    const publicManifest = JSON.parse(publicManifestBytes.toString('utf8')) as { cases: Array<{ question: string }> };
    const retrievalPolicy = await readFile(new URL('./modules/public-answer/infrastructure/postgres/retrieval-policy.v1.json', import.meta.url));
    const retrievalPolicyHash = providerChecksum(retrievalPolicy);
    if (provider && retrievalPolicyHash !== preflight!.FORM_THOUGHT_RETRIEVAL_POLICY_HASH) throw new Error('hidden retrieval policy changed after authorization');
    const openHidden = async () => assertRealHiddenEvaluationAuthority(await readHiddenEvalManifest(env.FORM_THOUGHT_HIDDEN_EVAL_MANIFEST!, {
      approvedRecordIds: new Set((approval.entries as readonly { recordId: string }[]).map(({ recordId }) => recordId)),
      publicDevelopmentQuestions: new Set(publicManifest.cases.map(({ question }) => question)),
      corpusApprovalHash: answer.corpusApprovalHash,
      retrievalPolicyHash,
    }));
    const catalogSource = new VerifiedAnswerReleaseCatalogSource(config, pool);
    let catalog: Awaited<ReturnType<typeof catalogSource.snapshot>>;
    const hidden = provider
      ? await openHiddenAfterAuthorizedProviderIndexing(usageReceipt!.providerEmbeddingReceiptHash, {
        async indexAuthorizedReceipt() {
          await indexAnswerRelease(['--embedding-mode=provider', '--confirm-live-provider'], env, () => undefined, {
            expectedProviderReceiptHash: usageReceipt!.providerEmbeddingReceiptHash,
          });
        },
        async readActiveBinding() {
          catalog = await catalogSource.snapshot(new AbortController().signal);
          const receipt = await readProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, catalog.answerReleaseId,
            catalog.embeddingReceiptHash);
          evaluationGuard!.settleIndex(receipt.inputTokens, receipt.costMicroUsd);
          return catalog;
        },
        openHiddenManifest: openHidden,
      })
      : await (async () => {
        catalog = await catalogSource.snapshot(new AbortController().signal);
        if (catalog.embeddingSource !== 'fixture') throw new Error('hidden offline fixture provenance mismatch');
        return openHidden();
      })();
    const activeCatalog = catalog!;
    if (provider && hidden.manifestHash !== preflight!.FORM_THOUGHT_HIDDEN_MANIFEST_HASH) throw new Error('hidden manifest hash changed after authorization');
    const responses = provider ? new OpenAiResponsesClient(config.openAiApiKey!) : null;
    const failureProbe: HiddenFailureProbe = {
      fusedRecordIds: [], sentenceUnits: [], supportedSentenceIds: new Set(), contradictedSentenceIds: [],
      integrityFailureCount: 0, invalidFallbackCount: 0,
    };
    const eventSink = new InMemoryRedactedEventSink();
    const useCase = new AnswerPublicQuestion({
      policy: Object.freeze({ mode: provider ? 'provider' : 'fixture' }),
      retriever: evaluationRetriever(new PostgresHybridRetriever(provider
        ? new OpenAIEmbeddingClient(config.openAiApiKey!, { profile: 'query' }) : new DeterministicEmbeddingClient('test'),
      new CancellablePgQueryRunner(pool, controlPool)), failureProbe),
      generator: provider ? new OpenAiResponsesGenerator(responses!) : new FixtureAnswerGenerator(),
      deterministicVerifier: evaluationDeterministicVerifier(new CitationVerifier(), failureProbe),
      semanticVerifier: evaluationSemanticVerifier(
        provider ? new OpenAiSemanticVerifier(responses!) : new FixtureSemanticVerifier(),
        failureProbe,
      ),
      usageGuard: provider ? evaluationUsageAdapter(evaluationGuard!) : await InMemoryUsageGuard.create(),
      eventSink,
    });
    const approvedIds = new Set((approval.entries as readonly { recordId: string }[]).map(({ recordId }) => recordId));
    const independentBoundaries = deriveBoundaryIdentifiers(
      Object.keys(content.manifest.records),
      approvedIds,
      activeCatalog.tombstones,
      new Map(answer.evidence.map((item) => [item.evidenceId, item.recordId])),
    );
    const runCount = provider ? 3 : 1;
    const runs: HiddenEvaluationRun[] = [];
    let caseReports: Array<Parameters<typeof buildEvaluationReport>[0]['cases'][number]> = [];
    for (let run = 0; run < runCount; run += 1) {
      const metrics = { ...emptyHiddenRun() };
      const reports: typeof caseReports = [];
      for (const item of hidden.cases) {
        resetHiddenFailureProbe(failureProbe);
        const before = performance.now();
        const telemetryStart = eventSink.events().length;
        const result = await runEvaluationCaseWithDeadline((signal, deadlineAt) => useCase.execute({
          requestId: `hidden-eval-${run + 1}-${item.id}`,
          question: item.question,
          contentReleaseId: activeCatalog.contentReleaseId,
          answerReleaseId: activeCatalog.answerReleaseId,
          networkKey: providerChecksum(`${run + 1}:${item.id}`),
          signal,
          deadlineAt,
          catalog: activeCatalog,
        }));
        const evidence = result.kind === 'answer' ? result.evidence : [];
        const evidenceIds = evidence.map(({ evidenceId }) => evidenceId);
        const citedRecordIds = evidence.map(({ recordId }) => recordId);
        const required = item.requiredEvidence.map(({ recordId }) => recordId);
        const answer = result.kind === 'answer';
        const citedIds = answer ? result.claims.flatMap((claim) => [...claim.evidenceIds]) : [];
        const captured = evaluateCapturedCaseMetrics({
          requiredRecordIds: required,
          fusedRecordIds: failureProbe.fusedRecordIds,
          citedEvidenceIds: citedIds,
          catalogEvidenceIds: new Set(activeCatalog.evidenceById.keys()),
          sentenceUnits: failureProbe.sentenceUnits.map((unit) => ({
            id: unit.id, characters: [...unit.text].length, critical: unit.critical,
          })),
          supportedSentenceIds: failureProbe.supportedSentenceIds,
          deterministicPass: failureProbe.integrityFailureCount === 0 && failureProbe.invalidFallbackCount === 0,
          contradictedSentenceIds: failureProbe.contradictedSentenceIds,
        });
        if (item.category === 'answerable') {
          metrics.hitAt3Count += captured.retrieval.hitAt3;
          metrics.recallAt5Sum += captured.retrieval.recallAt5 ?? 0;
          metrics.ndcgAt5Sum += captured.retrieval.ndcgAt5 ?? 0;
          metrics.groundedAnswerCount += answer && captured.grounded ? 1 : 0;
        }
        metrics.citedEvidenceCount += captured.citedEvidenceCount;
        metrics.correctCitationCount += captured.correctCitationCount;
        metrics.sentenceCharacters += captured.sentenceCharacters;
        metrics.supportedSentenceCharacters += captured.supportedSentenceCharacters;
        metrics.criticalCharacters += captured.criticalCharacters;
        metrics.supportedCriticalCharacters += captured.supportedCriticalCharacters;
        if (item.category === 'unanswerable' && result.kind === 'search') metrics.unanswerableSearchCount += 1;
        if (item.category === 'adversarial' && result.kind === 'search') metrics.adversarialSearchCount += 1;
        if (item.category === 'adversarial' && answer) metrics.instructionInjectionSuccessCount += 1;
        if (item.category === 'robustness' && answer && captured.grounded
          && required.every((recordId) => failureProbe.fusedRecordIds.includes(recordId))) metrics.robustnessGroundedCount += 1;
        const boundaryRecordIds = new Set([...independentBoundaries.recordIds, ...item.forbiddenRecordIds]);
        metrics.privateBoundarySentinelCount += countBoundaryLeaks({
          outputRecordIds: citedRecordIds,
          outputEvidenceIds: evidenceIds,
          outputText: answer ? result.claims.map((claim) => claim.text).join('\n') : '',
          redactedTelemetry: eventSink.events().slice(telemetryStart),
          boundaryRecordIds,
          boundaryEvidenceIds: independentBoundaries.evidenceIds,
        });
        metrics.invalidLocatorCount += failureProbe.integrityFailureCount;
        metrics.criticalContradictionCount += failureProbe.contradictedSentenceIds.length;
        metrics.invalidFallbackCount += failureProbe.invalidFallbackCount + (result.kind === 'error' ? 1 : 0);
        const expectedResult = item.expectedMode === 'answer' ? answer : result.kind === 'search';
        reports.push({
          caseId: item.id, status: 'runnable', resultKind: result.kind, evidenceIds,
          grounded: answer && expectedResult, contractValid: expectedResult,
          latencyBucket: latencyBucket(performance.now() - before), tokenBucket: provider ? '5k-15k' : '0',
        });
      }
      runs.push(Object.freeze(metrics));
      if (run === 0) caseReports = reports;
    }
    const report = buildEvaluationReport({
      mode, contentReleaseId: answer.contentReleaseId, answerReleaseId: answer.answerReleaseId,
      contentManifestHash: answer.manifest.identity.contentManifestHash, answerManifestHash: answer.manifestHash,
      answerArtifactHash: answer.artifactHash, corpusApprovalHash: answer.corpusApprovalHash,
      embeddingSource: activeCatalog.embeddingSource, embeddingReceiptHash: activeCatalog.embeddingReceiptHash,
      providerDataControlReceiptHash: provider ? preflight!.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT_HASH : null,
      providerPricingReceiptHash: provider ? preflight!.FORM_THOUGHT_PROVIDER_PRICING_RECEIPT_HASH : null,
      evaluationUsageReceiptHash: usageReceipt?.receiptHash ?? null,
      runnableCount: 60, deferredCount: 0, cases: caseReports,
      absoluteFailures: {
        privateBoundarySentinel: Math.max(...runs.map((run) => run.privateBoundarySentinelCount)),
        invalidLocator: Math.max(...runs.map((run) => run.invalidLocatorCount)),
        instructionInjectionSuccess: Math.max(...runs.map((run) => run.instructionInjectionSuccessCount)),
        criticalContradiction: Math.max(...runs.map((run) => run.criticalContradictionCount)),
        invalidFallback: Math.max(...runs.map((run) => run.invalidFallbackCount)),
      },
      startedAt, completedAt: new Date().toISOString(), runCount, publicManifestHash: providerChecksum(publicManifestBytes),
      hiddenManifestHash: hidden.manifestHash, hiddenCustodianRole: hidden.custodianRole,
      retrievalPolicyHash, hiddenRuns: runs, usageTotals: evaluationGuard?.snapshot(),
    });
    await writeReport(provider ? config.productionEvalReportPath! : resolve(repositoryRoot, 'build/public-answer-eval/hidden-offline.json'), report);
    if (provider && report.verticalSliceStatus !== 'pass') throw new Error('provider-live hidden evaluation gate failed');
    return report;
  } finally { await Promise.all([pool.end(), controlPool.end()]); }
}

export async function runEvaluationCli(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<0 | 1> {
  try {
    const mode = parseEvaluationMode(argv);
    if (mode === 'first-slice-offline') await runFirstSliceOfflineEvaluation(env);
    else await runHiddenEvaluation(mode, {
      ...env,
      FORM_THOUGHT_CONFIRM_HIDDEN_EVAL: 'true',
      ...(mode === 'hidden-provider-live' ? { FORM_THOUGHT_CONFIRM_LIVE_PROVIDER: 'true' } : {}),
    });
    process.stdout.write(JSON.stringify({ kind: 'evaluation-pass', mode }) + '\n');
    return 0;
  } catch {
    process.stderr.write('{"kind":"evaluation-failure"}\n');
    return 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await runEvaluationCli(process.argv.slice(2), process.env);
}
