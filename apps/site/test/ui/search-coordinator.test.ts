import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicAskResponse } from '@beyondwin/contracts';
import {
  createPublicAskCoordinator,
  type CoordinatedAskResult,
} from '../../src/ui/search/publicAskCoordinator';
import {
  PublicAskTransportError,
  type PublicAskProvider,
} from '../../src/ui/search/publicAskProvider';

const answer: PublicAskResponse = {
  kind: 'search',
  reason: 'insufficient-evidence',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true, () => true),
    Promise.resolve(false),
  ]);
}

describe('public ask coordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('forwards one owned signal and returns the validated provider response', async () => {
    const signals: AbortSignal[] = [];
    const provider: PublicAskProvider = {
      ask: async (_question, options) => {
        signals.push(options.signal);
        return answer;
      },
    };
    const coordinator = createPublicAskCoordinator(provider);

    await expect(coordinator.submit('질문')).resolves.toEqual({
      kind: 'response',
      token: 1,
      response: answer,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
  });

  it('replaces an active submission with a stale result, aborts it, and advances the token once', async () => {
    const first = deferred<PublicAskResponse>();
    const signals: AbortSignal[] = [];
    let calls = 0;
    const provider: PublicAskProvider = {
      ask: (_question, options) => {
        calls += 1;
        signals.push(options.signal);
        return calls === 1 ? first.promise : Promise.resolve(answer);
      },
    };
    const coordinator = createPublicAskCoordinator(provider);

    const superseded = coordinator.submit('첫 질문');
    const current = coordinator.submit('둘째 질문');

    await expect(superseded).resolves.toEqual({ kind: 'stale', token: 1 });
    await expect(current).resolves.toEqual({ kind: 'response', token: 2, response: answer });
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    expect(calls).toBe(2);
  });

  it.each(['resolve', 'reject'] as const)(
    'consumes an abort-ignoring stale provider %s without publishing or creating an unhandled rejection',
    async (outcome) => {
      const first = deferred<PublicAskResponse>();
      let calls = 0;
      const provider: PublicAskProvider = {
        ask: () => {
          calls += 1;
          return calls === 1 ? first.promise : Promise.resolve(answer);
        },
      };
      const coordinator = createPublicAskCoordinator(provider);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        const stale = coordinator.submit('오래된 질문');
        const current = coordinator.submit('새 질문');
        await expect(stale).resolves.toEqual({ kind: 'stale', token: 1 });
        await expect(current).resolves.toMatchObject({ kind: 'response', token: 2 });

        if (outcome === 'resolve') first.resolve(answer);
        else first.reject(new Error('late rejection'));
        await vi.runAllTicks();
        await Promise.resolve();

        expect(unhandled).toEqual([]);
        expect(calls).toBe(2);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    },
  );

  it('settles an abort-ignoring never-settling provider at exactly 8,000ms without retrying', async () => {
    let calls = 0;
    let signal: AbortSignal | undefined;
    const provider: PublicAskProvider = {
      ask: (_question, options) => {
        calls += 1;
        signal = options.signal;
        return new Promise<PublicAskResponse>(() => undefined);
      },
    };
    const coordinator = createPublicAskCoordinator(provider);

    const result = coordinator.submit('끝나지 않는 질문');
    await vi.advanceTimersByTimeAsync(7_999);
    expect(await isSettled(result)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ kind: 'transport-error', token: 1, code: 'timeout' });
    expect(signal?.aborted).toBe(true);
    expect(calls).toBe(1);
  });

  it('settles a local-live 12,000ms deadline without changing the default 8,000ms abort', async () => {
    let calls = 0;
    let settled: CoordinatedAskResult | undefined;
    const provider: PublicAskProvider = {
      ask: () => {
        calls += 1;
        return new Promise<PublicAskResponse>(() => undefined);
      },
    };
    const coordinator = createPublicAskCoordinator(provider, { deadlineMs: 12_000 });
    const result = coordinator.submit('끝나지 않는 질문');
    void result.then((value) => { settled = value; });
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.resolve();
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3_999);
    await Promise.resolve();
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(settled).toEqual({ kind: 'transport-error', token: 1, code: 'timeout' });
    expect(calls).toBe(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps a timeout final when the provider later tries to %s',
    async (outcome) => {
      const providerResult = deferred<PublicAskResponse>();
      const provider: PublicAskProvider = { ask: () => providerResult.promise };
      const coordinator = createPublicAskCoordinator(provider);
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        const result = coordinator.submit('늦은 질문');
        await vi.advanceTimersByTimeAsync(8_000);
        await expect(result).resolves.toEqual({ kind: 'transport-error', token: 1, code: 'timeout' });

        if (outcome === 'resolve') providerResult.resolve(answer);
        else providerResult.reject(new Error('too late'));
        await vi.runAllTicks();
        await Promise.resolve();

        expect(unhandled).toEqual([]);
        await expect(result).resolves.toEqual({ kind: 'transport-error', token: 1, code: 'timeout' });
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    },
  );

  it('cancel settles the active submission immediately as aborted and does not wait for timeout', async () => {
    let signal: AbortSignal | undefined;
    const provider: PublicAskProvider = {
      ask: (_question, options) => {
        signal = options.signal;
        return new Promise<PublicAskResponse>(() => undefined);
      },
    };
    const coordinator = createPublicAskCoordinator(provider);
    const result = coordinator.submit('취소할 질문');

    coordinator.cancel();

    await expect(result).resolves.toEqual({ kind: 'aborted', token: 1 });
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toEqual({ kind: 'aborted', token: 1 });
  });

  it('supports navigation cancellation and permanently disposes an active coordinator', async () => {
    const provider: PublicAskProvider = {
      ask: () => new Promise<PublicAskResponse>(() => undefined),
    };
    const coordinator = createPublicAskCoordinator(provider);

    const popstateSubmission = coordinator.submit('popstate 질문');
    coordinator.cancel();
    await expect(popstateSubmission).resolves.toEqual({ kind: 'aborted', token: 1 });

    const pageshowSubmission = coordinator.submit('pageshow 질문');
    coordinator.cancel();
    await expect(pageshowSubmission).resolves.toEqual({ kind: 'aborted', token: 2 });

    const unmountSubmission = coordinator.submit('unmount 질문');
    coordinator.dispose();
    await expect(unmountSubmission).resolves.toEqual({ kind: 'aborted', token: 3 });
    await expect(coordinator.submit('금지된 질문')).rejects.toThrow('Coordinator disposed');
  });

  it.each([
    ['timeout', 'timeout'],
    ['unavailable', 'unavailable'],
    ['invalid-response', 'invalid-response'],
  ] as const)('maps a provider %s failure once without retrying', async (_label, code) => {
    let calls = 0;
    const provider: PublicAskProvider = {
      ask: async () => {
        calls += 1;
        throw new PublicAskTransportError(code);
      },
    };
    const coordinator = createPublicAskCoordinator(provider);

    const expected: CoordinatedAskResult = { kind: 'transport-error', token: 1, code };
    await expect(coordinator.submit('실패 질문')).resolves.toEqual(expected);
    expect(calls).toBe(1);
  });
});
