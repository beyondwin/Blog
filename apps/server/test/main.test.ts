import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalProviderAuthorization,
  localProviderAuthorizationHash,
  writeLocalProviderAuthorization,
} from '../src/config/local-provider-authorization.js';
import { parseServerConfig, type ServerConfig } from '../src/config/server-config.js';
import { composedPublicAnswerRuntime, startApplication } from '../src/main.js';
import { InMemoryUsageGuard } from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { LocalBudgetLedger } from '../src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { LocalBudgetUsageGuard } from '../src/modules/public-answer/infrastructure/guards/local-budget-usage-guard.js';
import { OpenAIEmbeddingClient } from '../src/modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import {
  createProviderEmbeddingReceipt,
  writeProviderEmbeddingReceipt,
} from '../src/modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import { OpenAiResponsesClient } from '../src/modules/public-answer/infrastructure/openai/openai-responses-client.js';
import { OpenAiResponsesGenerator } from '../src/modules/public-answer/infrastructure/openai/openai-responses-generator.js';
import { PROVIDER_MODEL_POLICY } from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';
import { PostgresHybridRetriever } from '../src/modules/public-answer/infrastructure/postgres/postgres-hybrid-retriever.js';
import { PostgresRedactedEventSink } from '../src/modules/public-answer/infrastructure/postgres/postgres-redacted-event-sink.js';
import { VerifiedAnswerReleaseCatalogSource } from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { OpenAiSemanticVerifier } from '../src/modules/public-answer/infrastructure/verification/semantic-verifier.js';


const roots: string[] = [];
const apps: NestFastifyApplication[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fakePool(): Pool {
  return {
    async query(sql: string) {
      if (typeof sql === 'string' && sql.includes('expired_events')) {
        return { rows: [{ events_deleted: 0, aggregates_deleted: 0 }] };
      }
      if (sql === 'SELECT 1') return { rows: [{}] };
      return { rows: [] };
    },
    async end() { return undefined; },
    async connect() { throw new Error('pool.connect is not expected in composition tests'); },
  } as unknown as Pool;
}

async function localFiles() {
  const root = await mkdtemp(join(tmpdir(), 'local-runtime-'));
  roots.push(root);
  const authorizationPath = join(root, 'authorization.json');
  const budgetLedgerPath = join(root, 'budget-ledger.json');
  const receiptRoot = join(root, 'embedding-receipts');
  await mkdir(receiptRoot);
  const authorization = createLocalProviderAuthorization({
    createdAt: '2026-09-02T00:00:00.000Z',
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    monthlyHardCapMicroUsd: 1_000_000,
  });
  await writeLocalProviderAuthorization(authorizationPath, authorization);
  return {
    root,
    authorizationPath,
    budgetLedgerPath,
    receiptRoot,
    authorization,
    authorizationHash: localProviderAuthorizationHash(authorization),
  };
}

function localCatalog(receiptHash: string, indexChecksum: string) {
  return Object.freeze({
    bindingId: '11111111-1111-4111-8111-111111111111',
    contentReleaseId: 'c'.repeat(64),
    answerReleaseId: 'a'.repeat(64),
    corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    contentManifestHash: `sha256:${'1'.repeat(64)}`,
    answerManifestHash: `sha256:${'2'.repeat(64)}`,
    answerArtifactHash: `sha256:${'3'.repeat(64)}`,
    chunkCount: 0,
    embeddingSource: 'provider' as const,
    embeddingReceiptHash: receiptHash,
    chunkChecksumById: new Map<string, string>(),
    indexInputByChunkId: new Map(),
    vectorChecksumByChunkId: new Map<string, string>(),
    vectorSetChecksum: providerChecksum([]),
    indexRowsChecksum: providerChecksum([]),
    indexChecksum,
    isBoundTo() { return true; },
    evidenceFor() { return []; },
    hasAuthorizedEvidenceLocation() { return false; },
  });
}

async function localRuntime() {
  const files = await localFiles();
  const receipt = createProviderEmbeddingReceipt({
    schemaVersion: 1,
    contentReleaseId: 'c'.repeat(64),
    answerReleaseId: 'a'.repeat(64),
    contentManifestHash: `sha256:${'1'.repeat(64)}`,
    answerManifestHash: `sha256:${'2'.repeat(64)}`,
    answerArtifactHash: `sha256:${'3'.repeat(64)}`,
    corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    providerAuthorityKind: 'local-non-zdr',
    providerAuthorityHash: files.authorizationHash,
    providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
    providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    embeddingModel: 'text-embedding-3-large',
    embeddingDimensions: 3072,
    embeddingSource: 'provider',
    entries: [],
    inputTokens: 0,
    costMicroUsd: 0,
    providerVectorSetChecksum: providerChecksum([]),
    indexChecksum: `sha256:${'8'.repeat(64)}`,
    createdAt: '2026-09-02T00:00:00.000Z',
    completedAt: '2026-09-02T00:00:01.000Z',
  });
  await writeProviderEmbeddingReceipt(files.receiptRoot, receipt);
  const config = await parseServerConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '4307',
    FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider',
    OPENAI_API_KEY: 'test-provider-key',
    FORM_THOUGHT_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
    FORM_THOUGHT_CONTENT_RELEASE_ROOT: resolve('build/public-releases'),
    FORM_THOUGHT_ANSWER_RELEASE_ROOT: resolve('build/public-answer-releases'),
    FORM_THOUGHT_NETWORK_HMAC_SECRET: 'test-secret-at-least-32-characters-long',
    FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: files.receiptRoot,
    FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308',
    FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: files.authorizationPath,
    FORM_THOUGHT_LOCAL_BUDGET_LEDGER: files.budgetLedgerPath,
  });
  const catalog = localCatalog(receipt.embeddingReceiptHash, receipt.indexChecksum);
  const catalogSource = new VerifiedAnswerReleaseCatalogSource(config, fakePool());
  vi.spyOn(catalogSource, 'snapshot').mockResolvedValue(catalog as never);
  return { files, config, catalog, catalogSource, receipt };
}

describe('local provider runtime composition', () => {
  it('wires one query embedding client, one shared Responses client, Luna collaborators, the budgeted usage guard, PostgreSQL retriever/event sink, and the verified catalog', async () => {
    const { config, catalogSource } = await localRuntime();
    const createLocalGuard = vi.spyOn(LocalBudgetUsageGuard, 'create');
    const pool = fakePool();
    const app = await startApplication({
      config,
      pool,
      controlPool: fakePool(),
      catalogSource,
      attach: false,
    });
    apps.push(app);

    expect(createLocalGuard).toHaveBeenCalledTimes(1);
    expect(createLocalGuard.mock.calls[0]?.[0]).toEqual({
      ledger: expect.any(LocalBudgetLedger),
      inner: expect.any(InMemoryUsageGuard),
    });

    const composed = composedPublicAnswerRuntime(app);
    const usageGuard = composed.usageGuard;
    const retriever = composed.retriever;
    const generator = composed.generator;
    const semanticVerifier = composed.semanticVerifier;
    const eventSink = composed.eventSink;
    const catalog = composed.catalogSource;
    const embeddingClient = composed.embeddingClient;
    const responsesClient = composed.responsesClient;

    expect(usageGuard).toBeInstanceOf(LocalBudgetUsageGuard);
    expect(usageGuard).not.toBeInstanceOf(InMemoryUsageGuard);
    expect(retriever).toBeInstanceOf(PostgresHybridRetriever);
    expect(generator).toBeInstanceOf(OpenAiResponsesGenerator);
    expect(semanticVerifier).toBeInstanceOf(OpenAiSemanticVerifier);
    expect(eventSink).toBeInstanceOf(PostgresRedactedEventSink);
    expect(catalog).toBe(catalogSource);
    expect(catalogSource).toBeInstanceOf(VerifiedAnswerReleaseCatalogSource);
    expect(embeddingClient).toBeInstanceOf(OpenAIEmbeddingClient);
    expect(embeddingClient).toMatchObject({ model: 'text-embedding-3-large', dimensions: 3072 });
    expect((embeddingClient as unknown as { profile: string }).profile).toBe('query');
    expect((retriever as unknown as { embedder: unknown }).embedder).toBe(embeddingClient);
    expect(responsesClient).toBeInstanceOf(OpenAiResponsesClient);
    expect((semanticVerifier as unknown as { client: unknown }).client).toBe(responsesClient);
    expect(config.providerAuthority).toMatchObject({ kind: 'local-non-zdr' });
  });

  it('keeps fixture mode on the in-memory daily guard', async () => {
    const createLocalGuard = vi.spyOn(LocalBudgetUsageGuard, 'create');
    const catalog = Object.freeze({
      bindingId: '11111111-1111-4111-8111-111111111111',
      contentReleaseId: 'c'.repeat(64),
      answerReleaseId: 'a'.repeat(64),
      corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
      contentManifestHash: `sha256:${'1'.repeat(64)}`,
      answerManifestHash: `sha256:${'2'.repeat(64)}`,
      answerArtifactHash: `sha256:${'3'.repeat(64)}`,
      chunkCount: 0,
      embeddingSource: 'fixture' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map(),
      indexInputByChunkId: new Map(),
      vectorChecksumByChunkId: new Map(),
      vectorSetChecksum: providerChecksum([]),
      indexRowsChecksum: providerChecksum([]),
      indexChecksum: `sha256:${'8'.repeat(64)}`,
      isBoundTo() { return true; },
      evidenceFor() { return []; },
      hasAuthorizedEvidenceLocation() { return false; },
    });
    const config = await parseServerConfig({
      NODE_ENV: 'test',
      FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture',
      FORM_THOUGHT_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
      FORM_THOUGHT_CONTENT_RELEASE_ROOT: resolve('build/public-releases'),
      FORM_THOUGHT_ANSWER_RELEASE_ROOT: resolve('build/public-answer-releases'),
      FORM_THOUGHT_NETWORK_HMAC_SECRET: 'test-secret-at-least-32-characters-long',
    });
    const catalogSource = new VerifiedAnswerReleaseCatalogSource(config, fakePool());
    vi.spyOn(catalogSource, 'snapshot').mockResolvedValue(catalog as never);
    const app = await startApplication({
      config,
      pool: fakePool(),
      controlPool: fakePool(),
      catalogSource,
      attach: false,
    });
    apps.push(app);
    expect(createLocalGuard).not.toHaveBeenCalled();
    expect(composedPublicAnswerRuntime(app).usageGuard).toBeInstanceOf(InMemoryUsageGuard);
  });

  it('rejects an injected local-non-zdr authority in production before Nest application creation', async () => {
    const { config } = await localRuntime();
    const create = vi.spyOn(NestFactory, 'create');
    const productionConfig = Object.freeze({
      ...config,
      nodeEnv: 'production',
    }) as ServerConfig;
    await expect(startApplication({
      config: productionConfig,
      pool: fakePool(),
      controlPool: fakePool(),
      attach: false,
    })).rejects.toThrow(/local-non-zdr|production/u);
    expect(create).not.toHaveBeenCalled();
  });
});
