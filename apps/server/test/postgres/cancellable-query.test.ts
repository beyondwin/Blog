import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancellablePgQueryRunner } from '../../src/modules/public-answer/infrastructure/postgres/cancellable-pg-query-runner.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
let pool: Pool;
beforeEach(() => { pool = new Pool({ connectionString: databaseUrl, max: 3 }); });
afterEach(async () => { await pool.end(); });

describe('cancellable pg query runner', () => {
  it('rejects a non-positive or non-finite budget before checking out a worker', async () => {
    const runner = new CancellablePgQueryRunner(pool);
    await expect(runner.query('SELECT 1', [], new AbortController().signal, 0)).rejects.toThrow(/budget/u);
    await expect(runner.query('SELECT 1', [], new AbortController().signal, Number.POSITIVE_INFINITY)).rejects.toThrow(/budget/u);
  });

  it('cancels pg_sleep using a reserved control connection and leaves the pool usable', async () => {
    const runner = new CancellablePgQueryRunner(pool);
    const controller = new AbortController();
    const pending = runner.query('SELECT pg_sleep($1)', [30], controller.signal, 10_000);
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toThrow(/abort|cancel/iu);
    await expect(pool.query('SELECT 1 AS ok')).resolves.toMatchObject({ rows: [{ ok: 1 }] });
    expect((await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE query LIKE 'SELECT pg_sleep%' AND state='active'"))).toMatchObject({ rows: [{ count: 0 }] });
  });
});
