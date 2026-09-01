import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { RuntimeReadiness, runRuntimeStartupChecks } from '../src/health/runtime-readiness.js';
import { createApplication } from '../src/main.js';
import { PublicAnswerDeadlineError } from '../src/modules/public-answer/domain/public-answer-errors.js';
import { VerifiedAnswerReleaseCatalogSource } from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';
import {
  parseServeFixtureArguments,
  runServeFixtureHarness,
  startOwnedFixtureDatabase,
  type ServeFixtureHarnessDependencies,
} from '../scripts/with-test-postgres.mjs';

const binding = Object.freeze({
  contentReleaseId: '1'.repeat(64),
  answerReleaseId: '2'.repeat(64),
});

const apps: Awaited<ReturnType<typeof createApplication>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('runtime readiness', () => {
  it('rejects database chunk checksum/model/dimension drift without any provider call', async () => {
    let providerCalls = 0;
    const vector = Array(3072).fill(0) as number[];
    const vectorBytes = Buffer.alloc(vector.length * 4);
    vector.forEach((value, index) => vectorBytes.writeFloatBE(Math.fround(value), index * 4));
    const vectorChecksum = `sha256:${createHash('sha256').update(vectorBytes).digest('hex')}`;
    const expectedIndexRows = [{
      chunkId: 'chunk-1', chunkChecksum: `sha256:${'4'.repeat(64)}`, recordId: 'articles/example',
      canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'], body: 'public body',
      searchText: 'public search', vectorChecksum, model: 'text-embedding-3-large', dimensions: 3072, source: 'fixture',
    }];
    const catalog = Object.freeze({
      ...binding,
      bindingId: '11111111-1111-4111-8111-111111111111',
      embeddingSource: 'fixture' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map([['chunk-1', `sha256:${'4'.repeat(64)}`]]),
      indexInputByChunkId: new Map([['chunk-1', Object.freeze({
        recordId: 'articles/example', canonicalPath: '/articles/example/', title: 'Example', headingPath: ['Heading'],
        body: 'public body', searchText: 'public search',
      })]]),
      vectorChecksumByChunkId: new Map([['chunk-1', vectorChecksum]]),
      vectorSetChecksum: providerChecksum([{ chunkId: 'chunk-1', chunkChecksum: `sha256:${'4'.repeat(64)}`, vectorChecksum }]),
      indexRowsChecksum: providerChecksum(expectedIndexRows),
      indexChecksum: `sha256:${'8'.repeat(64)}`,
    });
    const rows = [{
      chunk_id: 'chunk-1', chunk_checksum: `sha256:${'4'.repeat(64)}`,
      embedding_model: 'text-embedding-3-large', embedding_dimensions: 3072,
      record_id: 'articles/example', canonical_path: '/articles/example/', title: 'Example', heading_path: ['Heading'],
      body: 'public body', search_text: 'public search', embedding: `[${vector.join(',')}]`,
    }];
    const config = { publicAskMode: 'fixture', providerDataControlReceiptPath: null, providerEmbeddingReceiptRoot: null } as any;
    const dependencies = {
      pool: { async query(sql: string) { return sql === 'SELECT 1' ? { rows: [{ '?column?': 1 }] } : { rows }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { providerCalls += 1; throw new Error('must not call provider evidence'); },
      async readProviderEmbedding() { providerCalls += 1; throw new Error('must not call provider evidence'); },
      async readProviderPricing() { providerCalls += 1; throw new Error('must not call provider evidence'); },
    };
    await expect(runRuntimeStartupChecks(config, dependencies as any)).resolves.toBe(catalog);
    expect(providerCalls).toBe(0);

    for (const mutation of [
      { chunk_checksum: `sha256:${'9'.repeat(64)}` },
      { embedding_model: 'other-model' },
      { embedding_dimensions: 1536 },
      { search_text: 'drifted search payload' },
      { embedding: `[1,${vector.slice(1).join(',')}]` },
    ]) {
      const drifted = { ...dependencies, pool: { async query(sql: string) {
        return sql === 'SELECT 1' ? { rows: [{}] } : { rows: [{ ...rows[0], ...mutation }] };
      } } };
      await expect(runRuntimeStartupChecks(config, drifted as any)).rejects.toThrow(/drift/u);
    }
  });

  it('aborts catalog filesystem or pool acquisition at the shared absolute deadline with the exact typed reason', async () => {
    let resolveClient!: (client: any) => void;
    let released: boolean | undefined;
    const config = {
      nodeEnv: 'test', corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
      providerEmbeddingReceiptRoot: null,
    } as any;
    const readers = {
      async readApproval() { return { schemaVersion: 1, entries: [] }; },
      async readContent() { return { manifest: { releaseId: '1'.repeat(64), records: {} }, manifestHash: `sha256:${'1'.repeat(64)}`, artifactHash: `sha256:${'2'.repeat(64)}` }; },
      async readAnswer() {
        return {
          releasePath: '/answer/release', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
          manifestHash: `sha256:${'3'.repeat(64)}`, artifactHash: `sha256:${'4'.repeat(64)}`,
          corpusApprovalHash: `sha256:${'5'.repeat(64)}`, manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } },
          chunks: [], evidence: [], indexInputs: [],
        };
      },
      async verifyAnswer() {},
    };
    const source = new VerifiedAnswerReleaseCatalogSource(config, {
      connect: () => new Promise((resolve) => { resolveClient = resolve; }),
    } as any, readers as any);
    const controller = new AbortController();
    const reason = new PublicAnswerDeadlineError('catalog deadline elapsed');
    const pending = source.snapshot(controller.signal, performance.now() + 12_000);
    for (let attempt = 0; attempt < 10 && !resolveClient; attempt += 1) await Promise.resolve();
    expect(resolveClient).toBeTypeOf('function');
    controller.abort(reason);
    const result = await Promise.race([
      pending.then(() => ({ kind: 'resolved' as const }), (error) => ({ kind: 'rejected' as const, error })),
      new Promise<{ kind: 'hung' }>((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 50)),
    ]);
    resolveClient({ query: async () => ({ rows: [], rowCount: 0 }), release(destroy?: boolean) { released = destroy; } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result).toEqual({ kind: 'rejected', error: reason });
    expect(released).toBe(true);
  });

  it.each(['begin', 'active-binding-query'] as const)(
    'settles an abort-ignoring catalog %s at the absolute deadline and destroys its client', async (stalled) => {
    let released: boolean | undefined;
    let queries = 0;
    const client = {
      query() {
        queries += 1;
        if (stalled === 'begin' || queries === 2) return new Promise(() => undefined);
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      release(destroy?: boolean) { released = destroy; },
    };
    const source = new VerifiedAnswerReleaseCatalogSource({
      nodeEnv: 'test', corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
      providerEmbeddingReceiptRoot: null,
    } as any, { async connect() { return client; } } as any, {
      async readApproval() { return { schemaVersion: 1, entries: [] }; },
      async readContent() {
        return { manifest: { releaseId: '1'.repeat(64), records: {} }, manifestHash: `sha256:${'1'.repeat(64)}`, artifactHash: `sha256:${'2'.repeat(64)}` };
      },
      async readAnswer() {
        return {
          releasePath: '/answer/release', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
          manifestHash: `sha256:${'3'.repeat(64)}`, artifactHash: `sha256:${'4'.repeat(64)}`,
          corpusApprovalHash: `sha256:${'5'.repeat(64)}`,
          manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } },
          chunks: [], evidence: [], indexInputs: [],
        };
      },
      async verifyAnswer() {},
    } as any);
    const result = await Promise.race([
      source.snapshot(new AbortController().signal, performance.now() + 10)
        .then(() => ({ kind: 'resolved' as const }), (error) => ({ kind: 'rejected' as const, error })),
      new Promise<{ kind: 'hung' }>((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 100)),
    ]);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('catalog deadline did not settle');
    expect(result.error).toBeInstanceOf(PublicAnswerDeadlineError);
    expect(released).toBe(true);
  });

  it('classifies an abort-ignoring catalog rollback that consumes the original deadline as the exact typed timeout', async () => {
    let released: boolean | undefined;
    const client = {
      query(text: string) {
        if (text.startsWith('BEGIN')) return Promise.resolve({ rows: [], rowCount: 0 });
        if (text === 'ROLLBACK') return new Promise(() => undefined);
        return Promise.reject(new Error('active binding query failed'));
      },
      release(destroy?: boolean) { released = destroy; },
    };
    const source = new VerifiedAnswerReleaseCatalogSource({
      nodeEnv: 'test', corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
      providerEmbeddingReceiptRoot: null,
    } as any, { async connect() { return client; } } as any, {
      async readApproval() { return { schemaVersion: 1, entries: [] }; },
      async readContent() {
        return { manifest: { releaseId: '1'.repeat(64), records: {} }, manifestHash: `sha256:${'1'.repeat(64)}`, artifactHash: `sha256:${'2'.repeat(64)}` };
      },
      async readAnswer() {
        return {
          releasePath: '/answer/release', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
          manifestHash: `sha256:${'3'.repeat(64)}`, artifactHash: `sha256:${'4'.repeat(64)}`,
          corpusApprovalHash: `sha256:${'5'.repeat(64)}`,
          manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } },
          chunks: [], evidence: [], indexInputs: [],
        };
      },
      async verifyAnswer() {},
    } as any);
    const result = await Promise.race([
      source.snapshot(new AbortController().signal, performance.now() + 10)
        .then(() => ({ kind: 'resolved' as const }), (error) => ({ kind: 'rejected' as const, error })),
      new Promise<{ kind: 'hung' }>((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 100)),
    ]);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') throw new Error('catalog rollback deadline did not settle');
    expect(result.error).toBeInstanceOf(PublicAnswerDeadlineError);
    expect(released).toBe(true);
  });

  it('preserves the earlier catalog error when rollback fails before the deadline', async () => {
    let released: boolean | undefined;
    const original = new Error('active binding query failed');
    const client = {
      query(text: string) {
        if (text.startsWith('BEGIN')) return Promise.resolve({ rows: [], rowCount: 0 });
        if (text === 'ROLLBACK') return Promise.reject(new Error('rollback failed'));
        return Promise.reject(original);
      },
      release(destroy?: boolean) { released = destroy; },
    };
    const source = new VerifiedAnswerReleaseCatalogSource({
      nodeEnv: 'test', corpusApprovalPath: '/approval', contentReleaseRoot: '/content', answerReleaseRoot: '/answer',
      providerEmbeddingReceiptRoot: null,
    } as any, { async connect() { return client; } } as any, {
      async readApproval() { return { schemaVersion: 1, entries: [] }; },
      async readContent() {
        return { manifest: { releaseId: '1'.repeat(64), records: {} }, manifestHash: `sha256:${'1'.repeat(64)}`, artifactHash: `sha256:${'2'.repeat(64)}` };
      },
      async readAnswer() {
        return {
          releasePath: '/answer/release', contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64),
          manifestHash: `sha256:${'3'.repeat(64)}`, artifactHash: `sha256:${'4'.repeat(64)}`,
          corpusApprovalHash: `sha256:${'5'.repeat(64)}`,
          manifest: { identity: { contentManifestHash: `sha256:${'1'.repeat(64)}`, normalizerVersion: 'nfkc-lower-hangul-ngram-v1' } },
          chunks: [], evidence: [], indexInputs: [],
        };
      },
      async verifyAnswer() {},
    } as any);
    await expect(source.snapshot(new AbortController().signal, performance.now() + 1_000)).rejects.toBe(original);
    expect(released).toBe(true);
  });

  it('strict-reopens provider evidence and binds its data-control/pricing hashes', async () => {
    const catalog = Object.freeze({
      ...binding,
      bindingId: '11111111-1111-4111-8111-111111111111',
      embeddingSource: 'provider' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map(),
      indexInputByChunkId: new Map(),
      vectorChecksumByChunkId: new Map(),
      vectorSetChecksum: providerChecksum([]),
      indexRowsChecksum: providerChecksum([]),
      indexChecksum: `sha256:${'8'.repeat(64)}`,
    });
    const config = {
      publicAskMode: 'provider', providerDataControlReceiptPath: '/receipts/control.json',
      providerEmbeddingReceiptRoot: '/receipts/embedding',
    } as any;
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { return { receiptHash: `sha256:${'5'.repeat(64)}` }; },
      async readProviderPricing() { return { receiptHash: `sha256:${'6'.repeat(64)}` }; },
      async readProviderEmbedding() {
        return {
          contentReleaseId: binding.contentReleaseId, answerReleaseId: binding.answerReleaseId,
          embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
          providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`,
          providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`,
        };
      },
    };
    await expect(runRuntimeStartupChecks(config, dependencies as any)).resolves.toBe(catalog);
    await expect(runRuntimeStartupChecks(config, {
      ...dependencies,
      async readProviderEmbedding() {
        return { ...(await dependencies.readProviderEmbedding()), providerDataControlReceiptHash: `sha256:${'0'.repeat(64)}` };
      },
    } as any)).rejects.toThrow(/provider.*drift/u);
  });

  it('binds production evaluation readiness to every active release and evaluator authority', async () => {
    const usageHash = `sha256:${'7'.repeat(64)}`;
    const hiddenHash = `sha256:${'8'.repeat(64)}`;
    const catalog = Object.freeze({
      ...binding,
      bindingId: '11111111-1111-4111-8111-111111111111',
      contentManifestHash: `sha256:${'a'.repeat(64)}`,
      answerManifestHash: `sha256:${'b'.repeat(64)}`,
      answerArtifactHash: `sha256:${'c'.repeat(64)}`,
      corpusApprovalHash: `sha256:${'d'.repeat(64)}`,
      embeddingSource: 'provider' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map(), indexInputByChunkId: new Map(), vectorChecksumByChunkId: new Map(),
      vectorSetChecksum: providerChecksum([]), indexRowsChecksum: providerChecksum([]),
      indexChecksum: `sha256:${'4'.repeat(64)}`, tombstones: new Set(),
    });
    let receivedBinding: Record<string, unknown> | undefined;
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() {
        return { projectHash: `sha256:${'9'.repeat(64)}`, receiptHash: `sha256:${'5'.repeat(64)}` };
      },
      async readProviderPricing() { return { receiptHash: `sha256:${'6'.repeat(64)}` }; },
      async readProviderEmbedding() {
        return {
          contentReleaseId: binding.contentReleaseId, answerReleaseId: binding.answerReleaseId,
          embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
          providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`,
          providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`,
        };
      },
      async readPublicEvaluationManifest() { return Buffer.from('public-eval-manifest'); },
      async readEvaluationUsage() { return { receiptHash: usageHash, hiddenManifestHash: hiddenHash }; },
      async readProductionEvaluation(_path: string, expected: Record<string, unknown>) {
        receivedBinding = expected;
        return { evaluationUsageReceiptHash: usageHash, hiddenManifestHash: hiddenHash };
      },
    };
    const config = {
      nodeEnv: 'production', publicAskMode: 'provider', providerDataControlReceiptPath: '/receipts/control.json',
      providerEmbeddingReceiptRoot: '/receipts/embedding', productionEvalReportPath: '/receipts/eval.json',
      evaluationUsageReceiptPath: '/receipts/usage.json',
    } as any;
    await expect(runRuntimeStartupChecks(config, dependencies as any)).resolves.toBe(catalog);
    expect(receivedBinding).toMatchObject({
      contentReleaseId: binding.contentReleaseId,
      answerReleaseId: binding.answerReleaseId,
      contentManifestHash: catalog.contentManifestHash,
      answerManifestHash: catalog.answerManifestHash,
      answerArtifactHash: catalog.answerArtifactHash,
      corpusApprovalHash: catalog.corpusApprovalHash,
      embeddingModel: 'text-embedding-3-large',
      embeddingReceiptHash: catalog.embeddingReceiptHash,
      evaluationUsageReceiptHash: usageHash,
      retrieverVersion: 'postgres-hybrid-rrf-v1',
      evaluatorVersion: 'public-answer-evaluator-v1',
      promptSchemaVersion: 'public-answer-generation-and-support-v1',
      semanticVerifierVersion: 'semantic-support-v1',
    });
    expect(receivedBinding?.publicManifestHash).toBe(providerChecksum(Buffer.from('public-eval-manifest')));
  });

  it('caches one successful startup check and becomes false immediately on shutdown', async () => {
    let checks = 0;
    const readiness = new RuntimeReadiness({
      startupCheck: async () => {
        checks += 1;
        return binding;
      },
    });

    await expect(readiness.initialize()).resolves.toBe(binding);
    await expect(readiness.initialize()).resolves.toBe(binding);
    expect(checks).toBe(1);
    expect(readiness.status()).toEqual({ ready: true, binding });

    readiness.beginShutdown();
    expect(readiness.status()).toEqual({ ready: false, binding });
  });

  it('fails closed without discarding a verified startup binding used by bounded errors', async () => {
    const readiness = new RuntimeReadiness({ startupCheck: async () => binding });
    await readiness.initialize();
    readiness.hardFailure();

    expect(readiness.status()).toEqual({ ready: false, binding });
    expect(readiness.startupBinding()).toBe(binding);
  });

  it('does not retry or expose a failed startup prerequisite', async () => {
    let checks = 0;
    const readiness = new RuntimeReadiness({
      startupCheck: async () => {
        checks += 1;
        throw new Error('secret release path');
      },
    });

    await expect(readiness.initialize()).rejects.toThrow('runtime readiness startup check failed');
    await expect(readiness.initialize()).rejects.toThrow('runtime readiness startup check failed');
    expect(checks).toBe(1);
    expect(readiness.status()).toEqual({ ready: false, binding: null });
  });

  it('keeps liveness process-only while readiness reflects cached startup and lifecycle state', async () => {
    const readiness = new RuntimeReadiness({ startupCheck: async () => binding });
    const app = await createApplication({ runtime: { readiness } });
    apps.push(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();

    const before = await fastify.inject({ method: 'GET', url: '/health/ready' });
    expect(before.statusCode).toBe(503);
    expect(before.json()).toEqual({ status: 'not-ready' });
    expect((await fastify.inject({ method: 'GET', url: '/health/live' })).json()).toEqual({ status: 'live' });

    await readiness.initialize();
    expect((await fastify.inject({ method: 'GET', url: '/health/ready' })).json()).toEqual({ status: 'ready' });

    readiness.beginShutdown();
    expect((await fastify.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(503);
    expect((await fastify.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
  });

  it('serves the ready envelope over a real loopback socket after startup initialization', async () => {
    const readiness = new RuntimeReadiness({ startupCheck: async () => binding });
    await readiness.initialize();
    const app = await createApplication({ runtime: { readiness } });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('test server address is unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });
});

describe('owned fixture serve harness', () => {
  it('requires an exact loopback host, port, public origin, and exact scenario enum', () => {
    expect(parseServeFixtureArguments([
      'serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308',
    ])).toEqual({
      host: '127.0.0.1', port: 4307, apiOrigin: 'http://127.0.0.1:4307/',
      publicOrigin: 'http://127.0.0.1:4308', fixtureScenario: 'success',
    });
    expect(parseServeFixtureArguments([
      'serve-fixture', '--host', '::1', '--port', '4308', '--public-origin', 'http://[::1]:4309',
      '--fixture-scenario', 'slow-sql',
    ])).toEqual({
      host: '::1', port: 4308, apiOrigin: 'http://[::1]:4308/',
      publicOrigin: 'http://[::1]:4309', fixtureScenario: 'slow-sql',
    });
    expect(parseServeFixtureArguments([
      'serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308',
      '--fixture-scenario=stress-max',
    ])).toMatchObject({ fixtureScenario: 'stress-max' });
    for (const argv of [
      ['serve-fixture'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308/'],
      ['serve-fixture', '--host=0.0.0.0', '--port=4307', '--public-origin=http://127.0.0.1:4307/'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.2:4308/'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://user@127.0.0.1:4308/'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308/path'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308/?query=1'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4308/#fragment'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4307/', '--fixture-scenario=magic'],
    ]) expect(() => parseServeFixtureArguments(argv)).toThrow();
  });

  function fixtureDependencies(overrides: Partial<ServeFixtureHarnessDependencies> = {}) {
    const events: string[] = [];
    const dependencies: ServeFixtureHarnessDependencies = {
      env: {},
      async startDatabase() {
        events.push('database.start');
        return {
          databaseUrl: 'postgresql://fixture:fixture@127.0.0.1:6543/fixture',
          async stop() { events.push('database.stop'); },
        };
      },
      async verifyReleases() { events.push('release.verify'); },
      async migrate() { events.push('migration.apply'); },
      async indexFixture() { events.push('fixture.index'); },
      startServer(env) {
        events.push(`server.start:${env.FORM_THOUGHT_PUBLIC_ORIGIN}:${env.FORM_THOUGHT_TEST_FIXTURE_SCENARIO}`);
        return {
          startup: Promise.resolve(),
          signal: (signal) => { events.push(`server.signal:${signal}`); },
          wait: Promise.resolve(),
        };
      },
      async ready() { events.push('readiness.poll'); return true; },
      async sleep() { events.push('readiness.sleep'); },
      clock: () => 0,
      onSignal() { return () => undefined; },
      ...overrides,
    };
    return { dependencies, events };
  }

  it('verifies, migrates, indexes, serves, waits for readiness, and always cleans its database in order', async () => {
    const h = fixtureDependencies({
      async ready(origin) { h.events.push(`readiness.poll:${origin}`); return true; },
    });
    await runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4308', fixtureScenario: 'insufficient-evidence',
    }, h.dependencies);
    expect(h.events).toEqual([
      'database.start',
      'release.verify',
      'migration.apply',
      'fixture.index',
      'server.start:http://127.0.0.1:4308:insufficient-evidence',
      'readiness.poll:http://127.0.0.1:4307/',
      'database.stop',
    ]);
  });

  it('rejects provider keys before database startup and cleans after startup failure', async () => {
    const provider = fixtureDependencies({ env: { OPENAI_API_KEY: 'forbidden' } });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, provider.dependencies)).rejects.toThrow(/provider key/u);
    expect(provider.events).toEqual([]);

    const failed = fixtureDependencies({ async migrate() { throw new Error('migration failed'); } });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, failed.dependencies)).rejects.toThrow('migration failed');
    expect(failed.events).toEqual(['database.start', 'release.verify', 'database.stop']);
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('forwards %s to the owned server and then removes the database', async (signal) => {
    let handler: ((signal: 'SIGINT' | 'SIGTERM') => void) | undefined;
    let finishServer!: () => void;
    const h = fixtureDependencies({
      startServer() {
        h.events.push('server.start');
        return {
          startup: Promise.resolve(),
          signal(value) { h.events.push(`server.signal:${value}`); finishServer(); },
          wait: new Promise<void>((resolve) => { finishServer = resolve; }),
        };
      },
      onSignal(next) { handler = next; return () => { h.events.push('signals.remove'); }; },
    });
    const running = runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, h.dependencies);
    while (!handler || !h.events.includes('server.start')) await Promise.resolve();
    handler(signal);
    await running;
    expect(h.events).toContain(`server.signal:${signal}`);
    expect(h.events.indexOf(`server.signal:${signal}`)).toBeLessThan(h.events.indexOf('database.stop'));
    expect(h.events.slice(-2)).toEqual(['signals.remove', 'database.stop']);
  });

  it('owns signals before database startup and cleans a database handle that arrives after interruption', async () => {
    let handler: ((signal: 'SIGINT' | 'SIGTERM') => void) | undefined;
    let finishDatabase!: () => void;
    const databaseGate = new Promise<void>((resolve) => { finishDatabase = resolve; });
    const h = fixtureDependencies({
      async startDatabase() {
        h.events.push('database.start');
        await databaseGate;
        return {
          databaseUrl: 'postgresql://fixture:fixture@127.0.0.1:6543/fixture',
          async stop() { h.events.push('database.stop'); },
        };
      },
      onSignal(next) { handler = next; return () => { h.events.push('signals.remove'); }; },
    });
    const running = runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, h.dependencies);
    await Promise.resolve();
    expect(handler).toBeTypeOf('function');
    handler!('SIGINT');
    finishDatabase();
    await expect(running).rejects.toThrow(/interrupt/i);
    expect(h.events).toContain('database.stop');
    expect(h.events).not.toContain('release.verify');
  });

  it('does not remove the database when SIGKILL cannot confirm owned child termination', async () => {
    const h = fixtureDependencies({
      startServer() {
        h.events.push('server.start');
        return {
          startup: Promise.resolve(),
          signal(value) { h.events.push(`server.signal:${value}`); },
          wait: new Promise<void>(() => undefined),
        };
      },
      async ready() { throw new Error('readiness failed'); },
      async sleep() { h.events.push('bounded.wait'); },
    });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, h.dependencies)).rejects.toThrow(/termination was not confirmed/u);
    expect(h.events).toContain('server.signal:SIGTERM');
    expect(h.events).toContain('server.signal:SIGKILL');
    expect(h.events).not.toContain('database.stop');
  });

  it('removes a partially created owned Docker project when startup or port discovery fails', async () => {
    const calls: string[] = [];
    await expect(startOwnedFixtureDatabase({
      repositoryRoot: '/repo', composeFile: '/repo/compose.yml', projectName: 'owned-fixture', env: {},
      async run(input) {
        calls.push(input.args.join(' '));
        if (input.args.includes('up')) throw new Error('partial startup');
        return '';
      },
    })).rejects.toThrow('partial startup');
    expect(calls).toEqual([
      'compose -p owned-fixture -f /repo/compose.yml up -d --wait',
      'compose -p owned-fixture -f /repo/compose.yml down -v --remove-orphans',
    ]);
  });

  it('interrupts an in-flight owned Docker startup and tears down the exact project', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const starting = startOwnedFixtureDatabase({
      repositoryRoot: '/repo', composeFile: '/repo/compose.yml', projectName: 'owned-interrupted', env: {},
      async run(input) {
        calls.push(input.args.join(' '));
        if (input.args.includes('up')) {
          await new Promise<void>((_resolve, reject) => {
            input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
          });
        }
        return '';
      },
    }, controller.signal);
    controller.abort(new Error('operator interruption'));
    await expect(starting).rejects.toThrow('operator interruption');
    expect(calls).toEqual([
      'compose -p owned-interrupted -f /repo/compose.yml up -d --wait',
      'compose -p owned-interrupted -f /repo/compose.yml down -v --remove-orphans',
    ]);
  });

  it('observes an asynchronous owned EADDRINUSE exit before probing an unrelated listener', async () => {
    let unrelatedProbes = 0;
    let rejectStartup!: (error: Error) => void;
    let rejectWait!: (error: Error) => void;
    const h = fixtureDependencies({
      startServer() {
        const startup = new Promise<void>((_resolve, reject) => { rejectStartup = reject; });
        const wait = new Promise<void>((_resolve, reject) => { rejectWait = reject; });
        queueMicrotask(() => {
          const error = Object.assign(new Error('owned port already in use'), { code: 'EADDRINUSE' });
          rejectStartup(error);
          rejectWait(error);
        });
        return { startup, wait, signal() {} };
      },
      async ready() { unrelatedProbes += 1; return true; },
      onSignal() { return () => undefined; },
    });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
    }, h.dependencies)).rejects.toThrow('owned port already in use');
    expect(unrelatedProbes).toBe(0);
    expect(h.events.at(-1)).toBe('database.stop');
  });

  it('bounds a child that never acknowledges startup and cleans the confirmed stopped process before its database', async () => {
    let finishServer!: () => void;
    const h = fixtureDependencies({
      startServer() {
        h.events.push('server.start');
        return {
          startup: new Promise<void>(() => undefined),
          wait: new Promise<void>((resolve) => { finishServer = resolve; }),
          signal(value) {
            h.events.push(`server.signal:${value}`);
            if (value === 'SIGTERM') finishServer();
          },
        };
      },
      async ready() { h.events.push('unrelated.readiness'); return true; },
    });
    vi.useFakeTimers();
    try {
      const running = runServeFixtureHarness({
        host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307', fixtureScenario: 'success',
      }, h.dependencies);
      const observed = running.then(
        () => ({ kind: 'resolved' as const, error: undefined }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      );
      while (!h.events.includes('server.start')) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await observed;
      expect(result.kind).toBe('rejected');
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toMatch(/startup deadline/u);
    } finally {
      vi.useRealTimers();
    }
    expect(h.events).not.toContain('unrelated.readiness');
    expect(h.events).toContain('server.signal:SIGTERM');
    expect(h.events.indexOf('server.signal:SIGTERM')).toBeLessThan(h.events.indexOf('database.stop'));
  });
});
