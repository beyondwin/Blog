import { afterEach, describe, expect, it } from 'vitest';

import { RuntimeReadiness, runRuntimeStartupChecks } from '../src/health/runtime-readiness.js';
import { createApplication } from '../src/main.js';
import {
  parseServeFixtureArguments,
  runServeFixtureHarness,
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
    const catalog = Object.freeze({
      ...binding,
      bindingId: '11111111-1111-4111-8111-111111111111',
      embeddingSource: 'fixture' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map([['chunk-1', `sha256:${'4'.repeat(64)}`]]),
    });
    const rows = [{
      chunk_id: 'chunk-1', chunk_checksum: `sha256:${'4'.repeat(64)}`,
      embedding_model: 'text-embedding-3-large', embedding_dimensions: 3072,
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
    ]) {
      const drifted = { ...dependencies, pool: { async query(sql: string) {
        return sql === 'SELECT 1' ? { rows: [{}] } : { rows: [{ ...rows[0], ...mutation }] };
      } } };
      await expect(runRuntimeStartupChecks(config, drifted as any)).rejects.toThrow(/drift/u);
    }
  });

  it('strict-reopens provider evidence and binds its data-control/pricing hashes', async () => {
    const catalog = Object.freeze({
      ...binding,
      bindingId: '11111111-1111-4111-8111-111111111111',
      embeddingSource: 'provider' as const,
      embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
      chunkChecksumById: new Map(),
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
      'serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:4307/',
    ])).toEqual({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307/', fixtureScenario: 'success',
    });
    expect(parseServeFixtureArguments([
      'serve-fixture', '--host', '::1', '--port', '4308', '--public-origin', 'http://[::1]:4308/',
      '--fixture-scenario', 'slow-sql',
    ])).toEqual({
      host: '::1', port: 4308, publicOrigin: 'http://[::1]:4308/', fixtureScenario: 'slow-sql',
    });
    for (const argv of [
      ['serve-fixture'],
      ['serve-fixture', '--host=0.0.0.0', '--port=4307', '--public-origin=http://127.0.0.1:4307/'],
      ['serve-fixture', '--host=127.0.0.1', '--port=4307', '--public-origin=http://127.0.0.1:9999/'],
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
        return { signal: (signal) => { events.push(`server.signal:${signal}`); }, wait: Promise.resolve() };
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
    const h = fixtureDependencies();
    await runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307/', fixtureScenario: 'insufficient-evidence',
    }, h.dependencies);
    expect(h.events).toEqual([
      'database.start',
      'release.verify',
      'migration.apply',
      'fixture.index',
      'server.start:http://127.0.0.1:4307/:insufficient-evidence',
      'readiness.poll',
      'database.stop',
    ]);
  });

  it('rejects provider keys before database startup and cleans after startup failure', async () => {
    const provider = fixtureDependencies({ env: { OPENAI_API_KEY: 'forbidden' } });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307/', fixtureScenario: 'success',
    }, provider.dependencies)).rejects.toThrow(/provider key/u);
    expect(provider.events).toEqual([]);

    const failed = fixtureDependencies({ async migrate() { throw new Error('migration failed'); } });
    await expect(runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307/', fixtureScenario: 'success',
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
          signal(value) { h.events.push(`server.signal:${value}`); finishServer(); },
          wait: new Promise<void>((resolve) => { finishServer = resolve; }),
        };
      },
      onSignal(next) { handler = next; return () => { h.events.push('signals.remove'); }; },
    });
    const running = runServeFixtureHarness({
      host: '127.0.0.1', port: 4307, publicOrigin: 'http://127.0.0.1:4307/', fixtureScenario: 'success',
    }, h.dependencies);
    while (!handler) await Promise.resolve();
    handler(signal);
    await running;
    expect(h.events.slice(-3)).toEqual([`server.signal:${signal}`, 'signals.remove', 'database.stop']);
  });
});
