import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancellablePgQueryRunner } from '../../src/modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { PublicAnswerDeadlineError } from '../../src/modules/public-answer/domain/public-answer-errors.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
let pool: Pool;
beforeEach(async () => {
  pool = new Pool({ connectionString: databaseUrl, max: 3 });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runPostgresMigrations(pool);
});
afterEach(async () => {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.end();
});

describe('cancellable pg query runner', () => {
  it('rejects a non-positive or non-finite absolute deadline before checking out a worker', async () => {
    const runner = new CancellablePgQueryRunner(pool);
    await expect(runner.query('SELECT 1', [], new AbortController().signal, 0)).rejects.toThrow(/deadline/u);
    await expect(runner.query('SELECT 1', [], new AbortController().signal, Number.POSITIVE_INFINITY)).rejects.toThrow(/deadline/u);
  });

  it('fails instead of granting a fresh timeout after checkout exhausts the monotonic budget', async () => {
    let released: boolean | undefined;
    const fakePool = {
      async connect() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          async query(text: string) {
            if (text.includes('pg_backend_pid')) return { rows: [{ pid: 77 }] };
            throw new Error('query must not execute after exhausted budget');
          },
          release(destroy?: boolean) { released = destroy; },
        };
      },
    } as any;
    await expect(new CancellablePgQueryRunner(fakePool).query(
      'SELECT 1', [], new AbortController().signal, performance.now() + 1,
    )).rejects.toThrow(/deadline/u);
    for (let attempt = 0; attempt < 20 && released === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(released).toBe(true);
  });

  it('cancels pg_sleep using a reserved control connection and leaves the pool usable', async () => {
    const runner = new CancellablePgQueryRunner(pool);
    const controller = new AbortController();
    const marker = `cancel_exact_${process.pid}_${Date.now()}`;
    const pending = runner.query(`SELECT pg_sleep($1) /* ${marker} */`, [30], controller.signal, performance.now() + 10_000);
    let workerPid: number | undefined;
    for (let attempt = 0; attempt < 100 && workerPid === undefined; attempt += 1) {
      const result = await pool.query<{ pid: number }>('SELECT pid FROM pg_stat_activity WHERE query LIKE $1 AND state=$2', [`%${marker}%`, 'active']);
      workerPid = result.rows[0]?.pid;
      if (workerPid === undefined) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(workerPid).toBeTypeOf('number');
    controller.abort();
    await expect(pending).rejects.toThrow(/abort|cancel/iu);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const present = (await pool.query<{ present: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS present', [workerPid])).rows[0]!.present;
      if (!present) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await pool.query<{ present: boolean }>('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS present', [workerPid]))
      .rows[0]!.present).toBe(false);
    const fresh = await pool.query<{ pid: number; ok: number }>('SELECT pg_backend_pid() AS pid, 1 AS ok');
    expect(fresh.rows[0]).toMatchObject({ ok: 1 });
    expect(fresh.rows[0]!.pid).not.toBe(workerPid);
  });

  it('uses one delayed control checkout and awaits cancellation before releasing the worker', async () => {
    let connectCalls = 0;
    let cancelCalls = 0;
    const order: string[] = [];
    let rejectMain!: (error: Error) => void;
    let releaseControl!: () => void;
    const delayedControl = new Promise<void>((resolve) => { releaseControl = resolve; });
    const worker = {
      async query(text: string) {
        if (text.includes('pg_backend_pid')) return { rows: [{ pid: 4242 }] };
        if (text.startsWith('SET')) return { rows: [] };
        return new Promise((_resolve, reject) => { rejectMain = reject; });
      },
      release(destroy?: boolean) { order.push(`worker:${String(destroy)}`); },
    };
    const control = {
      async query(_text: string, values: unknown[]) {
        cancelCalls += 1; expect(values).toEqual([4242]); await delayedControl; return { rows: [{ cancelled: true }] };
      },
      release() { order.push('control'); },
    };
    const fakePool = {
      async connect() { connectCalls += 1; return connectCalls === 1 ? worker : control; },
    } as any;
    const controller = new AbortController();
    const pending = new CancellablePgQueryRunner(fakePool).query('SELECT pg_sleep($1)', [30], controller.signal, performance.now() + 10_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    rejectMain(new Error('cancelled'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connectCalls).toBe(2);
    expect(cancelCalls).toBe(1);
    expect(order).toEqual([]);
    releaseControl();
    await expect(pending).rejects.toThrow(/abort/u);
    expect(order).toEqual(['control', 'worker:true']);
  });

  it('uses an absolute deadline and does not grant a fresh duration after delayed checkout', async () => {
    let executed = false;
    let released: boolean | undefined;
    const worker = {
      async query(text: string) {
        if (text.includes('pg_backend_pid')) return { rows: [{ pid: 77 }] };
        executed = true;
        return { rows: [{ ok: 1 }] };
      },
      release(destroy?: boolean) { released = destroy; },
    };
    const fakePool = { async connect() { await new Promise((resolve) => setTimeout(resolve, 10)); return worker; } } as any;
    const deadlineAt = performance.now() + 1;
    await expect(new CancellablePgQueryRunner(fakePool).query(
      'SELECT 1', [], new AbortController().signal, deadlineAt,
    )).rejects.toBeInstanceOf(PublicAnswerDeadlineError);
    expect(executed).toBe(false);
    for (let attempt = 0; attempt < 20 && released === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(released).toBe(true);
  });

  it('aborts blocked pool acquisition and preserves the exact typed deadline reason', async () => {
    let resolveWorker!: (value: any) => void;
    let released: boolean | undefined;
    const worker = { query: async () => ({ rows: [] }), release(destroy?: boolean) { released = destroy; } };
    const fakePool = { connect: () => new Promise((resolve) => { resolveWorker = resolve; }) } as any;
    const controller = new AbortController();
    const reason = new PublicAnswerDeadlineError('absolute HTTP deadline elapsed');
    const pending = new CancellablePgQueryRunner(fakePool).query('SELECT 1', [], controller.signal, performance.now() + 12_000);
    controller.abort(reason);
    const result = await Promise.race([
      pending.then(() => ({ kind: 'resolved' as const }), (error) => ({ kind: 'rejected' as const, error })),
      new Promise<{ kind: 'hung' }>((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 50)),
    ]);
    resolveWorker(worker);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result).toEqual({ kind: 'rejected', error: reason });
    expect(released).toBe(true);
  });

  it('rethrows the exact typed deadline reason after cancelling an in-flight backend', async () => {
    let connects = 0;
    let rejectQuery!: (error: Error) => void;
    const worker = {
      async query(text: string) {
        if (text.includes('pg_backend_pid')) return { rows: [{ pid: 88 }] };
        if (text.startsWith('SET')) return { rows: [] };
        return new Promise((_resolve, reject) => { rejectQuery = reject; });
      },
      release() {},
    };
    const control = { async query() { return { rows: [{ cancelled: true }] }; }, release() {} };
    const fakePool = { async connect() { connects += 1; return connects === 1 ? worker : control; } } as any;
    const controller = new AbortController();
    const reason = new PublicAnswerDeadlineError('request deadline elapsed');
    const pending = new CancellablePgQueryRunner(fakePool).query('SELECT pg_sleep(30)', [], controller.signal, performance.now() + 12_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(reason);
    rejectQuery(new Error('cancelled by backend'));
    await expect(pending).rejects.toBe(reason);
  });

  it('maps a statement_timeout cancellation to the typed public-answer deadline', async () => {
    const worker = {
      async query(text: string) {
        if (text.includes('pg_backend_pid')) return { rows: [{ pid: 99 }] };
        if (text.startsWith('SET')) return { rows: [] };
        throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      },
      release() {},
    };
    const fakePool = { async connect() { return worker; } } as any;
    await expect(new CancellablePgQueryRunner(fakePool).query(
      'SELECT pg_sleep(30)', [], new AbortController().signal, performance.now() + 12_000,
    )).rejects.toBeInstanceOf(PublicAnswerDeadlineError);
  });
});
