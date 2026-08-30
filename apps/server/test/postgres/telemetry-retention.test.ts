import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresRedactedEventSink } from '../../src/modules/public-answer/infrastructure/postgres/postgres-redacted-event-sink.js';
import { purgeExpiredTelemetry } from '../../src/modules/public-answer/infrastructure/postgres/telemetry-retention.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { redactPublicAnswerEvent } from '../../src/modules/public-answer/infrastructure/telemetry/redacted-events.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
let pool: Pool;

beforeEach(async () => {
  pool = new Pool({ connectionString: databaseUrl, max: 4 });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE'); await pool.query('CREATE SCHEMA public');
  await runPostgresMigrations(pool);
});
afterEach(async () => { await pool.query('DROP SCHEMA IF EXISTS public CASCADE'); await pool.query('CREATE SCHEMA public'); await pool.end(); });

describe('redacted telemetry schema and retention', () => {
  it('has only the exact allowlisted columns and stores buckets rather than exact values or payloads', async () => {
    const rows = (await pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('public_answer_events','public_answer_daily_aggregates')
      ORDER BY table_name,ordinal_position`)).rows;
    expect(Object.groupBy(rows, (row) => row.table_name)).toEqual({
      public_answer_daily_aggregates: [
        { table_name: 'public_answer_daily_aggregates', column_name: 'day' },
        { table_name: 'public_answer_daily_aggregates', column_name: 'result_kind' },
        { table_name: 'public_answer_daily_aggregates', column_name: 'count' },
        { table_name: 'public_answer_daily_aggregates', column_name: 'expires_at' },
      ],
      public_answer_events: [
        { table_name: 'public_answer_events', column_name: 'event_id' },
        { table_name: 'public_answer_events', column_name: 'occurred_at' },
        { table_name: 'public_answer_events', column_name: 'expires_at' },
        { table_name: 'public_answer_events', column_name: 'request_id' },
        { table_name: 'public_answer_events', column_name: 'content_release_prefix' },
        { table_name: 'public_answer_events', column_name: 'answer_release_prefix' },
        { table_name: 'public_answer_events', column_name: 'result_kind' },
        { table_name: 'public_answer_events', column_name: 'error_kind' },
        { table_name: 'public_answer_events', column_name: 'latency_bucket' },
        { table_name: 'public_answer_events', column_name: 'retrieved_count' },
        { table_name: 'public_answer_events', column_name: 'provider_input_bucket' },
        { table_name: 'public_answer_events', column_name: 'provider_output_bucket' },
        { table_name: 'public_answer_events', column_name: 'rate_bucket' },
      ],
    });
    const logged: string[] = [];
    const sink = new PostgresRedactedEventSink(pool, { logger: (code) => logged.push(code), clock: () => Date.parse('2026-08-30T00:00:00.000Z') });
    await sink.start();
    await sink.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'request-1', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1_234, retrievedCount: 4, providerInputTokens: 1_001, providerOutputTokens: 42, rateBucket: 'admitted' }));
    expect((await pool.query('SELECT request_id,latency_bucket,provider_input_bucket,provider_output_bucket,expires_at FROM public_answer_events')).rows)
      .toEqual([{ request_id: 'request-1', latency_bucket: '1-2.999s', provider_input_bucket: '1000-1999', provider_output_bucket: '1-999', expires_at: new Date('2026-09-06T00:00:00.000Z') }]);
    expect((await pool.query('SELECT day::text,result_kind,count::int,expires_at FROM public_answer_daily_aggregates')).rows)
      .toEqual([{ day: '2026-08-30', result_kind: 'answer', count: 1, expires_at: new Date('2026-11-28T00:00:00.000Z') }]);
    expect(logged).toEqual([]);
  });

  it('deletes at most 1000 expired seven-day events and 90-day aggregates while retaining live rows', async () => {
    await pool.query(`INSERT INTO public_answer_events(occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket)
      SELECT '2026-08-01',CASE WHEN value<=1001 THEN '2026-08-29'::timestamptz ELSE '2026-09-01'::timestamptz END,'r'||value,'cccccccccccc','aaaaaaaaaaaa','answer',NULL,'<250ms',0,'0','0','admitted' FROM generate_series(1,1002) value`);
    await pool.query(`INSERT INTO public_answer_daily_aggregates(day,result_kind,count,expires_at) VALUES
      ('2026-05-01','answer',1,'2026-08-29'),('2026-08-30','answer',1,'2026-11-28')`);
    expect(await purgeExpiredTelemetry(pool, new Date('2026-08-30T00:00:00.000Z'))).toEqual({ eventsDeleted: 1_000, aggregatesDeleted: 1 });
    expect((await pool.query('SELECT count(*)::int AS count FROM public_answer_events WHERE expires_at <= $1',['2026-08-30'])).rows[0].count).toBe(1);
    expect((await pool.query('SELECT day::text FROM public_answer_daily_aggregates ORDER BY day')).rows).toEqual([{ day: '2026-08-30' }]);
  });

  it('swallows database failures and reports only the constant failure code', async () => {
    const logged: string[] = [];
    const sink = new PostgresRedactedEventSink({ query: async () => { throw new Error('database-secret'); } } as unknown as Pool, { logger: (code) => logged.push(code) });
    await expect(sink.start()).resolves.toBeUndefined();
    await expect(sink.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }))).resolves.toBeUndefined();
    expect(logged).toEqual(['telemetry-write-failed', 'telemetry-write-failed']);
    const throwingLogger = new PostgresRedactedEventSink({ query: async () => { throw new Error('database-secret'); } } as unknown as Pool, { logger: () => { throw new Error('logger-secret'); } });
    await expect(throwingLogger.start()).resolves.toBeUndefined();
    await expect(throwingLogger.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }))).resolves.toBeUndefined();
  });

  it('purges at startup, every 100 successful writes, and after one elapsed hour', async () => {
    let now = Date.parse('2026-08-30T00:00:00.000Z');
    const sink = new PostgresRedactedEventSink(pool, { clock: () => now });
    await pool.query(`INSERT INTO public_answer_events(occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket)
      VALUES('2026-08-01','2026-08-29','startup','cccccccccccc','aaaaaaaaaaaa','answer',NULL,'<250ms',0,'0','0','admitted')`);
    await sink.start();
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='startup'")).rows[0].count).toBe(0);
    await pool.query(`INSERT INTO public_answer_events(occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket)
      VALUES('2026-08-01','2026-08-29','hundred','cccccccccccc','aaaaaaaaaaaa','answer',NULL,'<250ms',0,'0','0','admitted')`);
    const event = redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'write', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' });
    for (let index = 0; index < 99; index += 1) await sink.record({ ...event, requestId: `write-${index}` });
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hundred'")).rows[0].count).toBe(1);
    await sink.record({ ...event, requestId: 'write-99' });
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hundred'")).rows[0].count).toBe(0);
    await pool.query(`INSERT INTO public_answer_events(occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket)
      VALUES('2026-08-01','2026-08-29','hour','cccccccccccc','aaaaaaaaaaaa','answer',NULL,'<250ms',0,'0','0','admitted')`);
    now += 3_600_000;
    await sink.record({ ...event, requestId: 'after-hour' });
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hour'")).rows[0].count).toBe(0);
  });
});
