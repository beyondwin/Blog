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
    let pid = 0;
    let cancellation: Promise<boolean> | undefined;
    const cancelOnce = (): Promise<boolean> => {
      cancellation ??= (async () => {
        let control: PoolClient | undefined;
        try {
          control = await this.pool.connect();
          const result = await control.query<{ cancelled: boolean }>('SELECT pg_cancel_backend($1) AS cancelled', [pid]);
          return result.rows[0]?.cancelled === true;
        } catch {
          return false;
        } finally {
          control?.release();
        }
      })();
      return cancellation;
    };
    const listener = (): void => { void cancelOnce(); };
    let destroyWorker = false;
    try {
      pid = (await worker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const remaining = Math.floor(budgetMs - (performance.now() - started));
      if (remaining <= 0) throw new Error('query monotonic budget was exhausted before execution');
      await worker.query(`SET statement_timeout TO ${remaining}`);
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) {
        destroyWorker = true;
        await cancelOnce();
        throw signal.reason ?? new Error('query aborted');
      }
      return await worker.query<T>(text, [...values]);
    } catch (error) {
      if (signal.aborted) {
        destroyWorker = true;
        await cancelOnce();
        throw new Error('Postgres query aborted', { cause: error });
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', listener);
      if (cancellation) {
        const cancelled = await cancellation;
        if (!cancelled) destroyWorker = true;
      }
      worker.release(destroyWorker);
    }
  }
}
