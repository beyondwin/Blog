import { readFile } from 'node:fs/promises';

import type {
  ProviderStage,
  ProviderTokenUsage,
  UsageGuard,
  UsageLease,
} from '../../application/ports/usage-guard.js';
import { PUBLIC_ANSWER_REQUEST_TIMEOUT_MS } from '../../application/ports/usage-guard.js';
import { PublicAnswerCostLimitError, PublicAnswerRateLimitError } from '../../domain/public-answer-errors.js';
import { canonicalProviderJson, exactObject, providerChecksum } from '../openai/provider-json.js';
import { FifoSemaphore } from './fifo-semaphore.js';

export const REQUEST_BODY_BYTES = 4_096;
export const QUESTION_CODE_POINTS_MIN = 1;
export const QUESTION_CODE_POINTS_MAX = 500;
export const REQUEST_TIMEOUT_MS = PUBLIC_ANSWER_REQUEST_TIMEOUT_MS;
export const PROVIDER_INPUT_TOKEN_UPPER_BOUND = 6_000;
export const EVIDENCE_TOKEN_UPPER_BOUND = 4_000;
export const PROVIDER_OUTPUT_TOKENS = 500;
export const MAX_GENERATION_ATTEMPTS = 1;
export const MAX_SEMANTIC_ATTEMPTS = 1;
export const GLOBAL_RUNNING = 4;
export const GLOBAL_QUEUED = 8;
export const QUEUE_WAIT_MS = 2_000;
export const NETWORK_BURST_CAPACITY = 3;
export const NETWORK_BURST_REFILL_MS = 20_000;
export const NETWORK_HOURLY = 20;
export const NETWORK_DAILY = 40;
export const GLOBAL_DAILY = 150;
export const DAILY_PROVIDER_TOKENS = 2_250_000;
export const DAILY_PROVIDER_COST_MICROUSD = 2_100_000;
export const WORST_CASE_PROVIDER_TOKENS = 15_000;
export const WORST_CASE_COST_MICROUSD = 13_760;
const PROVIDER_PRICING_RECEIPT_HASH = 'sha256:857a4cbb29eed073fe9725f7bb1ec5f88ea8763d9b914fce727dcb74067aa8a4';

export interface RuntimeProviderPricing {
  readonly receiptHash: string;
  readonly embeddingInputMicroUsdPerMillionTokens: number;
  readonly responsesInputMicroUsdPerMillionTokens: number;
  readonly responsesOutputMicroUsdPerMillionTokens: number;
}

export async function readRuntimeProviderPricing(
  source: URL = new URL('../openai/provider-pricing.v1.json', import.meta.url),
): Promise<Readonly<RuntimeProviderPricing>> {
  const bytes = await readFile(source);
  const parsed = exactObject(JSON.parse(bytes.toString('utf8')), ['canonicalHash','models','observedAt','rounding','schemaVersion','sources']);
  const models = exactObject(parsed.models, ['gpt-5.4-mini-2026-03-17','text-embedding-3-large']);
  const embedding = exactObject(models['text-embedding-3-large'], ['inputMicroUsdPerMillionTokens','outputMicroUsdPerMillionTokens']);
  const responses = exactObject(models['gpt-5.4-mini-2026-03-17'], ['inputMicroUsdPerMillionTokens','outputMicroUsdPerMillionTokens']);
  const { canonicalHash, ...body } = parsed;
  if (parsed.schemaVersion !== 1 || parsed.observedAt !== '2026-08-30' || parsed.rounding !== 'ceil-micro-usd-per-operation'
    || !Array.isArray(parsed.sources) || parsed.sources.length !== 2
    || parsed.sources.some((source) => typeof source !== 'string' || !source.startsWith('https://platform.openai.com/'))
    || embedding.inputMicroUsdPerMillionTokens !== 130_000 || embedding.outputMicroUsdPerMillionTokens !== 0
    || responses.inputMicroUsdPerMillionTokens !== 750_000 || responses.outputMicroUsdPerMillionTokens !== 4_500_000
    || canonicalHash !== PROVIDER_PRICING_RECEIPT_HASH || canonicalHash !== providerChecksum(body)
    || bytes.toString('utf8') !== `${canonicalProviderJson(parsed)}\n`) throw new Error('bundled runtime pricing receipt is invalid');
  return Object.freeze({
    receiptHash: canonicalHash as string,
    embeddingInputMicroUsdPerMillionTokens: 130_000,
    responsesInputMicroUsdPerMillionTokens: 750_000,
    responsesOutputMicroUsdPerMillionTokens: 4_500_000,
  });
}

interface NetworkUsage {
  burstTokens: number;
  burstAt: number;
  hourly: number[];
  day: string;
  dailyCount: number;
  lastSeen: number;
}

interface DailyBudget {
  readonly day: string;
  requests: number;
  providerTokens: number;
  providerCostMicroUsd: number;
}

interface StageState {
  state: 'unused' | 'attempted' | 'settled';
  readonly reservedTokens: number;
  readonly reservedCost: number;
}

const STAGE_RESERVATIONS: Readonly<Record<ProviderStage, Readonly<{ tokens: number; cost: number }>>> = Object.freeze({
  embedding: Object.freeze({ tokens: 2_000, cost: 260 }),
  generation: Object.freeze({ tokens: 6_500, cost: 6_750 }),
  semantic: Object.freeze({ tokens: 6_500, cost: 6_750 }),
});

function utcDay(now: number): string { return new Date(now).toISOString().slice(0, 10); }

export interface InMemoryUsageGuardOptions {
  readonly clock?: () => number;
  readonly semaphore?: FifoSemaphore;
}

export class InMemoryUsageGuard implements UsageGuard {
  readonly #clock: () => number;
  readonly #pricing: Readonly<RuntimeProviderPricing>;
  readonly #semaphore: FifoSemaphore;
  readonly #networks = new Map<string, NetworkUsage>();
  #budget: DailyBudget;

  private constructor(options: InMemoryUsageGuardOptions, pricing: Readonly<RuntimeProviderPricing>) {
    this.#clock = options.clock ?? Date.now;
    this.#pricing = pricing;
    this.#semaphore = options.semaphore ?? new FifoSemaphore({ running: GLOBAL_RUNNING, queued: GLOBAL_QUEUED, waitMs: QUEUE_WAIT_MS });
    this.#budget = { day: utcDay(this.#clock()), requests: 0, providerTokens: 0, providerCostMicroUsd: 0 };
  }

  static async create(options: InMemoryUsageGuardOptions = {}): Promise<InMemoryUsageGuard> {
    return new InMemoryUsageGuard(options, await readRuntimeProviderPricing());
  }

  async acquire(input: { networkKey: string; requestId: string; signal: AbortSignal }): Promise<UsageLease> {
    input.signal.throwIfAborted();
    const now = this.#clock();
    const day = utcDay(now);
    if (this.#budget.day !== day) this.#budget = { day, requests: 0, providerTokens: 0, providerCostMicroUsd: 0 };
    this.#cleanup(now);
    const existing = this.#networks.get(input.networkKey);
    const network: NetworkUsage = existing ?? {
      burstTokens: NETWORK_BURST_CAPACITY, burstAt: now, hourly: [], day, dailyCount: 0, lastSeen: now,
    };
    const elapsed = Math.max(0, now - network.burstAt);
    const burstTokens = Math.min(NETWORK_BURST_CAPACITY, network.burstTokens + elapsed / NETWORK_BURST_REFILL_MS);
    const hourly = network.hourly.filter((timestamp) => timestamp > now - 3_600_000);
    const dailyCount = network.day === day ? network.dailyCount : 0;
    if (burstTokens < 1) throw new PublicAnswerRateLimitError('public answer network burst exceeded', 'network-burst');
    if (hourly.length >= NETWORK_HOURLY) throw new PublicAnswerRateLimitError('public answer network hour exceeded', 'network-hour');
    if (dailyCount >= NETWORK_DAILY) throw new PublicAnswerRateLimitError('public answer network day exceeded', 'network-day');
    if (this.#budget.requests >= GLOBAL_DAILY) throw new PublicAnswerRateLimitError('public answer global day exceeded', 'global-day');
    if (this.#budget.providerTokens + WORST_CASE_PROVIDER_TOKENS > DAILY_PROVIDER_TOKENS
      || this.#budget.providerCostMicroUsd + WORST_CASE_COST_MICROUSD > DAILY_PROVIDER_COST_MICROUSD) {
      throw new PublicAnswerCostLimitError('public answer provider budget exceeded');
    }
    network.burstTokens = burstTokens - 1;
    network.burstAt = now;
    network.hourly = [...hourly, now];
    network.day = day;
    network.dailyCount = dailyCount + 1;
    network.lastSeen = now;
    this.#networks.set(input.networkKey, network);
    this.#budget.requests += 1;
    this.#budget.providerTokens += WORST_CASE_PROVIDER_TOKENS;
    this.#budget.providerCostMicroUsd += WORST_CASE_COST_MICROUSD;
    return this.#lease(this.#budget);
  }

  usageTotals(): Readonly<{ providerTokens: number; providerCostMicroUsd: number }> {
    return Object.freeze({ providerTokens: this.#budget.providerTokens, providerCostMicroUsd: this.#budget.providerCostMicroUsd });
  }

  operationalSnapshot(): Readonly<{ day: string; requests: number; providerTokens: number; providerCostMicroUsd: number; networkEntries: number }> {
    return Object.freeze({ day: this.#budget.day, requests: this.#budget.requests,
      providerTokens: this.#budget.providerTokens, providerCostMicroUsd: this.#budget.providerCostMicroUsd,
      networkEntries: this.#networks.size });
  }

  #cleanup(now: number): void {
    let examined = 0;
    for (const [key, value] of this.#networks) {
      if (examined >= 16) break;
      examined += 1;
      this.#networks.delete(key);
      if (now - value.lastSeen <= 25 * 3_600_000) this.#networks.set(key, value);
    }
  }

  #lease(budget: DailyBudget): UsageLease {
    const stages: Record<ProviderStage, StageState> = {
      embedding: { state: 'unused', reservedTokens: 2_000, reservedCost: 260 },
      generation: { state: 'unused', reservedTokens: 6_500, reservedCost: 6_750 },
      semantic: { state: 'unused', reservedTokens: 6_500, reservedCost: 6_750 },
    };
    let released = false;
    let generationAttempted = false;
    const ensureActive = () => { if (released) throw new Error('usage lease is released'); };
    return Object.freeze({
      acquireGeneration: async (signal: AbortSignal) => {
        ensureActive();
        if (generationAttempted) throw new Error('generation lease already attempted');
        generationAttempted = true;
        return this.#semaphore.acquire(signal);
      },
      beginStage: (stage: ProviderStage) => {
        ensureActive();
        const state = stages[stage];
        if (!state || state.state !== 'unused') throw new Error('provider stage already begun');
        state.state = 'attempted';
      },
      settleStage: (stage: ProviderStage, usage: ProviderTokenUsage) => {
        ensureActive();
        const state = stages[stage];
        if (!state || state.state === 'unused') throw new Error('provider stage must begin before settlement');
        if (state.state === 'settled') throw new Error('provider stage already settled');
        const limit = stage === 'embedding'
          ? usage.outputTokens === 0 && usage.inputTokens <= 2_000
          : usage.inputTokens <= PROVIDER_INPUT_TOKEN_UPPER_BOUND && usage.outputTokens <= PROVIDER_OUTPUT_TOKENS;
        if (!Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
          || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0 || !limit) throw new Error('provider stage usage is invalid');
        const price = stage === 'embedding'
          ? this.#pricing.embeddingInputMicroUsdPerMillionTokens
          : this.#pricing.responsesInputMicroUsdPerMillionTokens;
        const outputPrice = stage === 'embedding' ? 0 : this.#pricing.responsesOutputMicroUsdPerMillionTokens;
        const actualTokens = usage.inputTokens + usage.outputTokens;
        const actualCost = Math.ceil((usage.inputTokens * price + usage.outputTokens * outputPrice) / 1_000_000);
        budget.providerTokens += actualTokens - state.reservedTokens;
        budget.providerCostMicroUsd += actualCost - state.reservedCost;
        state.state = 'settled';
      },
      release: () => {
        if (released) return;
        released = true;
        for (const state of Object.values(stages)) {
          if (state.state !== 'unused') continue;
          budget.providerTokens -= state.reservedTokens;
          budget.providerCostMicroUsd -= state.reservedCost;
        }
      },
    });
  }
}
