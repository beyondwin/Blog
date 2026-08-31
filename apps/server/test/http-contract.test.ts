import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerConfig } from '../src/config/server-config.js';
import { RuntimeReadiness } from '../src/health/runtime-readiness.js';
import {
  createApplication,
  createFixtureScenarioExecutor,
  type ApplicationRuntimeOverrides,
} from '../src/main.js';
import type { AnswerReleaseCatalogSnapshot } from '../src/modules/public-answer/application/ports/answer-release-catalog.js';
import type { AnswerPublicQuestionCommand, PublicAnswerOutcome } from '../src/modules/public-answer/domain/public-answer.js';
import { TrustedProxyNetworkKey } from '../src/security/network-key.js';
import { AnswerPublicQuestion } from '../src/modules/public-answer/application/answer-public-question.js';
import { InMemoryRedactedEventSink } from '../src/modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';
import { InMemoryUsageGuard } from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';

const CONTENT_RELEASE = '1'.repeat(64);
const ANSWER_RELEASE = '2'.repeat(64);
const EVIDENCE_ID = '3'.repeat(64);
const CHUNK_ID = '4'.repeat(64);
const RECORD_ID = 'articles/verified-record';
const PATH = '/articles/verified-record/';

const snapshot: AnswerReleaseCatalogSnapshot = Object.freeze({
  bindingId: randomUUID(),
  contentReleaseId: CONTENT_RELEASE,
  answerReleaseId: ANSWER_RELEASE,
  corpusApprovalHash: `sha256:${'5'.repeat(64)}`,
  chunkCount: 1,
  isBoundTo(contentReleaseId: string, answerReleaseId: string) {
    return contentReleaseId === CONTENT_RELEASE && answerReleaseId === ANSWER_RELEASE;
  },
  evidenceFor(ids: readonly string[]) {
    return ids.includes(EVIDENCE_ID) ? [Object.freeze({
      evidenceId: EVIDENCE_ID,
      chunkId: CHUNK_ID,
      answerReleaseId: ANSWER_RELEASE,
      recordId: RECORD_ID,
      collectionLabel: '기록',
      recordTitle: '검증된 기록',
      canonicalPath: PATH,
      locator: Object.freeze({ kind: 'heading-paragraph' as const, label: '근거', ordinal: 1 }),
      excerpt: '검증 가능한 공개 근거입니다.',
      excerptChecksum: `sha256:${'6'.repeat(64)}`,
    })] : [];
  },
  hasAuthorizedEvidenceLocation() { return true; },
});

const answer: PublicAnswerOutcome = Object.freeze({
  kind: 'answer',
  answerReleaseId: ANSWER_RELEASE,
  claims: Object.freeze([{ claimId: 'claim-1', text: '검증된 답변입니다.', evidenceIds: Object.freeze([EVIDENCE_ID]) }]),
  evidence: snapshot.evidenceFor([EVIDENCE_ID]),
});

const config: Readonly<ServerConfig> = Object.freeze({
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  publicAskMode: 'fixture',
  replicaCount: 1,
  databaseUrl: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
  contentReleaseRoot: '/tmp/content',
  answerReleaseRoot: '/tmp/answer',
  corpusApprovalPath: '/tmp/approval.json',
  trustedProxyAddresses: Object.freeze([]),
  networkHmacSecret: 'test-secret-at-least-32-characters',
  publicOrigin: 'http://127.0.0.1:4307/',
  edgeReachabilityReceiptPath: null,
  openAiApiKey: null,
  providerDataControlReceiptPath: null,
  providerEmbeddingReceiptRoot: null,
  deletionReceiptRoot: null,
  fixtureScenario: 'success',
});

const apps: Awaited<ReturnType<typeof createApplication>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function harness(outcome: PublicAnswerOutcome | Error = answer) {
  const commands: AnswerPublicQuestionCommand[] = [];
  let snapshots = 0;
  const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
  await readiness.initialize();
  const runtime: ApplicationRuntimeOverrides = {
    config,
    readiness,
    catalogSource: {
      async snapshot() {
        snapshots += 1;
        return snapshot;
      },
    },
    answerPublicQuestion: {
      async execute(command) {
        commands.push(command);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
    networkKey: new TrustedProxyNetworkKey({
      masterSecret: config.networkHmacSecret,
      trustedProxyAddresses: config.trustedProxyAddresses,
    }),
  };
  const app = await createApplication({ runtime });
  apps.push(app);
  await app.init();
  return { fastify: app.getHttpAdapter().getInstance(), commands, snapshots: () => snapshots };
}

function requestPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    question: '이 기록의 핵심은 무엇인가요?',
    contentReleaseId: CONTENT_RELEASE,
    answerReleaseId: ANSWER_RELEASE,
    ...overrides,
  };
}

function byteSizedInvalidJson(size: number): string {
  const prefix = JSON.stringify({ ...requestPayload(), unknown: '' });
  const emptyBytes = Buffer.byteLength(prefix);
  const closingQuote = prefix.lastIndexOf('"');
  return `${prefix.slice(0, closingQuote)}${'x'.repeat(size - emptyBytes)}${prefix.slice(closingQuote)}`;
}

describe('public answer HTTP contract', () => {
  it.each([
    ['provider-disabled', { kind: 'search', reason: 'provider-disabled', answerReleaseId: ANSWER_RELEASE }],
    ['insufficient-evidence', { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: ANSWER_RELEASE }],
    ['unavailable', { kind: 'error', code: 'unavailable', retryable: true }],
    ['timeout', { kind: 'error', code: 'timeout', retryable: true }],
    ['release-mismatch', { kind: 'search', reason: 'release-mismatch', answerReleaseId: ANSWER_RELEASE }],
  ] as const)('maps the internal %s fixture factory to one typed application outcome', async (scenario, expected) => {
    let baseCalls = 0;
    const executor = createFixtureScenarioExecutor(scenario, {
      async execute() { baseCalls += 1; return answer; },
    }, async () => { throw new Error('slow SQL is not expected'); });
    const outcome = await executor.execute({
      requestId: randomUUID(), question: '질문', contentReleaseId: CONTENT_RELEASE, answerReleaseId: ANSWER_RELEASE,
      networkKey: 'network', signal: new AbortController().signal, deadlineAt: performance.now() + 12_000, catalog: snapshot,
    });
    expect(outcome).toEqual(expected);
    expect(baseCalls).toBe(0);
  });

  it('delegates success and makes slow-sql the only scenario that executes the slow query hook', async () => {
    let baseCalls = 0;
    let slowCalls = 0;
    const base = { async execute() { baseCalls += 1; return answer; } };
    const slow = async () => { slowCalls += 1; };
    await expect(createFixtureScenarioExecutor('success', base, slow).execute({
      requestId: randomUUID(), question: '질문', contentReleaseId: CONTENT_RELEASE, answerReleaseId: ANSWER_RELEASE,
      networkKey: 'network', signal: new AbortController().signal, deadlineAt: performance.now() + 12_000, catalog: snapshot,
    })).resolves.toBe(answer);
    await expect(createFixtureScenarioExecutor('slow-sql', base, slow).execute({
      requestId: randomUUID(), question: '질문', contentReleaseId: CONTENT_RELEASE, answerReleaseId: ANSWER_RELEASE,
      networkKey: 'network', signal: new AbortController().signal, deadlineAt: performance.now() + 12_000, catalog: snapshot,
    })).resolves.toEqual({ kind: 'search', reason: 'insufficient-evidence', answerReleaseId: ANSWER_RELEASE });
    expect({ baseCalls, slowCalls }).toEqual({ baseCalls: 1, slowCalls: 1 });
  });

  it.each([
    ['answer', answer, 200, undefined],
    ['insufficient evidence', { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: ANSWER_RELEASE }, 200, undefined],
    ['unsupported question', { kind: 'search', reason: 'unsupported-question', answerReleaseId: ANSWER_RELEASE }, 200, undefined],
    ['provider disabled', { kind: 'search', reason: 'provider-disabled', answerReleaseId: ANSWER_RELEASE }, 200, undefined],
    ['release mismatch', { kind: 'search', reason: 'release-mismatch', answerReleaseId: ANSWER_RELEASE }, 409, undefined],
    ['rate limited', { kind: 'error', code: 'rate-limited', retryable: true }, 429, '20'],
    ['timeout', { kind: 'error', code: 'timeout', retryable: true }, 503, undefined],
    ['unavailable', { kind: 'error', code: 'unavailable', retryable: true }, 503, undefined],
    ['invalid provider output', { kind: 'error', code: 'invalid-response', retryable: false }, 503, undefined],
  ] as const)('maps %s to its bounded response', async (_label, outcome, status, retryAfter) => {
    const h = await harness(outcome as PublicAnswerOutcome);
    const response = await h.fastify.inject({
      method: 'POST',
      url: '/api/public/ask',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: JSON.stringify(requestPayload()),
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject(outcome.kind === 'answer'
      ? { kind: 'answer', answerReleaseId: ANSWER_RELEASE }
      : outcome.kind === 'search' ? { kind: 'search', reason: outcome.reason } : outcome);
    expect(response.headers['retry-after']).toBe(retryAfter);
    expect(response.headers['x-content-release-id']).toBe(CONTENT_RELEASE);
    expect(response.headers['x-answer-release-id']).toBe(ANSWER_RELEASE);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers).not.toHaveProperty('x-powered-by');
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('maps claim IDs and strips the internal evidence release field before schema-checked serialization', async () => {
    const h = await harness();
    const response = await h.fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() });

    expect(response.json()).toEqual({
      kind: 'answer',
      answerReleaseId: ANSWER_RELEASE,
      claims: [{ id: 'claim-1', text: '검증된 답변입니다.', evidenceIds: [EVIDENCE_ID] }],
      evidence: [{
        evidenceId: EVIDENCE_ID,
        chunkId: CHUNK_ID,
        recordId: RECORD_ID,
        collectionLabel: '기록',
        recordTitle: '검증된 기록',
        canonicalPath: PATH,
        locator: { kind: 'heading-paragraph', label: '근거', ordinal: 1 },
        excerpt: '검증 가능한 공개 근거입니다.',
        excerptChecksum: `sha256:${'6'.repeat(64)}`,
      }],
    });
  });

  it.each([
    ['application/json', 200],
    ['application/json; charset=utf-8', 200],
    ['application/json;charset=UTF-8', 200],
    ['application/json; charset=latin1', 415],
    ['text/plain', 415],
  ])('enforces the UTF-8 JSON media contract for %s', async (contentType, status) => {
    const h = await harness({ kind: 'search', reason: 'unsupported-question', answerReleaseId: ANSWER_RELEASE });
    const response = await h.fastify.inject({
      method: 'POST', url: '/api/public/ask', headers: { 'content-type': contentType }, payload: JSON.stringify(requestPayload()),
    });
    expect(response.statusCode).toBe(status);
    if (status !== 200) expect(response.json()).toEqual({ kind: 'error', code: 'invalid-response', retryable: false });
  });

  it('bounds malformed JSON, schema failures, byte limits, and Unicode code-point limits', async () => {
    const h = await harness({ kind: 'search', reason: 'unsupported-question', answerReleaseId: ANSWER_RELEASE });
    const cases = [
      [{ method: 'POST', url: '/api/public/ask', headers: { 'content-type': 'application/json' }, payload: '{' }, 400],
      [{ method: 'POST', url: '/api/public/ask', payload: requestPayload({ question: '' }) }, 422],
      [{ method: 'POST', url: '/api/public/ask', headers: { 'content-type': 'application/json' }, payload: byteSizedInvalidJson(4096) }, 422],
      [{ method: 'POST', url: '/api/public/ask', headers: { 'content-type': 'application/json' }, payload: byteSizedInvalidJson(4097) }, 413],
      [{ method: 'POST', url: '/api/public/ask', payload: requestPayload({ question: '가'.repeat(500) }) }, 200],
      [{ method: 'POST', url: '/api/public/ask', payload: requestPayload({ question: '가'.repeat(501) }) }, 422],
    ] as const;
    for (const [request, status] of cases) {
      const response = await h.fastify.inject(request);
      expect(response.statusCode).toBe(status);
      if (status !== 200) expect(response.json()).toEqual({ kind: 'error', code: 'invalid-response', retryable: false });
    }
  });

  it.each([
    ['non-browser', {}, 200],
    ['same origin', { origin: config.publicOrigin!, 'sec-fetch-site': 'same-origin' }, 200],
    ['origin only', { origin: config.publicOrigin! }, 400],
    ['fetch-site only', { 'sec-fetch-site': 'same-origin' }, 400],
    ['cross origin', { origin: 'http://127.0.0.1:9999/', 'sec-fetch-site': 'cross-site' }, 400],
    ['mismatched fetch site', { origin: config.publicOrigin!, 'sec-fetch-site': 'same-site' }, 400],
  ])('applies the browser-origin gate for %s', async (_label, headers, status) => {
    const h = await harness({ kind: 'search', reason: 'unsupported-question', answerReleaseId: ANSWER_RELEASE });
    const response = await h.fastify.inject({ method: 'POST', url: '/api/public/ask', headers, payload: requestPayload() });
    expect(response.statusCode).toBe(status);
  });

  it('uses one server snapshot and one internal request ID while ignoring hostile client IDs', async () => {
    const h = await harness({ kind: 'search', reason: 'release-mismatch', answerReleaseId: ANSWER_RELEASE });
    const response = await h.fastify.inject({
      method: 'POST',
      url: '/api/public/ask',
      headers: { 'x-request-id': 'attacker-request-id' },
      payload: requestPayload({ contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64) }),
    });

    expect(response.statusCode).toBe(409);
    expect(h.snapshots()).toBe(1);
    expect(h.commands).toHaveLength(1);
    expect(h.commands[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(h.commands[0]!.requestId).not.toBe('attacker-request-id');
    expect(h.commands[0]!.catalog).toBe(snapshot);
    expect(response.headers['x-content-release-id']).toBe(CONTENT_RELEASE);
    expect(response.headers['x-answer-release-id']).toBe(ANSWER_RELEASE);
    expect(response.body).not.toContain('attacker-request-id');
    expect(response.body).not.toContain('a'.repeat(64));
  });

  it('turns an unexpected exception into a message-free unavailable envelope', async () => {
    const h = await harness(new Error('secret@example.com SELECT private_table'));
    const response = await h.fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ kind: 'error', code: 'unavailable', retryable: true });
    expect(response.body).not.toMatch(/secret@example\.com|private_table|stack/iu);
  });

  it('exposes only the exact three method-route combinations and disables automatic HEAD routes', async () => {
    const h = await harness();
    for (const [method, url] of [
      ['HEAD', '/health/live'],
      ['HEAD', '/health/ready'],
      ['GET', '/api/public/ask'],
      ['POST', '/health/live'],
      ['POST', '/health/ready'],
      ['GET', '/api/public/missing'],
    ] as const) {
      const response = await h.fastify.inject({ method, url });
      expect(response.statusCode).not.toBe(200);
    }
  });

  it('keeps post-snapshot error headers request-local across a paused active-binding transition and fails readiness closed', async () => {
    const oldSnapshot = snapshot;
    const newSnapshot = Object.freeze({
      ...snapshot,
      bindingId: randomUUID(),
      contentReleaseId: 'a'.repeat(64),
      answerReleaseId: 'b'.repeat(64),
    });
    let snapshotCalls = 0;
    let firstEntered!: () => void;
    let releaseFirst!: () => void;
    const firstSnapshotEntered = new Promise<void>((resolve) => { firstEntered = resolve; });
    const firstSnapshotRelease = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const readiness = new RuntimeReadiness({ startupCheck: async () => oldSnapshot });
    await readiness.initialize();
    const app = await createApplication({ runtime: {
      config,
      readiness,
      catalogSource: {
        async snapshot() {
          snapshotCalls += 1;
          if (snapshotCalls === 1) { firstEntered(); await firstSnapshotRelease; return oldSnapshot; }
          return newSnapshot;
        },
      },
      answerPublicQuestion: { async execute() { throw new Error('binding authority changed'); } },
    } });
    apps.push(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    const first = fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() });
    await firstSnapshotEntered;
    const second = await fastify.inject({
      method: 'POST', url: '/api/public/ask',
      payload: requestPayload({ contentReleaseId: newSnapshot.contentReleaseId, answerReleaseId: newSnapshot.answerReleaseId }),
    });
    releaseFirst();
    const firstResponse = await first;

    expect(firstResponse.headers['x-content-release-id']).toBe(oldSnapshot.contentReleaseId);
    expect(firstResponse.headers['x-answer-release-id']).toBe(oldSnapshot.answerReleaseId);
    expect(second.headers['x-content-release-id']).toBe(newSnapshot.contentReleaseId);
    expect(second.headers['x-answer-release-id']).toBe(newSnapshot.answerReleaseId);
    expect(snapshotCalls).toBe(2);
    expect(readiness.status().ready).toBe(false);
  });

  it('turns readiness false after a request-time catalog authority failure', async () => {
    const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
    await readiness.initialize();
    const app = await createApplication({ runtime: {
      config,
      readiness,
      catalogSource: { async snapshot() { throw new Error('filesystem release and active binding mismatch'); } },
      answerPublicQuestion: { async execute() { throw new Error('dispatch must not run'); } },
    } });
    apps.push(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    expect((await fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() })).statusCode).toBe(503);
    expect((await fastify.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(503);
  });

  it('passes one absolute monotonic deadline through catalog and command dispatch', async () => {
    let catalogDeadline: number | undefined;
    let commandDeadline: number | undefined;
    const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
    await readiness.initialize();
    const app = await createApplication({ runtime: {
      config,
      readiness,
      catalogSource: {
        async snapshot(_signal, deadlineAt) { catalogDeadline = deadlineAt; return snapshot; },
      },
      answerPublicQuestion: {
        async execute(command) {
          commandDeadline = command.deadlineAt;
          return { kind: 'search', reason: 'insufficient-evidence', answerReleaseId: ANSWER_RELEASE };
        },
      },
    } });
    apps.push(app);
    await app.init();
    const before = performance.now();
    const response = await app.getHttpAdapter().getInstance().inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() });
    expect(response.statusCode).toBe(200);
    expect(catalogDeadline).toBeGreaterThanOrEqual(before + 11_900);
    expect(commandDeadline).toBe(catalogDeadline);
  });

  it('settles an abort-ignoring dispatch at twelve seconds and absorbs its late rejection', async () => {
    let rejectLate!: (error: Error) => void;
    const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
    await readiness.initialize();
    const app = await createApplication({ runtime: {
      config,
      readiness,
      catalogSource: { async snapshot() { return snapshot; } },
      answerPublicQuestion: {
        execute() { return new Promise((_resolve, reject) => { rejectLate = reject; }); },
      },
    } });
    apps.push(app);
    await app.init();
    const unhandled: unknown[] = [];
    const observeUnhandled = (error: unknown) => { unhandled.push(error); };
    process.on('unhandledRejection', observeUnhandled);
    vi.useFakeTimers();
    try {
      const pending = app.getHttpAdapter().getInstance().inject({
        method: 'POST', url: '/api/public/ask', payload: requestPayload(),
      });
      await vi.advanceTimersByTimeAsync(12_000);
      const response = await pending;
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ kind: 'error', code: 'timeout', retryable: true });
      expect(readiness.status().ready).toBe(true);
      rejectLate(new Error('late provider rejection'));
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).toEqual([]);
    } finally {
      vi.useRealTimers();
      process.removeListener('unhandledRejection', observeUnhandled);
    }
  });

  it('uses the real guard at the composed HTTP boundary and returns Retry-After on the fourth burst request', async () => {
    const guard = await InMemoryUsageGuard.create({ clock: () => Date.parse('2026-08-30T00:00:00.000Z') });
    const useCase = new AnswerPublicQuestion({
      policy: { mode: 'fixture' },
      usageGuard: guard,
      retriever: { async retrieve() { return { evidence: [], sufficient: false, candidateCount: 0, usage: { inputTokens: 0, outputTokens: 0 } }; } },
      generator: { async generate() { throw new Error('generation is unreachable'); } },
      deterministicVerifier: { verify() { throw new Error('verification is unreachable'); } },
      semanticVerifier: { async verify() { throw new Error('semantic verification is unreachable'); } },
      eventSink: new InMemoryRedactedEventSink(),
    });
    const readiness = new RuntimeReadiness({ startupCheck: async () => snapshot });
    await readiness.initialize();
    const app = await createApplication({ runtime: {
      config,
      readiness,
      catalogSource: { async snapshot() { return snapshot; } },
      answerPublicQuestion: useCase,
    } });
    apps.push(app);
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      statuses.push((await fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    const rejected = await fastify.inject({ method: 'POST', url: '/api/public/ask', payload: requestPayload() });
    expect(rejected.headers['retry-after']).toBe('20');
  });

  it('rejects public fixture scenario query, header, and cookie controls before dispatch', async () => {
    const h = await harness(answer);
    for (const request of [
      { url: '/api/public/ask?fixture-scenario=unavailable', headers: {} },
      { url: '/api/public/ask', headers: { 'x-fixture-scenario': 'timeout' } },
      { url: '/api/public/ask', headers: { cookie: 'fixture-scenario=release-mismatch' } },
    ]) {
      const response = await h.fastify.inject({ method: 'POST', ...request, payload: requestPayload() });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ kind: 'error', code: 'invalid-response', retryable: false });
    }
    expect(h.commands).toEqual([]);
  });
});
