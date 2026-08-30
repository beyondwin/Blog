import type { Pool } from 'pg';

import {
  copyPublicAnswerEvent,
  type PublicAnswerEvent,
  type PublicAnswerEventSink,
} from '../../application/ports/event-sink.js';
import { purgeExpiredTelemetry } from './telemetry-retention.js';

export interface PostgresRedactedEventSinkOptions {
  readonly logger?: (code: 'telemetry-write-failed') => void;
  readonly clock?: () => number;
}

export class PostgresRedactedEventSink implements PublicAnswerEventSink {
  readonly #logger: (code: 'telemetry-write-failed') => void;
  readonly #clock: () => number;
  #writesSincePurge = 0;
  #lastPurgeAt = 0;
  readonly #active = new Set<Promise<void>>();
  #purgeInFlight: Promise<void> | undefined;

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

  record(event: PublicAnswerEvent): void {
    let safeEvent: Readonly<PublicAnswerEvent>;
    try { safeEvent = copyPublicAnswerEvent(event); } catch { this.#reportFailure(); return; }
    this.#track(this.#write(safeEvent));
  }

  async waitForIdle(): Promise<void> {
    while (this.#active.size > 0) await Promise.all([...this.#active]);
  }

  async #write(safeEvent: Readonly<PublicAnswerEvent>): Promise<void> {
    try {
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
        this.#launchPurge(now);
      }
    } catch { this.#reportFailure(); }
  }

  #launchPurge(now: number): void {
    if (this.#purgeInFlight) return;
    const writesAtStart = this.#writesSincePurge;
    const purge = purgeExpiredTelemetry(this.pool, new Date(now)).then(() => {
      this.#writesSincePurge = Math.max(0, this.#writesSincePurge - writesAtStart);
      this.#lastPurgeAt = now;
    }).catch(() => {
      this.#writesSincePurge = Math.max(0, this.#writesSincePurge - writesAtStart);
      this.#lastPurgeAt = now;
      this.#reportFailure();
    }).finally(() => {
      this.#purgeInFlight = undefined;
      const current = this.#clock();
      if (this.#writesSincePurge >= 100 || current - this.#lastPurgeAt >= 3_600_000) this.#launchPurge(current);
    });
    this.#purgeInFlight = purge;
    this.#track(purge);
  }

  #track(operation: Promise<void>): void {
    const handled = operation.catch(() => { this.#reportFailure(); });
    this.#active.add(handled);
    void handled.then(() => { this.#active.delete(handled); });
  }

  #reportFailure(): void {
    try { this.#logger('telemetry-write-failed'); } catch { /* telemetry cannot fail the answer path */ }
  }
}
