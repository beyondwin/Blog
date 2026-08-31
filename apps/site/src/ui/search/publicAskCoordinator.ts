import type { PublicAskResponse } from '@beyondwin/contracts';
import {
  PublicAskTransportError,
  type PublicAskProvider,
  type PublicAskTransportCode,
} from './publicAskProvider';

export type CoordinatedAskResult =
  | { kind: 'response'; token: number; response: PublicAskResponse }
  | { kind: 'transport-error'; token: number; code: PublicAskTransportCode }
  | { kind: 'aborted'; token: number }
  | { kind: 'stale'; token: number };

export interface PublicAskCoordinator {
  submit(question: string): Promise<CoordinatedAskResult>;
  cancel(): void;
  dispose(): void;
}

interface ActiveSubmission {
  token: number;
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
  settleCancel: (kind: 'aborted' | 'stale') => void;
}

const REQUEST_DEADLINE_MS = 8_000;

export function createPublicAskCoordinator(provider: PublicAskProvider): PublicAskCoordinator {
  let active: ActiveSubmission | null = null;
  let lastToken = 0;
  let disposed = false;

  const settleActive = (kind: 'aborted' | 'stale') => {
    const submission = active;
    if (!submission) return;
    active = null;
    clearTimeout(submission.timeoutId);
    submission.settleCancel(kind);
    submission.controller.abort();
  };

  return {
    async submit(question) {
      if (disposed) throw new Error('Coordinator disposed');
      settleActive('stale');

      const token = ++lastToken;
      const controller = new AbortController();
      let settleCancel!: (kind: 'aborted' | 'stale') => void;
      const cancelOutcome = new Promise<CoordinatedAskResult>((resolve) => {
        settleCancel = (kind) => resolve({ kind, token });
      });
      const deadlineOutcome = new Promise<CoordinatedAskResult>((resolve) => {
        const timeoutId = setTimeout(() => {
          if (active?.token !== token) return;
          active = null;
          controller.abort();
          resolve({ kind: 'transport-error', token, code: 'timeout' });
        }, REQUEST_DEADLINE_MS);
        active = { token, controller, timeoutId, settleCancel };
      });

      let request: Promise<PublicAskResponse>;
      try {
        request = provider.ask(question, { signal: controller.signal });
      } catch (error) {
        request = Promise.reject(error);
      }
      const providerOutcome = request.then<CoordinatedAskResult, CoordinatedAskResult>(
        (response) => active?.token === token
          ? { kind: 'response', token, response }
          : { kind: 'stale', token },
        (error: unknown) => {
          if (active?.token !== token) return { kind: 'stale', token };
          const code = error instanceof PublicAskTransportError ? error.code : 'unavailable';
          return { kind: 'transport-error', token, code };
        },
      );

      try {
        return await Promise.race([providerOutcome, cancelOutcome, deadlineOutcome]);
      } finally {
        if (active?.token === token) {
          clearTimeout(active.timeoutId);
          active = null;
        }
      }
    },
    cancel() {
      settleActive('aborted');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      settleActive('aborted');
    },
  };
}
