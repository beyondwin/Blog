import type {
  ProviderStage,
  ProviderTokenUsage,
  UsageGuard,
  UsageLease,
} from '../../application/ports/usage-guard.js';
import {
  InMemoryUsageGuard,
  PROVIDER_INPUT_TOKEN_UPPER_BOUND,
  PROVIDER_OUTPUT_TOKENS,
} from './in-memory-usage-guard.js';
import type { LocalBudgetLedger, LocalBudgetReservation } from './local-budget-ledger.js';

const BUNDLE = Object.freeze([
  Object.freeze({ operation: 'query-embedding' as const, maxUsage: Object.freeze({ inputTokens: 2_000, outputTokens: 0 }) }),
  Object.freeze({
    operation: 'generation' as const,
    maxUsage: Object.freeze({ inputTokens: PROVIDER_INPUT_TOKEN_UPPER_BOUND, outputTokens: PROVIDER_OUTPUT_TOKENS }),
  }),
  Object.freeze({
    operation: 'semantic' as const,
    maxUsage: Object.freeze({ inputTokens: PROVIDER_INPUT_TOKEN_UPPER_BOUND, outputTokens: PROVIDER_OUTPUT_TOKENS }),
  }),
]);

const STAGES = ['embedding', 'generation', 'semantic'] as const satisfies readonly ProviderStage[];

export interface LocalBudgetUsageGuardOptions {
  readonly ledger: LocalBudgetLedger;
  readonly inner?: InMemoryUsageGuard;
}

export class LocalBudgetUsageGuard implements UsageGuard {
  readonly #ledger: LocalBudgetLedger;
  readonly #inner: InMemoryUsageGuard;

  private constructor(ledger: LocalBudgetLedger, inner: InMemoryUsageGuard) {
    this.#ledger = ledger;
    this.#inner = inner;
  }

  static async create(options: LocalBudgetUsageGuardOptions): Promise<LocalBudgetUsageGuard> {
    return new LocalBudgetUsageGuard(options.ledger, options.inner ?? await InMemoryUsageGuard.create());
  }

  async acquire(input: {
    networkKey: string;
    requestId: string;
    signal: AbortSignal;
  }): Promise<UsageLease> {
    const innerLease = await this.#inner.acquire(input);
    try {
      const reservations = await this.#ledger.reserveBundle(BUNDLE);
      return this.#lease(innerLease, {
        embedding: requiredReservation(reservations[0]),
        generation: requiredReservation(reservations[1]),
        semantic: requiredReservation(reservations[2]),
      });
    } catch (error) {
      await innerLease.release();
      throw error;
    }
  }

  #lease(
    innerLease: UsageLease,
    reservations: Readonly<Record<ProviderStage, LocalBudgetReservation>>,
  ): UsageLease {
    const stages: Record<ProviderStage, 'unused' | 'attempted' | 'settled'> = {
      embedding: 'unused',
      generation: 'unused',
      semantic: 'unused',
    };
    let pending: Promise<void> = Promise.resolve();
    let pendingError: unknown;
    let released = false;
    const enqueue = (work: () => Promise<void>): void => {
      pending = pending.then(async () => {
        if (pendingError) return;
        try { await work(); } catch (error) { pendingError = error; }
      });
    };
    const ensureActive = () => { if (released) throw new Error('usage lease is released'); };
    return Object.freeze({
      acquireGeneration: (signal: AbortSignal) => {
        ensureActive();
        return innerLease.acquireGeneration(signal);
      },
      beginStage: (stage: ProviderStage) => {
        ensureActive();
        innerLease.beginStage(stage);
        stages[stage] = 'attempted';
        enqueue(() => reservations[stage].begin());
      },
      settleStage: (stage: ProviderStage, usage: ProviderTokenUsage) => {
        ensureActive();
        innerLease.settleStage(stage, usage);
        stages[stage] = 'settled';
        enqueue(() => reservations[stage].settle(usage));
      },
      release: async () => {
        if (released) return;
        released = true;
        await pending;
        await innerLease.release();
        for (const stage of STAGES) {
          if (stages[stage] !== 'unused') continue;
          await reservations[stage].releaseUnattempted();
        }
        if (pendingError) throw pendingError;
      },
    });
  }
}

function requiredReservation(reservation: LocalBudgetReservation | undefined): LocalBudgetReservation {
  if (!reservation) throw new Error('budget ledger reservation is invalid');
  return reservation;
}
