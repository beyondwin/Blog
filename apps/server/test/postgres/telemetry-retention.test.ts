import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresRedactedEventSink } from '../../src/modules/public-answer/infrastructure/postgres/postgres-redacted-event-sink.js';
import { purgeExpiredTelemetry } from '../../src/modules/public-answer/infrastructure/postgres/telemetry-retention.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { redactPublicAnswerEvent } from '../../src/modules/public-answer/infrastructure/telemetry/redacted-events.js';
import { AnswerPublicQuestion } from '../../src/modules/public-answer/application/answer-public-question.js';
import type { PublicAnswerEventSink } from '../../src/modules/public-answer/application/ports/event-sink.js';

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
    const asPort: PublicAnswerEventSink = sink;
    asPort.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'request-1', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1_234, retrievedCount: 4, providerInputTokens: 1_001, providerOutputTokens: 42, rateBucket: 'admitted' }));
    await sink.waitForIdle();
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
    sink.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }));
    await sink.waitForIdle();
    expect(logged).toEqual(['telemetry-write-failed', 'telemetry-write-failed']);
    const throwingLogger = new PostgresRedactedEventSink({ query: async () => { throw new Error('database-secret'); } } as unknown as Pool, { logger: () => { throw new Error('logger-secret'); } });
    await expect(throwingLogger.start()).resolves.toBeUndefined();
    throwingLogger.record(redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'r', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' }));
    await throwingLogger.waitForIdle();
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
    for (let index = 0; index < 99; index += 1) sink.record({ ...event, requestId: `write-${index}` });
    await sink.waitForIdle();
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hundred'")).rows[0].count).toBe(1);
    sink.record({ ...event, requestId: 'write-99' }); await sink.waitForIdle();
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hundred'")).rows[0].count).toBe(0);
    await pool.query(`INSERT INTO public_answer_events(occurred_at,expires_at,request_id,content_release_prefix,answer_release_prefix,result_kind,error_kind,latency_bucket,retrieved_count,provider_input_bucket,provider_output_bucket,rate_bucket)
      VALUES('2026-08-01','2026-08-29','hour','cccccccccccc','aaaaaaaaaaaa','answer',NULL,'<250ms',0,'0','0','admitted')`);
    now += 3_600_000;
    sink.record({ ...event, requestId: 'after-hour' }); await sink.waitForIdle();
    expect((await pool.query("SELECT count(*)::int AS count FROM public_answer_events WHERE request_id='hour'")).rows[0].count).toBe(0);
  });

  it('persists the exact event emitted by AnswerPublicQuestion without an adapter', async () => {
    const sink: PublicAnswerEventSink & PostgresRedactedEventSink = new PostgresRedactedEventSink(pool, { clock: () => Date.parse('2026-08-30T00:00:00.175Z') });
    await sink.start();
    const useCase = new AnswerPublicQuestion({
      policy: { mode: 'fixture' }, eventSink: sink,
      retriever: { retrieve: async () => { throw new Error('must not retrieve'); } },
      generator: { generate: async () => { throw new Error('must not generate'); } },
      deterministicVerifier: { verify: () => { throw new Error('must not verify'); } },
      semanticVerifier: { verify: async () => { throw new Error('must not verify'); } },
      usageGuard: { acquire: async () => { throw new Error('must not acquire'); } },
      clock: (() => { let now = Date.parse('2026-08-30T00:00:00.000Z'); return () => { const value=now; now+=175; return value; }; })(),
    });
    const catalog = { bindingId: 'binding', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64),
      corpusApprovalHash: 'sha256:approval', chunkCount: 1, isBoundTo: () => false, evidenceFor: () => [],
      hasAuthorizedEvidenceLocation: () => false } as const;
    await expect(useCase.execute({ requestId: 'composed', question: '질문', contentReleaseId: catalog.contentReleaseId,
      answerReleaseId: 'b'.repeat(64), networkKey: 'network', signal: new AbortController().signal, catalog })).resolves.toMatchObject({ kind: 'search', reason: 'release-mismatch' });
    await sink.waitForIdle();
    expect((await pool.query('SELECT result_kind,latency_bucket,rate_bucket FROM public_answer_events WHERE request_id=$1',['composed'])).rows)
      .toEqual([{ result_kind: 'release-mismatch', latency_bucket: '<250ms', rate_bucket: 'admitted' }]);
  });

  it('never lets a stalled telemetry query block an answer and safely resumes lifecycle bookkeeping after late rejection', async () => {
    let rejectStalled!: (error: unknown) => void;
    let mode: 'stall' | 'ready' = 'stall';
    let purgeCalls = 0;
    const fakePool = { query: async (sql: string) => {
      if (mode === 'stall') return new Promise((_accept, reject) => { rejectStalled = reject; });
      if (sql.includes('expired_events')) { purgeCalls += 1; return { rows: [{ events_deleted: 0, aggregates_deleted: 0 }] }; }
      return { rows: [] };
    } };
    let now = Date.parse('2026-08-30T00:00:00.000Z');
    const sink = new PostgresRedactedEventSink(fakePool as never, { clock: () => now });
    const event = redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'stalled', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' });
    const unhandled: unknown[] = []; const listener = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', listener);
    try {
      const useCase = new AnswerPublicQuestion({ policy: { mode: 'fixture' }, eventSink: sink,
        retriever: { retrieve: async () => { throw new Error('unused'); } }, generator: { generate: async () => { throw new Error('unused'); } },
        deterministicVerifier: { verify: () => { throw new Error('unused'); } }, semanticVerifier: { verify: async () => { throw new Error('unused'); } },
        usageGuard: { acquire: async () => { throw new Error('unused'); } }, clock: () => now });
      const catalog = { bindingId: 'binding', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), corpusApprovalHash: 'sha256:approval', chunkCount: 1,
        isBoundTo: () => false, evidenceFor: () => [], hasAuthorizedEvidenceLocation: () => false } as const;
      const answer = useCase.execute({ requestId: 'stalled', question: '질문', contentReleaseId: catalog.contentReleaseId,
        answerReleaseId: 'b'.repeat(64), networkKey: 'network', signal: new AbortController().signal, catalog });
      await expect(Promise.race([answer, new Promise((accept) => setTimeout(() => accept('timeout'), 50))])).resolves.toMatchObject({ kind: 'search', reason: 'release-mismatch' });
      rejectStalled(new Error('late-database-secret'));
      await new Promise((accept) => setImmediate(accept));
      expect(unhandled).toEqual([]);
      mode = 'ready'; await sink.start();
      for (let index = 0; index < 100; index += 1) sink.record({ ...event, requestId: `resume-${index}` });
      await sink.waitForIdle(); expect(purgeCalls).toBe(2);
      now += 3_600_000; sink.record({ ...event, requestId: 'resume-hour' }); await sink.waitForIdle();
      expect(purgeCalls).toBe(3);
    } finally { process.off('unhandledRejection', listener); }
  });

  it('rejects raw extra fields before Postgres bind values and exposes only a constant logger code', async () => {
    const sentinels = ['question-secret','claim-secret','excerpt-secret','https://url.invalid/','/Users/example/private','192.0.2.1','network-key-secret'];
    const binds: unknown[][] = []; const logs: string[] = [];
    const fakePool = { query: async (_sql: string, values?: unknown[]) => { binds.push(values ?? []); return { rows: [] }; } };
    const sink = new PostgresRedactedEventSink(fakePool as never, { logger: (code) => logs.push(code), clock: () => 0 });
    const event = redactPublicAnswerEvent({ occurredAt: '2026-08-30T00:00:00.000Z', requestId: 'safe', contentReleaseId: 'c'.repeat(64), answerReleaseId: 'a'.repeat(64), resultKind: 'answer', errorKind: null, latencyMs: 1, retrievedCount: 0, providerInputTokens: 0, providerOutputTokens: 0, rateBucket: 'admitted' });
    for (const [index, sentinel] of sentinels.entries()) sink.record({ ...event, [`raw${index}`]: sentinel } as never);
    sink.record(event); await sink.waitForIdle();
    expect(logs).toEqual(Array(7).fill('telemetry-write-failed'));
    expect(binds).toHaveLength(1);
    const serialized = JSON.stringify({ binds, logs });
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
  });
});
