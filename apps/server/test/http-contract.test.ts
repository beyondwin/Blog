import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

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
      networkKey: 'network', signal: new AbortController().signal, catalog: snapshot,
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
      networkKey: 'network', signal: new AbortController().signal, catalog: snapshot,
    })).resolves.toBe(answer);
    await expect(createFixtureScenarioExecutor('slow-sql', base, slow).execute({
      requestId: randomUUID(), question: '질문', contentReleaseId: CONTENT_RELEASE, answerReleaseId: ANSWER_RELEASE,
      networkKey: 'network', signal: new AbortController().signal, catalog: snapshot,
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
});
