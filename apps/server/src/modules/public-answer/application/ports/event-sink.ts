import type { PublicAnswerPortErrorKind, PublicAnswerRateLimitBucket } from '../../domain/public-answer-errors.js';

export type PublicAnswerResultKind =
  | 'answer' | 'insufficient-evidence' | 'unsupported-question' | 'release-mismatch' | 'provider-disabled'
  | 'budget-exhausted' | 'rate-limited' | 'timeout' | 'unavailable' | 'invalid-response';
export type PublicAnswerLatencyBucket = '<250ms' | '250-999ms' | '1-2.999s' | '3-7.999s' | '8-12s';
export type PublicAnswerTokenBucket = '0' | '1-999' | '1000-1999' | '2000-3999' | '4000-6000' | 'over-budget';
export type PublicAnswerRateBucket = 'admitted' | PublicAnswerRateLimitBucket | 'concurrency';

export interface PublicAnswerEvent {
  readonly occurredAt: string; readonly expiresAt: string; readonly requestId: string;
  readonly contentReleasePrefix: string; readonly answerReleasePrefix: string;
  readonly resultKind: PublicAnswerResultKind; readonly errorKind: PublicAnswerPortErrorKind | null;
  readonly latencyBucket: PublicAnswerLatencyBucket; readonly retrievedCount: number;
  readonly providerInputBucket: PublicAnswerTokenBucket; readonly providerOutputBucket: PublicAnswerTokenBucket;
  readonly rateBucket: PublicAnswerRateBucket;
}
export interface PublicAnswerEventMeasurements {
  readonly occurredAt: string; readonly requestId: string; readonly contentReleaseId: string;
  readonly answerReleaseId: string; readonly resultKind: PublicAnswerResultKind;
  readonly errorKind: PublicAnswerPortErrorKind | null; readonly latencyMs: number; readonly retrievedCount: number;
  readonly providerInputTokens: number; readonly providerOutputTokens: number; readonly rateBucket: PublicAnswerRateBucket;
}
export interface PublicAnswerEventSink { record(event: PublicAnswerEvent): void; }

const MEASUREMENT_KEYS = ['occurredAt','requestId','contentReleaseId','answerReleaseId','resultKind','errorKind','latencyMs','retrievedCount','providerInputTokens','providerOutputTokens','rateBucket'] as const;
const EVENT_KEYS = ['occurredAt','expiresAt','requestId','contentReleasePrefix','answerReleasePrefix','resultKind','errorKind','latencyBucket','retrievedCount','providerInputBucket','providerOutputBucket','rateBucket'] as const;
const RESULT_KINDS = new Set<PublicAnswerResultKind>(['answer','insufficient-evidence','unsupported-question','release-mismatch','provider-disabled','budget-exhausted','rate-limited','timeout','unavailable','invalid-response']);
const ERROR_KINDS = new Set<PublicAnswerPortErrorKind>(['rate-limit','concurrency','cost-limit','deadline','transport','invalid-response']);
const LATENCY_BUCKETS = new Set<PublicAnswerLatencyBucket>(['<250ms','250-999ms','1-2.999s','3-7.999s','8-12s']);
const TOKEN_BUCKETS = new Set<PublicAnswerTokenBucket>(['0','1-999','1000-1999','2000-3999','4000-6000','over-budget']);
const RATE_BUCKETS = new Set<PublicAnswerRateBucket>(['admitted','network-burst','network-hour','network-day','global-day','concurrency']);

function exactKeys(value: object, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} has invalid fields`);
}
function exactInstant(value: string): number {
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(parsed)) throw new Error('telemetry event is invalid');
  return parsed;
}
function latency(value: number): PublicAnswerLatencyBucket {
  if (!Number.isFinite(value) || value < 0 || value > 12_000) throw new Error('telemetry event is invalid');
  if (value < 250) return '<250ms'; if (value < 1_000) return '250-999ms';
  if (value < 3_000) return '1-2.999s'; if (value < 8_000) return '3-7.999s'; return '8-12s';
}
function tokens(value: number): PublicAnswerTokenBucket {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('telemetry event is invalid');
  if (value === 0) return '0'; if (value < 1_000) return '1-999'; if (value < 2_000) return '1000-1999';
  if (value < 4_000) return '2000-3999'; if (value <= 6_000) return '4000-6000'; return 'over-budget';
}
export function redactPublicAnswerEvent(input: PublicAnswerEventMeasurements): Readonly<PublicAnswerEvent> {
  exactKeys(input, MEASUREMENT_KEYS, 'telemetry measurement'); const occurred = exactInstant(input.occurredAt);
  if (!input.requestId || input.contentReleaseId.length < 12 || input.answerReleaseId.length < 12
    || !RESULT_KINDS.has(input.resultKind) || (input.errorKind !== null && !ERROR_KINDS.has(input.errorKind))
    || !RATE_BUCKETS.has(input.rateBucket) || !Number.isSafeInteger(input.retrievedCount)
    || input.retrievedCount < 0 || input.retrievedCount > 32_767) throw new Error('telemetry event is invalid');
  return Object.freeze({ occurredAt: input.occurredAt, expiresAt: new Date(occurred + 7 * 86_400_000).toISOString(),
    requestId: input.requestId, contentReleasePrefix: input.contentReleaseId.slice(0, 12),
    answerReleasePrefix: input.answerReleaseId.slice(0, 12), resultKind: input.resultKind, errorKind: input.errorKind,
    latencyBucket: latency(input.latencyMs), retrievedCount: input.retrievedCount,
    providerInputBucket: tokens(input.providerInputTokens), providerOutputBucket: tokens(input.providerOutputTokens),
    rateBucket: input.rateBucket });
}
export function copyPublicAnswerEvent(input: PublicAnswerEvent): Readonly<PublicAnswerEvent> {
  exactKeys(input, EVENT_KEYS, 'telemetry event'); const occurred = exactInstant(input.occurredAt);
  if (input.expiresAt !== new Date(occurred + 7 * 86_400_000).toISOString() || !input.requestId
    || input.contentReleasePrefix.length !== 12 || input.answerReleasePrefix.length !== 12
    || !RESULT_KINDS.has(input.resultKind) || (input.errorKind !== null && !ERROR_KINDS.has(input.errorKind))
    || !LATENCY_BUCKETS.has(input.latencyBucket) || !Number.isSafeInteger(input.retrievedCount)
    || input.retrievedCount < 0 || input.retrievedCount > 32_767 || !TOKEN_BUCKETS.has(input.providerInputBucket)
    || !TOKEN_BUCKETS.has(input.providerOutputBucket) || !RATE_BUCKETS.has(input.rateBucket)) throw new Error('telemetry event is invalid');
  return Object.freeze({ occurredAt: input.occurredAt, expiresAt: input.expiresAt, requestId: input.requestId,
    contentReleasePrefix: input.contentReleasePrefix, answerReleasePrefix: input.answerReleasePrefix,
    resultKind: input.resultKind, errorKind: input.errorKind, latencyBucket: input.latencyBucket,
    retrievedCount: input.retrievedCount, providerInputBucket: input.providerInputBucket,
    providerOutputBucket: input.providerOutputBucket, rateBucket: input.rateBucket });
}
