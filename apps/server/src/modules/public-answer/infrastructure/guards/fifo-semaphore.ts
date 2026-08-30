import type { GenerationLease } from '../../application/ports/usage-guard.js';
import { PublicAnswerConcurrencyError } from '../../domain/public-answer-errors.js';

interface Waiter {
  readonly signal: AbortSignal;
  readonly accept: (lease: GenerationLease) => void;
  readonly reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  abort: () => void;
}

export interface FifoSemaphoreOptions {
  readonly running: number;
  readonly queued: number;
  readonly waitMs: number;
}

export class FifoSemaphore {
  #running = 0;
  readonly #queue: Waiter[] = [];

  constructor(private readonly options: FifoSemaphoreOptions) {}

  acquire(signal: AbortSignal): Promise<GenerationLease> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.#running < this.options.running) {
      this.#running += 1;
      return Promise.resolve(this.#lease());
    }
    if (this.#queue.length >= this.options.queued) {
      return Promise.reject(new PublicAnswerConcurrencyError('public answer concurrency unavailable'));
    }
    return new Promise<GenerationLease>((accept, reject) => {
      const waiter = {
        signal,
        accept,
        reject,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        abort: () => undefined,
      };
      waiter.abort = () => {
        const index = this.#queue.indexOf(waiter);
        if (index < 0) return;
        this.#queue.splice(index, 1);
        clearTimeout(waiter.timer);
        signal.removeEventListener('abort', waiter.abort);
        reject(signal.reason);
      };
      waiter.timer = setTimeout(() => {
        const index = this.#queue.indexOf(waiter);
        if (index < 0) return;
        this.#queue.splice(index, 1);
        signal.removeEventListener('abort', waiter.abort);
        reject(new PublicAnswerConcurrencyError('public answer concurrency unavailable'));
      }, this.options.waitMs);
      signal.addEventListener('abort', waiter.abort, { once: true });
      this.#queue.push(waiter);
    });
  }

  #lease(): GenerationLease {
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        this.#releaseOne();
      },
    });
  }

  #releaseOne(): void {
    const waiter = this.#queue.shift();
    if (!waiter) {
      this.#running -= 1;
      return;
    }
    clearTimeout(waiter.timer);
    waiter.signal.removeEventListener('abort', waiter.abort);
    waiter.accept(this.#lease());
  }
}
