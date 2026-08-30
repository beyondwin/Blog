export type RedactedLatencyBucket = '<250ms' | '250-999ms' | '1-2.999s' | '3-7.999s' | '8-12s';
export type RedactedTokenBucket = '0' | '1-999' | '1000-1999' | '2000-3999' | '4000-6000' | 'over-budget';
export type RedactedRateBucket = 'admitted' | 'network-burst' | 'network-hour' | 'network-day' | 'global-day' | 'concurrency';

const RESULT_KINDS = new Set([
  'answer', 'insufficient-evidence', 'unsupported-question', 'release-mismatch', 'provider-disabled',
  'rate-limited', 'timeout', 'unavailable', 'invalid-response',
]);
const ERROR_KINDS = new Set(['rate-limit', 'concurrency', 'cost-limit', 'deadline', 'transport', 'invalid-response']);
const LATENCY_BUCKETS = new Set<RedactedLatencyBucket>(['<250ms', '250-999ms', '1-2.999s', '3-7.999s', '8-12s']);
const TOKEN_BUCKETS = new Set<RedactedTokenBucket>(['0', '1-999', '1000-1999', '2000-3999', '4000-6000', 'over-budget']);
const RATE_BUCKETS = new Set<RedactedRateBucket>(['admitted', 'network-burst', 'network-hour', 'network-day', 'global-day', 'concurrency']);

export interface RedactedPublicAnswerEvent {
  readonly occurredAt: string;
  readonly expiresAt: string;
  readonly requestId: string;
  readonly contentReleasePrefix: string;
  readonly answerReleasePrefix: string;
  readonly resultKind: string;
  readonly errorKind: string | null;
  readonly latencyBucket: RedactedLatencyBucket;
  readonly retrievedCount: number;
  readonly providerInputBucket: RedactedTokenBucket;
  readonly providerOutputBucket: RedactedTokenBucket;
  readonly rateBucket: RedactedRateBucket;
}

export interface PublicAnswerEventMeasurements {
  readonly occurredAt: string;
  readonly requestId: string;
  readonly contentReleaseId: string;
  readonly answerReleaseId: string;
  readonly resultKind: string;
  readonly errorKind: string | null;
  readonly latencyMs: number;
  readonly retrievedCount: number;
  readonly providerInputTokens: number;
  readonly providerOutputTokens: number;
  readonly rateBucket: RedactedRateBucket;
}

function latency(value: number): RedactedLatencyBucket {
  if (!Number.isFinite(value) || value < 0 || value > 12_000) throw new Error('telemetry latency is invalid');
  if (value < 250) return '<250ms';
  if (value < 1_000) return '250-999ms';
  if (value < 3_000) return '1-2.999s';
  if (value < 8_000) return '3-7.999s';
  return '8-12s';
}

function tokens(value: number): RedactedTokenBucket {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('telemetry token usage is invalid');
  if (value === 0) return '0';
  if (value < 1_000) return '1-999';
  if (value < 2_000) return '1000-1999';
  if (value < 4_000) return '2000-3999';
  if (value <= 6_000) return '4000-6000';
  return 'over-budget';
}

export function redactPublicAnswerEvent(input: PublicAnswerEventMeasurements): Readonly<RedactedPublicAnswerEvent> {
  const occurred = Date.parse(input.occurredAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.occurredAt) || Number.isNaN(occurred)
    || !input.requestId || input.contentReleaseId.length < 12 || input.answerReleaseId.length < 12
    || !RESULT_KINDS.has(input.resultKind) || (input.errorKind !== null && !ERROR_KINDS.has(input.errorKind))
    || !RATE_BUCKETS.has(input.rateBucket)
    || !Number.isSafeInteger(input.retrievedCount) || input.retrievedCount < 0) throw new Error('telemetry event is invalid');
  return Object.freeze({
    occurredAt: input.occurredAt,
    expiresAt: new Date(occurred + 7 * 86_400_000).toISOString(),
    requestId: input.requestId,
    contentReleasePrefix: input.contentReleaseId.slice(0, 12),
    answerReleasePrefix: input.answerReleaseId.slice(0, 12),
    resultKind: input.resultKind,
    errorKind: input.errorKind,
    latencyBucket: latency(input.latencyMs),
    retrievedCount: input.retrievedCount,
    providerInputBucket: tokens(input.providerInputTokens),
    providerOutputBucket: tokens(input.providerOutputTokens),
    rateBucket: input.rateBucket,
  });
}

export function copyRedactedPublicAnswerEvent(input: RedactedPublicAnswerEvent): Readonly<RedactedPublicAnswerEvent> {
  const occurred = Date.parse(input.occurredAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.occurredAt) || Number.isNaN(occurred)
    || input.expiresAt !== new Date(occurred + 7 * 86_400_000).toISOString()
    || !input.requestId || !/^[a-f0-9]{12}$/u.test(input.contentReleasePrefix)
    || !/^[a-f0-9]{12}$/u.test(input.answerReleasePrefix) || !RESULT_KINDS.has(input.resultKind)
    || (input.errorKind !== null && !ERROR_KINDS.has(input.errorKind)) || !LATENCY_BUCKETS.has(input.latencyBucket)
    || !Number.isSafeInteger(input.retrievedCount) || input.retrievedCount < 0 || input.retrievedCount > 32_767
    || !TOKEN_BUCKETS.has(input.providerInputBucket) || !TOKEN_BUCKETS.has(input.providerOutputBucket)
    || !RATE_BUCKETS.has(input.rateBucket)) throw new Error('redacted telemetry event is invalid');
  return Object.freeze({
    occurredAt: input.occurredAt, expiresAt: input.expiresAt, requestId: input.requestId,
    contentReleasePrefix: input.contentReleasePrefix, answerReleasePrefix: input.answerReleasePrefix,
    resultKind: input.resultKind, errorKind: input.errorKind, latencyBucket: input.latencyBucket,
    retrievedCount: input.retrievedCount, providerInputBucket: input.providerInputBucket,
    providerOutputBucket: input.providerOutputBucket, rateBucket: input.rateBucket,
  });
}
