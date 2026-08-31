import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PublicAnswerDeadlineError } from '../../domain/public-answer-errors.js';

function deadlineError(): PublicAnswerDeadlineError {
  return new PublicAnswerDeadlineError('Postgres query absolute deadline elapsed');
}

async function acquireBeforeDeadline(pool: Pool, signal: AbortSignal, deadlineAt: number): Promise<PoolClient> {
  const remaining = deadlineAt - performance.now();
  if (!Number.isFinite(deadlineAt) || remaining <= 0) throw deadlineError();
  const checkout = pool.connect();
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  let acquired = false;
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(signal.reason ?? new Error('query aborted'));
      signal.addEventListener('abort', abortListener, { once: true });
      timer = setTimeout(() => reject(deadlineError()), remaining);
      timer.unref();
    });
    const client = await Promise.race([checkout, interrupted]);
    acquired = true;
    return client;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) signal.removeEventListener('abort', abortListener);
    if (!acquired) void checkout.then((client) => client.release(true), () => undefined);
  }
}

async function settleBeforeDeadline<T>(operation: Promise<T>, signal: AbortSignal, deadlineAt: number): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new Error('query aborted');
  const remaining = deadlineAt - performance.now();
  if (!Number.isFinite(deadlineAt) || remaining <= 0) throw deadlineError();
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(signal.reason ?? new Error('query aborted'));
      signal.addEventListener('abort', abortListener, { once: true });
      timer = setTimeout(() => reject(deadlineError()), remaining);
      timer.unref();
    });
    return await Promise.race([operation, interrupted]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}

export class CancellablePgQueryRunner {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[],
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<QueryResult<T>> {
    if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) throw new Error('query deadline must be a positive finite monotonic instant');
    if (signal.aborted) throw signal.reason ?? new Error('query aborted');
    const worker = await acquireBeforeDeadline(this.pool, signal, deadlineAt);
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
    let transactionOpen = false;
    let skipCancellationWait = false;
    try {
      pid = (await settleBeforeDeadline(
        worker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'), signal, deadlineAt,
      )).rows[0]!.pid;
      signal.addEventListener('abort', listener, { once: true });
      await settleBeforeDeadline(worker.query('BEGIN'), signal, deadlineAt);
      transactionOpen = true;
      const remaining = Math.floor(deadlineAt - performance.now());
      if (remaining <= 0) throw deadlineError();
      await settleBeforeDeadline(worker.query(`SET LOCAL statement_timeout TO ${remaining}`), signal, deadlineAt);
      if (signal.aborted) {
        destroyWorker = true;
        if (!(signal.reason instanceof PublicAnswerDeadlineError)) await cancelOnce();
        throw signal.reason ?? new Error('query aborted');
      }
      const result = await settleBeforeDeadline(worker.query<T>(text, [...values]), signal, deadlineAt);
      await settleBeforeDeadline(worker.query('COMMIT'), signal, deadlineAt);
      transactionOpen = false;
      return result;
    } catch (error) {
      if (signal.aborted) {
        destroyWorker = true;
        if (!(signal.reason instanceof PublicAnswerDeadlineError)) await cancelOnce();
        else { skipCancellationWait = true; void cancelOnce(); }
        throw signal.reason ?? new Error('Postgres query aborted', { cause: error });
      }
      if (error instanceof PublicAnswerDeadlineError || (error as { code?: unknown })?.code === '57014') {
        destroyWorker = true;
        skipCancellationWait = true;
        if (pid > 0) void cancelOnce();
        throw error instanceof PublicAnswerDeadlineError ? error : deadlineError();
      }
      if (transactionOpen) {
        try {
          await settleBeforeDeadline(worker.query('ROLLBACK'), signal, deadlineAt);
          transactionOpen = false;
        } catch {
          destroyWorker = true;
        }
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', listener);
      if (cancellation && !skipCancellationWait) {
        const cancelled = await cancellation;
        if (!cancelled) destroyWorker = true;
      }
      worker.release(destroyWorker);
    }
  }
}
