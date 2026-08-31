import type { ProviderStage, ProviderTokenUsage } from '../application/ports/usage-guard.js';

const reservations = Object.freeze({
  embedding: Object.freeze({ tokens: 2_000, cost: 260 }),
  generation: Object.freeze({ tokens: 6_500, cost: 6_750 }),
  semantic: Object.freeze({ tokens: 6_500, cost: 6_750 }),
});
const inputPrice = Object.freeze({ embedding: 130_000, generation: 750_000, semantic: 750_000 });
const outputPrice = Object.freeze({ embedding: 0, generation: 4_500_000, semantic: 4_500_000 });

export interface EvaluationUsageLimits {
  readonly maxApplicationRequests: number;
  readonly maxApplicationProviderTokens: number;
  readonly maxApplicationCostMicroUsd: number;
  readonly maxIndexProviderTokens: number;
  readonly maxIndexCostMicroUsd: number;
}

export class EvaluationUsageGuard {
  #applicationRequests = 0;
  #applicationProviderTokens = 0;
  #applicationCostMicroUsd = 0;
  #indexProviderTokens = 0;
  #indexCostMicroUsd = 0;

  constructor(private readonly limits: Readonly<EvaluationUsageLimits>) {}

  reserveIndex(tokens: number, costMicroUsd: number): void {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || this.#indexProviderTokens + tokens > this.limits.maxIndexProviderTokens) {
      throw new Error('evaluation index token maximum exceeded before call');
    }
    if (!Number.isSafeInteger(costMicroUsd) || costMicroUsd < 0 || this.#indexCostMicroUsd + costMicroUsd > this.limits.maxIndexCostMicroUsd) {
      throw new Error('evaluation index cost maximum exceeded before call');
    }
    this.#indexProviderTokens += tokens;
    this.#indexCostMicroUsd += costMicroUsd;
  }

  settleIndex(tokens: number, costMicroUsd: number): void {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > this.#indexProviderTokens
      || !Number.isSafeInteger(costMicroUsd) || costMicroUsd < 0 || costMicroUsd > this.#indexCostMicroUsd) {
      throw new Error('evaluation index measured usage exceeds its reservation');
    }
    this.#indexProviderTokens = tokens;
    this.#indexCostMicroUsd = costMicroUsd;
  }

  beginApplicationRequest(): Readonly<{
    beginStage(stage: ProviderStage): void;
    settleStage(stage: ProviderStage, usage: ProviderTokenUsage): void;
    release(): void;
  }> {
    const worstTokens = 15_000;
    const worstCost = 13_760;
    if (this.#applicationRequests + 1 > this.limits.maxApplicationRequests) throw new Error('evaluation application request 181 exceeds maximum before call');
    if (this.#applicationProviderTokens + worstTokens > this.limits.maxApplicationProviderTokens) throw new Error('evaluation application token maximum exceeded before call');
    if (this.#applicationCostMicroUsd + worstCost > this.limits.maxApplicationCostMicroUsd) throw new Error('evaluation application cost maximum exceeded before call');
    this.#applicationRequests += 1;
    this.#applicationProviderTokens += worstTokens;
    this.#applicationCostMicroUsd += worstCost;
    const states: Record<ProviderStage, 'unused' | 'attempted' | 'settled'> = { embedding: 'unused', generation: 'unused', semantic: 'unused' };
    let released = false;
    const ensure = () => { if (released) throw new Error('evaluation usage lease is released'); };
    return Object.freeze({
      beginStage: (stage: ProviderStage) => {
        ensure();
        if (states[stage] !== 'unused') throw new Error('evaluation provider stage already begun');
        states[stage] = 'attempted';
      },
      settleStage: (stage: ProviderStage, usage: ProviderTokenUsage) => {
        ensure();
        if (states[stage] !== 'attempted') throw new Error('evaluation provider stage must be attempted exactly once');
        const limit = stage === 'embedding' ? usage.outputTokens === 0 && usage.inputTokens <= 2_000
          : usage.inputTokens <= 6_000 && usage.outputTokens <= 500;
        if (!Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 || !Number.isSafeInteger(usage.outputTokens)
          || usage.outputTokens < 0 || !limit) throw new Error('evaluation provider stage usage is invalid');
        const actualTokens = usage.inputTokens + usage.outputTokens;
        const actualCost = Math.ceil((usage.inputTokens * inputPrice[stage] + usage.outputTokens * outputPrice[stage]) / 1_000_000);
        this.#applicationProviderTokens += actualTokens - reservations[stage].tokens;
        this.#applicationCostMicroUsd += actualCost - reservations[stage].cost;
        states[stage] = 'settled';
      },
      release: () => {
        if (released) return;
        released = true;
        for (const stage of ['embedding', 'generation', 'semantic'] as const) {
          if (states[stage] === 'unused') {
            this.#applicationProviderTokens -= reservations[stage].tokens;
            this.#applicationCostMicroUsd -= reservations[stage].cost;
          }
        }
      },
    });
  }

  snapshot(): Readonly<{
    applicationRequests: number; applicationProviderTokens: number; applicationCostMicroUsd: number;
    indexProviderTokens: number; indexCostMicroUsd: number;
  }> {
    return Object.freeze({
      applicationRequests: this.#applicationRequests,
      applicationProviderTokens: this.#applicationProviderTokens,
      applicationCostMicroUsd: this.#applicationCostMicroUsd,
      indexProviderTokens: this.#indexProviderTokens,
      indexCostMicroUsd: this.#indexCostMicroUsd,
    });
  }
}
