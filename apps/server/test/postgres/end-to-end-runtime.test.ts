import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { runFirstSliceOfflineEvaluation } from '../../src/eval-public-answer.js';
import { canonicalProviderDataControlReceipt, readProviderDataControlReceipt } from '../../src/config/provider-data-control-receipt.js';
import { indexAnswerRelease, providerIndexBudget } from '../../src/index-answer-release.js';
import {
  createProviderEmbeddingReceipt,
  readBundledProviderPricing,
  writeProviderEmbeddingReceipt,
} from '../../src/modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import { readVerifiedAnswerReleaseAuthority } from '../../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { parseServerConfig } from '../../src/config/server-config.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
const temporaryRoots: string[] = [];

function evaluationEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture',
    FORM_THOUGHT_DATABASE_URL: databaseUrl,
    FORM_THOUGHT_CONTENT_RELEASE_ROOT: resolve('build/public-releases'),
    FORM_THOUGHT_ANSWER_RELEASE_ROOT: resolve('build/public-answer-releases'),
    FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('src/data/public-answer-corpus-approval.v1.json'),
    FORM_THOUGHT_NETWORK_HMAC_SECRET: 'evaluation-fixture-secret-at-least-32-characters',
  };
}

afterEach(async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally { await pool.end(); }
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('public-answer first-slice database evaluation', () => {
  it('indexes the independently approved fixture release and executes the one runnable case through the real database pipeline', async () => {
    const env = evaluationEnv();
    await indexAnswerRelease(['--embedding-mode=fixture'], env, () => undefined);
    const report = await runFirstSliceOfflineEvaluation(env);
    expect(report).toMatchObject({
      mode: 'first-slice-offline',
      embeddingSource: 'fixture',
      classification: { runnable: 1, deferred: 19 },
      verticalSliceStatus: 'pass',
      corpusMetricStatus: 'not_measured',
      rolloutReadiness: 'not-authorized',
    });
    expect(report.cases.filter((item) => item.status === 'runnable')).toEqual([
      expect.objectContaining({ caseId: 'dev-01-reading-judgment', resultKind: 'answer', grounded: true, contractValid: true }),
    ]);
    const bytes = await readFile(resolve('build/public-answer-eval/first-slice-offline.json'), 'utf8');
    expect(bytes).not.toMatch(/AI 시대에도 왜|question|excerpt|canonicalPath|sourcePath/iu);
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const binding = await pool.query<{ embedding_source: string; count: string }>(
        "SELECT b.embedding_source,count(c.*)::text AS count FROM public_answer_release_bindings b LEFT JOIN public_answer_chunks c USING(binding_id) WHERE b.state='active' GROUP BY b.embedding_source",
      );
      expect(binding.rows).toEqual([{ embedding_source: 'fixture', count: expect.stringMatching(/^[1-9][0-9]*$/u) }]);
    } finally { await pool.end(); }
  });

  it('rejects a release-impossible preauthorized receipt before the provider embedding seam', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-preauth-budget-'));
    temporaryRoots.push(root);
    const controlInput = canonicalProviderDataControlReceipt({
      schemaVersion: 1, provider: 'openai', projectHash: `sha256:${'a'.repeat(64)}`,
      endpoints: ['/v1/embeddings', '/v1/responses'], status: 'zero-data-retention', verifierRole: 'provider-admin',
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`, custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      verifiedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2099-08-30T00:00:00.000Z',
      externalEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
    });
    const controlPath = join(root, 'provider-control.json');
    await writeFile(controlPath, `${JSON.stringify(controlInput, null, 2)}\n`);
    const control = await readProviderDataControlReceipt(controlPath);
    const receiptRoot = join(root, 'embedding-receipts');
    await mkdir(receiptRoot);
    const providerEnv = {
      ...evaluationEnv(), FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider', OPENAI_API_KEY: 'never-called-test-key',
      FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: controlPath,
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: receiptRoot,
    };
    const config = await parseServerConfig(providerEnv);
    const { answer } = await readVerifiedAnswerReleaseAuthority(config);
    const budget = providerIndexBudget(answer.indexInputs);
    const pricing = await readBundledProviderPricing();
    const uniqueInputs = [...new Map(answer.indexInputs.map((item) => [item.chunkChecksum, item])).values()];
    const impossible = createProviderEmbeddingReceipt({
      schemaVersion: 1, contentReleaseId: answer.contentReleaseId, answerReleaseId: answer.answerReleaseId,
      contentManifestHash: answer.manifest.identity.contentManifestHash, answerManifestHash: answer.manifestHash,
      answerArtifactHash: answer.artifactHash, corpusApprovalHash: answer.corpusApprovalHash,
      providerDataControlReceiptHash: control.receiptHash, providerPricingReceiptHash: pricing.receiptHash,
      embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
      entries: uniqueInputs.map((item, index) => ({
        chunkChecksum: item.chunkChecksum,
        vectorChecksum: `sha256:${index.toString(16).padStart(64, '0')}`,
      })),
      inputTokens: budget.tokenUpperBound + 1, costMicroUsd: budget.costUpperBoundMicroUsd + 1,
      providerVectorSetChecksum: `sha256:${'7'.repeat(64)}`, indexChecksum: `sha256:${'8'.repeat(64)}`,
      createdAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
    });
    await writeProviderEmbeddingReceipt(receiptRoot, impossible);
    let providerCalls = 0;
    await expect(indexAnswerRelease(
      ['--embedding-mode=provider', '--confirm-live-provider'], providerEnv, () => undefined,
      {
        expectedProviderReceiptHash: impossible.embeddingReceiptHash,
        providerEmbeddingClient: {
          model: 'text-embedding-3-large', dimensions: 3072,
          async embed() { providerCalls += 1; throw new Error('provider embedding seam must stay closed'); },
        },
      },
    )).rejects.toThrow(/preauthorized|budget|authority|provider embedding seam/u);
    expect(providerCalls).toBe(0);
  });

  it('starts a local-non-zdr provider runtime against the exact verified catalog and budgeted usage guard', async () => {
    const { createLocalProviderAuthorization, writeLocalProviderAuthorization } = await import(
      '../../src/config/local-provider-authorization.js'
    );
    const { composedPublicAnswerRuntime, startApplication } = await import('../../src/main.js');
    const { DeterministicEmbeddingClient } = await import(
      '../../src/modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js'
    );
    const { LocalBudgetUsageGuard } = await import(
      '../../src/modules/public-answer/infrastructure/guards/local-budget-usage-guard.js'
    );
    const { OpenAiResponsesGenerator } = await import(
      '../../src/modules/public-answer/infrastructure/openai/openai-responses-generator.js'
    );
    const { PostgresHybridRetriever } = await import(
      '../../src/modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js'
    );
    const { PostgresRedactedEventSink } = await import(
      '../../src/modules/public-answer/infrastructure/postgres/postgres-redacted-event-sink.js'
    );
    const { VerifiedAnswerReleaseCatalogSource } = await import(
      '../../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js'
    );
    const { OpenAiSemanticVerifier } = await import(
      '../../src/modules/public-answer/infrastructure/verification/semantic-verifier.js'
    );
    const { PROVIDER_MODEL_POLICY } = await import(
      '../../src/modules/public-answer/infrastructure/openai/provider-model-policy.js'
    );

    const root = await mkdtemp(join(tmpdir(), 'local-e2e-runtime-'));
    temporaryRoots.push(root);
    const authorizationPath = join(root, 'authorization.json');
    const budgetLedgerPath = join(root, 'budget-ledger.json');
    const receiptRoot = join(root, 'embedding-receipts');
    await mkdir(receiptRoot);
    await writeLocalProviderAuthorization(
      authorizationPath,
      createLocalProviderAuthorization({
        createdAt: '2026-09-02T00:00:00.000Z',
        policyHash: PROVIDER_MODEL_POLICY.policyHash,
        monthlyHardCapMicroUsd: 1_000_000,
      }),
    );
    const env = {
      ...evaluationEnv(),
      HOST: '127.0.0.1',
      PORT: '4307',
      FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider',
      OPENAI_API_KEY: 'never-called-test-key',
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: receiptRoot,
      FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308',
      FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: authorizationPath,
      FORM_THOUGHT_LOCAL_BUDGET_LEDGER: budgetLedgerPath,
    };
    await indexAnswerRelease(
      ['--embedding-mode=provider', '--confirm-live-provider', '--provider-authority=local'],
      env,
      () => undefined,
      { providerEmbeddingClient: new DeterministicEmbeddingClient('test') },
    );
    const app = await startApplication({ env, attach: false });
    try {
      const composed = composedPublicAnswerRuntime(app);
      expect(composed.usageGuard).toBeInstanceOf(LocalBudgetUsageGuard);
      expect(composed.retriever).toBeInstanceOf(PostgresHybridRetriever);
      expect(composed.generator).toBeInstanceOf(OpenAiResponsesGenerator);
      expect(composed.semanticVerifier).toBeInstanceOf(OpenAiSemanticVerifier);
      expect(composed.eventSink).toBeInstanceOf(PostgresRedactedEventSink);
      expect(composed.catalogSource).toBeInstanceOf(VerifiedAnswerReleaseCatalogSource);
      const fastify = app.getHttpAdapter().getInstance();
      const ready = await fastify.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: 'ready' });
    } finally {
      await app.close();
    }
  });
});
