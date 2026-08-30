import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export class CancellablePgQueryRunner {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[],
    signal: AbortSignal,
    budgetMs: number,
  ): Promise<QueryResult<T>> {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('query budget must be a positive finite duration');
    if (signal.aborted) throw signal.reason ?? new Error('query aborted');
    const started = performance.now();
    const worker = await this.pool.connect();
    const control: { client?: PoolClient } = {};
    let pid = 0;
    let cancellationFailed = false;
    const abort = async (): Promise<void> => {
      try {
        control.client ??= await this.pool.connect();
        const result = await control.client.query<{ cancelled: boolean }>('SELECT pg_cancel_backend($1) AS cancelled', [pid]);
        if (!result.rows[0]?.cancelled) cancellationFailed = true;
      } catch { cancellationFailed = true; }
    };
    const listener = (): void => { void abort(); };
    try {
      pid = (await worker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const remaining = Math.max(1, Math.floor(budgetMs - (performance.now() - started)));
      await worker.query(`SET statement_timeout TO ${remaining}`);
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) await abort();
      return await worker.query<T>(text, [...values]);
    } catch (error) {
      if (signal.aborted) throw new Error('Postgres query aborted', { cause: error });
      throw error;
    } finally {
      signal.removeEventListener('abort', listener);
      if (signal.aborted) await abort();
      control.client?.release();
      worker.release(cancellationFailed);
    }
  }
}
