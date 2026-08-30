export type PublicAnswerResultKind =
  | 'answer'
  | 'insufficient-evidence'
  | 'unsupported-question'
  | 'release-mismatch'
  | 'provider-disabled'
  | 'rate-limited'
  | 'timeout'
  | 'unavailable'
  | 'invalid-response';

export interface PublicAnswerEvent {
  timestamp: string;
  requestId: string;
  contentReleaseIdPrefix: string;
  answerReleaseIdPrefix: string;
  resultKind: PublicAnswerResultKind;
  latencyBucket: 'lt-250ms' | 'lt-1s' | 'lt-8s' | 'gte-8s';
  retrievedCount: number;
  providerInputTokenBucket: '0' | '1-128' | '129-512' | '513-2048' | '2049-plus';
  providerOutputTokenBucket: '0' | '1-128' | '129-512' | '513-2048' | '2049-plus';
  rateBucket: 'not-acquired' | 'accepted';
}

export interface PublicAnswerEventSink {
  record(event: PublicAnswerEvent): Promise<void>;
}
