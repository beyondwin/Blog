import { describe, expect, it } from 'vitest';

import { InMemoryUsageGuard } from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { InMemoryRedactedEventSink } from '../src/modules/public-answer/infrastructure/fixture/in-memory-redacted-event-sink.js';
import { redactPublicAnswerEvent } from '../src/modules/public-answer/infrastructure/telemetry/redacted-events.js';

describe('public-answer privacy contract', () => {
  it.each([
    [0, '<250ms'], [249, '<250ms'], [250, '250-999ms'], [999, '250-999ms'],
    [1_000, '1-2.999s'], [2_999, '1-2.999s'], [3_000, '3-7.999s'], [7_999, '3-7.999s'],
    [8_000, '8-12s'], [12_000, '8-12s'],
  ] as const)('buckets %d milliseconds as %s', (latencyMs, expected) => {
    expect(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }).latencyBucket).toBe(expected);
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

  it('retains only exact telemetry buckets and never copies raw anonymous or provider material', async () => {
    const sentinels = ['question-secret', 'claim-secret', 'excerpt-secret', 'https://private.invalid/path', '/Users/example/private', '192.0.2.99', 'network-key-secret'];
    const input = {
      occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'request-1', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64),
      resultKind: 'answer', errorKind: null, latencyMs: 3_000, retrievedCount: 6,
      providerInputTokens: 6_001, providerOutputTokens: 500, rateBucket: 'admitted',
      question: sentinels[0], claim: sentinels[1], excerpt: sentinels[2], url: sentinels[3], path: sentinels[4],
      address: sentinels[5], networkKey: sentinels[6],
    } as const;
    const event = redactPublicAnswerEvent(input);
    expect(event).toEqual({
      occurredAt: input.occurredAt, expiresAt: '2026-09-06T00:00:00.000Z', requestId: 'request-1',
      contentReleasePrefix: 'cccccccccccc', answerReleasePrefix: 'aaaaaaaaaaaa', resultKind: 'answer', errorKind: null,
      latencyBucket: '3-7.999s', retrievedCount: 6, providerInputBucket: 'over-budget',
      providerOutputBucket: '1-999', rateBucket: 'admitted',
    });
    const sink = new InMemoryRedactedEventSink(); await sink.record(event);
    await sink.record({ ...event, question: 'question-secret' } as never);
    const serialized = JSON.stringify({ event, stored: sink.events() });
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
  });

  it('serializes no raw address, network key, request id, or abort detail from usage state and errors', async () => {
    const sentinels = ['network-key-sentinel', 'request-id-sentinel', 'raw-address-sentinel', 'question-sentinel'];
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: sentinels[0], requestId: sentinels[1], signal: new AbortController().signal });
    lease.beginStage('embedding'); lease.release();
    const serialized = JSON.stringify(guard);
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
    try { lease.settleStage('embedding', { inputTokens: -1, outputTokens: 0 }); } catch (error) {
      for (const sentinel of sentinels) expect(JSON.stringify(error)).not.toContain(sentinel);
    }
  });
});
