import { describe, expect, it } from 'vitest';

import { InMemoryUsageGuard } from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { FifoSemaphore } from '../src/modules/public-answer/infrastructure/guards/fifo-semaphore.js';
import { InMemoryRedactedEventSink } from '../src/modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';
import { copyRedactedPublicAnswerEvent, redactPublicAnswerEvent } from '../src/modules/public-answer/infrastructure/telemetry/redacted-events.js';
import { TrustedProxyNetworkKey } from '../src/security/network-key.js';

function errorSurface(error: unknown): string {
  if (!(error instanceof Error)) return JSON.stringify(error);
  return JSON.stringify({ name: error.name, message: error.message, cause: error.cause === undefined ? null : errorSurface(error.cause),
    own: Object.fromEntries(Reflect.ownKeys(error).map((key) => [String(key), String(Reflect.get(error, key))])) });
}

describe('public-answer privacy contract', () => {
  it.each([
    [0, '<250ms'], [249, '<250ms'], [250, '250-999ms'], [999, '250-999ms'],
    [1_000, '1-2.999s'], [2_999, '1-2.999s'], [3_000, '3-7.999s'], [7_999, '3-7.999s'],
    [8_000, '8-12s'], [12_000, '8-12s'],
  ] as const)('buckets %d milliseconds as %s', (latencyMs, expected) => {
    expect(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }).latencyBucket).toBe(expected);
  });

  it('keeps direct over-ceiling external measurement input fail-closed', () => {
    expect(() => redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'timeout', errorKind: 'deadline', latencyMs: 12_001, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' })).toThrow('telemetry event is invalid');
  });

  it.each([
    [0, '0'], [1, '1-999'], [999, '1-999'], [1_000, '1000-1999'], [1_999, '1000-1999'],
    [2_000, '2000-3999'], [3_999, '2000-3999'], [4_000, '4000-6000'], [6_000, '4000-6000'], [6_001, 'over-budget'],
  ] as const)('buckets %d tokens as %s', (providerInputTokens, expected) => {
    expect(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 0, retrievedCount: 0, providerInputTokens, providerOutputTokens: 0, rateBucket: 'admitted' }).providerInputBucket).toBe(expected);
  });

  it('rejects unknown persisted enum values at runtime', () => {
    expect(() => redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 0, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'forged' as never })).toThrow(/telemetry event/u);
  });

  it('rejects every raw field at measurement and persisted-event boundaries without reflection', () => {
    const sentinels = { question: 'question-secret', claim: 'claim-secret', excerpt: 'excerpt-secret',
      url: 'https://private.invalid/path', path: '/Users/example/private', address: '192.0.2.99', networkKey: 'network-key-secret' } as const;
    const input = {
      occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'request-1', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64),
      resultKind: 'answer', errorKind: null, latencyMs: 3_000, retrievedCount: 6,
      providerInputTokens: 6_001, providerOutputTokens: 500, rateBucket: 'admitted',
    } as const;
    const event = redactPublicAnswerEvent(input);
    expect(event).toEqual({
      occurredAt: input.occurredAt, expiresAt: '2026-09-06T00:00:00.000Z', requestId: 'request-1',
      contentReleasePrefix: 'cccccccccccc', answerReleasePrefix: 'aaaaaaaaaaaa', resultKind: 'answer', errorKind: null,
      latencyBucket: '3-7.999s', retrievedCount: 6, providerInputBucket: 'over-budget',
      providerOutputBucket: '1-999', rateBucket: 'admitted',
    });
    const sink = new InMemoryRedactedEventSink(); sink.record(event);
    for (const [field, sentinel] of Object.entries(sentinels)) {
      for (const operation of [
        () => redactPublicAnswerEvent({ ...input, [field]: sentinel } as never),
        () => copyRedactedPublicAnswerEvent({ ...event, [field]: sentinel } as never),
        () => sink.record({ ...event, [field]: sentinel } as never),
      ]) {
        let caught: unknown;
        try { operation(); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(Error);
        expect(errorSurface(caught)).not.toContain(sentinel);
      }
    }
    expect(sink.events()).toEqual([event]);
  });

  it('keeps meaningful operational snapshots and every local rejection surface free of supplied sentinels', async () => {
    const sentinels = ['question-sentinel', 'claim-sentinel', 'excerpt-sentinel', 'https://url-sentinel.invalid/',
      '/Users/example/path-sentinel', 'raw-address-sentinel', 'network-key-sentinel'];
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: sentinels[6]!, requestId: 'request-safe', signal: new AbortController().signal });
    lease.beginStage('embedding'); lease.release();
    const semaphore = new FifoSemaphore({ running: 1, queued: 0, waitMs: 2_000 });
    const permit = await semaphore.acquire(new AbortController().signal);
    const keys = new TrustedProxyNetworkKey({ masterSecret: 'safe-secret-at-least-32-characters', trustedProxyAddresses: [], clock: () => 0 });
    const snapshots = JSON.stringify([guard.operationalSnapshot(), semaphore.operationalSnapshot(), keys.operationalSnapshot()]);
    const errors: unknown[] = [];
    try { lease.settleStage('embedding', { inputTokens: -1, outputTokens: 0 }); } catch (error) { errors.push(error); }
    try { await semaphore.acquire(new AbortController().signal); } catch (error) { errors.push(error); }
    try { keys.derive({ peerAddress: sentinels[5]! }); } catch (error) { errors.push(error); }
    for (let index = 0; index < 2; index += 1) (await guard.acquire({ networkKey: sentinels[6]!, requestId: `safe-${index}`, signal: new AbortController().signal })).release();
    try { await guard.acquire({ networkKey: sentinels[6]!, requestId: 'safe-rejected', signal: new AbortController().signal }); } catch (error) { errors.push(error); }
    const ordering = await (await InMemoryUsageGuard.create()).acquire({ networkKey: 'safe-network', requestId: 'safe', signal: new AbortController().signal });
    try { ordering.settleStage('generation', { inputTokens: 1, outputTokens: 0 }); } catch (error) { errors.push(error); }
    ordering.beginStage('generation');
    try { ordering.beginStage('generation'); } catch (error) { errors.push(error); }
    try { ordering.settleStage('generation', { inputTokens: -1, outputTokens: 0 }); } catch (error) { errors.push(error); }
    ordering.settleStage('generation', { inputTokens: 1, outputTokens: 0 });
    try { ordering.settleStage('generation', { inputTokens: 1, outputTokens: 0 }); } catch (error) { errors.push(error); }
    ordering.release();
    try { ordering.beginStage('semantic'); } catch (error) { errors.push(error); }
    permit.release();
    for (const sentinel of sentinels) {
      expect(snapshots).not.toContain(sentinel);
      for (const error of errors) expect(errorSurface(error)).not.toContain(sentinel);
    }
  });
});
