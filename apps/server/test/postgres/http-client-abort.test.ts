import { request as httpRequest } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

import type { ServerConfig } from '../../src/config/server-config.js';
import { RuntimeReadiness } from '../../src/health/runtime-readiness.js';
import { RuntimeLifecycle } from '../../src/lifecycle/runtime-lifecycle.js';
import { createApplication } from '../../src/main.js';
import type { AnswerReleaseCatalogSnapshot } from '../../src/modules/public-answer/application/ports/answer-release-catalog.js';
import { CancellablePgQueryRunner } from '../../src/modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { createPostgresPool } from '../../src/modules/public-answer/infrastructure/postgres/postgres-pool.js';
import { TrustedProxyNetworkKey } from '../../src/security/network-key.js';

const CONTENT_RELEASE = '1'.repeat(64);
const ANSWER_RELEASE = '2'.repeat(64);
const resources: Array<{ app?: Awaited<ReturnType<typeof createApplication>>; pool: Pool }> = [];

afterEach(async () => {
  await Promise.all(resources.splice(0).map(async ({ app, pool }) => {
    await app?.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }));
});

describe('real HTTP client abort', () => {
  it('cancels pg_sleep through the separate control connection and leaves the pool reusable', async () => {
    const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
    const pool = createPostgresPool(databaseUrl);
    const resource: { app?: Awaited<ReturnType<typeof createApplication>>; pool: Pool } = { pool };
    resources.push(resource);
    const queries = new CancellablePgQueryRunner(pool);
    const snapshot: AnswerReleaseCatalogSnapshot = Object.freeze({
      bindingId: '11111111-1111-4111-8111-111111111111',
      contentReleaseId: CONTENT_RELEASE,
      answerReleaseId: ANSWER_RELEASE,
      corpusApprovalHash: `sha256:${'3'.repeat(64)}`,
      chunkCount: 1,
      isBoundTo: (content: string, answer: string) => content === CONTENT_RELEASE && answer === ANSWER_RELEASE,
      evidenceFor: () => [],
      hasAuthorizedEvidenceLocation: () => false,
    });
    const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
    await readiness.initialize();
    let app: Awaited<ReturnType<typeof createApplication>> | undefined;
    const lifecycle = new RuntimeLifecycle({
      readiness,
      closeServer: async () => { if (app) await app.close(); },
      closePool: async () => undefined,
    });
    const config = Object.freeze({
      nodeEnv: 'test', host: '127.0.0.1', port: 3000, publicAskMode: 'fixture', replicaCount: 1,
      databaseUrl, contentReleaseRoot: '/tmp/content', answerReleaseRoot: '/tmp/answer',
      corpusApprovalPath: '/tmp/approval', trustedProxyAddresses: Object.freeze([]),
      networkHmacSecret: 'abort-proof-secret-at-least-32-characters', publicOrigin: null,
      edgeReachabilityReceiptPath: null, openAiApiKey: null, providerDataControlReceiptPath: null,
      providerEmbeddingReceiptRoot: null, deletionReceiptRoot: null, fixtureScenario: 'slow-sql',
      providerAuthority: null,
    }) satisfies Readonly<ServerConfig>;
    let queryStarted!: () => void;
    const started = new Promise<void>((resolve) => { queryStarted = resolve; });
    let observedSignal: AbortSignal | undefined;
    app = await createApplication({ runtime: {
      config,
      readiness,
      lifecycle,
      catalogSource: { async snapshot() { return snapshot; } },
      answerPublicQuestion: {
        async execute(command) {
          observedSignal = command.signal;
          queryStarted();
          await queries.query('SELECT pg_sleep(30)', [], command.signal, command.deadlineAt);
          return { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: ANSWER_RELEASE };
        },
      },
      networkKey: new TrustedProxyNetworkKey({
        masterSecret: config.networkHmacSecret,
        trustedProxyAddresses: [],
      }),
    } });
    resource.app = app;
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('test server address is unavailable');
    const body = JSON.stringify({
      version: 1,
      question: '느린 질의를 중단할 수 있나요?',
      contentReleaseId: CONTENT_RELEASE,
      answerReleaseId: ANSWER_RELEASE,
    });
    const client = httpRequest({
      host: '127.0.0.1',
      port: address.port,
      path: '/api/public/ask',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    });
    client.on('error', () => undefined);
    client.end(body);
    await started;
    client.destroy();

    for (let attempt = 0; attempt < 100 && !observedSignal?.aborted; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(observedSignal?.aborted).toBe(true);
    let sleeping = 1;
    for (let attempt = 0; attempt < 100 && sleeping > 0; attempt += 1) {
      const result = await pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM pg_stat_activity
        WHERE datname=current_database() AND query LIKE 'SELECT pg_sleep(30)%' AND state='active'
      `);
      sleeping = Number(result.rows[0]!.count);
      if (sleeping > 0) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(sleeping).toBe(0);
    await expect(pool.query('SELECT 1 AS recovered')).resolves.toMatchObject({ rows: [{ recovered: 1 }] });
  }, 20_000);
});
