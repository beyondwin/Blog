import { PublicAnswerDeadlineError } from '../modules/public-answer/domain/public-answer-errors.js';
import type { RuntimeReadiness } from '../health/runtime-readiness.js';

const SHUTDOWN_DEADLINE_MS = 10_000;
const LOAD_BALANCER_GRACE_MS = 2_000;
const DRAIN_POLL_MS = 25;

export interface RuntimeLifecycleOptions {
  readonly readiness: RuntimeReadiness;
  readonly closeServer: () => Promise<void>;
  readonly closePool: () => Promise<void>;
  readonly clock?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly setExitCode?: (code: number) => void;
}

export class RuntimeLifecycle {
  readonly #readiness: RuntimeReadiness;
  readonly #closeServer: () => Promise<void>;
  readonly #closePool: () => Promise<void>;
  readonly #clock: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #setExitCode: (code: number) => void;
  readonly #active = new Set<AbortController>();
  #accepting = true;
  #shutdown: Promise<void> | undefined;
  #signalsRegistered = false;

  constructor(options: RuntimeLifecycleOptions) {
    this.#readiness = options.readiness;
    this.#closeServer = options.closeServer;
    this.#closePool = options.closePool;
    this.#clock = options.clock ?? performance.now.bind(performance);
    this.#sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      timer.unref();
    }));
    this.#setExitCode = options.setExitCode ?? ((code) => { process.exitCode = code; });
  }

  acceptingRequests(): boolean {
    return this.#accepting;
  }

  beginRequest(controller: AbortController): () => void {
    if (!this.#accepting) throw new Error('runtime is not accepting requests');
    this.#active.add(controller);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.#active.delete(controller);
    };
  }

  registerSignals(target: Pick<NodeJS.Process, 'on'> = process): void {
    if (this.#signalsRegistered) return;
    this.#signalsRegistered = true;
    target.on('SIGTERM', () => { void this.shutdown('SIGTERM'); });
    target.on('SIGINT', () => { void this.shutdown('SIGINT'); });
  }

  shutdown(_signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
    this.#shutdown ??= this.#close();
    return this.#shutdown;
  }

  async #close(): Promise<void> {
    const deadline = this.#clock() + SHUTDOWN_DEADLINE_MS;
    let failed = false;
    this.#readiness.beginShutdown();
    await this.#sleep(LOAD_BALANCER_GRACE_MS);
    this.#accepting = false;

    const serverClose = this.#startBeforeDeadline(this.#closeServer, deadline);
    while (this.#active.size > 0 && this.#clock() < deadline) {
      await this.#sleep(Math.min(DRAIN_POLL_MS, Math.max(0, deadline - this.#clock())));
    }
    if (this.#active.size > 0) {
      failed = true;
      const reason = new PublicAnswerDeadlineError('runtime shutdown deadline elapsed');
      for (const controller of this.#active) controller.abort(reason);
      this.#active.clear();
    }
    if (!await serverClose) failed = true;
    if (!await this.#startBeforeDeadline(this.#closePool, deadline)) failed = true;
    this.#setExitCode(failed ? 1 : 0);
  }

  async #settleBeforeDeadline(operation: Promise<void>, deadline: number): Promise<boolean> {
    let completed = false;
    let result = false;
    const settled = operation.then(() => { completed = true; result = true; return true; }, () => {
      completed = true; result = false; return false;
    });
    await Promise.resolve();
    if (completed) return result;
    const remaining = deadline - this.#clock();
    if (remaining <= 0) { void settled; return false; }
    return Promise.race([settled, this.#sleep(remaining).then(() => false)]);
  }

  #startBeforeDeadline(operation: () => Promise<void>, deadline: number): Promise<boolean> {
    try {
      return this.#settleBeforeDeadline(operation(), deadline);
    } catch {
      return Promise.resolve(false);
    }
  }
}
