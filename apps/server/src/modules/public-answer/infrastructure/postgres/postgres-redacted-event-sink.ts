import type { Pool } from 'pg';

import { copyRedactedPublicAnswerEvent, type RedactedPublicAnswerEvent } from '../telemetry/redacted-events.js';
import { purgeExpiredTelemetry } from './telemetry-retention.js';

export interface PostgresRedactedEventSinkOptions {
  readonly logger?: (code: 'telemetry-write-failed') => void;
  readonly clock?: () => number;
}

export class PostgresRedactedEventSink {
  readonly #logger: (code: 'telemetry-write-failed') => void;
  readonly #clock: () => number;
  #writesSincePurge = 0;
  #lastPurgeAt = 0;

  constructor(private readonly pool: Pick<Pool, 'query'>, options: PostgresRedactedEventSinkOptions = {}) {
    this.#logger = options.logger ?? (() => undefined);
    this.#clock = options.clock ?? Date.now;
  }

  async start(): Promise<void> {
    try {
      await purgeExpiredTelemetry(this.pool, new Date(this.#clock()));
      this.#lastPurgeAt = this.#clock();
    } catch { this.#reportFailure(); }
  }

  async record(event: RedactedPublicAnswerEvent): Promise<void> {
    try {
      const safeEvent = copyRedactedPublicAnswerEvent(event);
      const aggregateExpiresAt = new Date(Date.parse(safeEvent.occurredAt) + 90 * 86_400_000);
      await this.pool.query(`
        WITH inserted AS (
          INSERT INTO public_answer_events(
            occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,
            latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING occurred_at,result_kind
        )
        INSERT INTO public_answer_daily_aggregates(day,result_kind,count,expires_at)
        SELECT (occurred_at AT TIME ZONE 'UTC')::date,result_kind,1,$13 FROM inserted
        ON CONFLICT(day,result_kind) DO UPDATE SET count=public_answer_daily_aggregates.count+1,
          expires_at=GREATEST(public_answer_daily_aggregates.expires_at,EXCLUDED.expires_at)
      `, [safeEvent.occurredAt,safeEvent.expiresAt,safeEvent.requestId,safeEvent.contentReleasePrefix,safeEvent.answerReleasePrefix,
        safeEvent.resultKind,safeEvent.errorKind,safeEvent.latencyBucket,safeEvent.retrievedCount,safeEvent.providerInputBucket,
        safeEvent.providerOutputBucket,safeEvent.rateBucket,aggregateExpiresAt]);
      this.#writesSincePurge += 1;
      const now = this.#clock();
      if (this.#writesSincePurge >= 100 || now - this.#lastPurgeAt >= 3_600_000) {
        await purgeExpiredTelemetry(this.pool, new Date(now));
        this.#writesSincePurge = 0;
        this.#lastPurgeAt = now;
      }
    } catch { this.#reportFailure(); }
  }

  #reportFailure(): void {
    try { this.#logger('telemetry-write-failed'); } catch { /* telemetry cannot fail the answer path */ }
  }
}
