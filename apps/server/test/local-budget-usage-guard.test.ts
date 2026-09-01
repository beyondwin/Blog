import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PublicAnswerCostLimitError, PublicAnswerRateLimitError } from '../src/modules/public-answer/domain/public-answer-errors.js';
import { LocalBudgetLedger } from '../src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { LocalBudgetUsageGuard } from '../src/modules/public-answer/infrastructure/guards/local-budget-usage-guard.js';
import {
  InMemoryUsageGuard,
  WORST_CASE_COST_MICROUSD,
} from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import {
  PROVIDER_MODEL_POLICY,
  providerOperationCostMicroUsd,
} from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

const roots: string[] = [];
const signal = () => new AbortController().signal;
const SEPTEMBER = Date.parse('2026-09-02T10:00:00.000Z');
const REQUEST_COST = WORST_CASE_COST_MICROUSD;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function embeddingTokensForCost(cost: number): number {
  const tokens = Math.floor((cost - 1) * 1_000_000 / PROVIDER_MODEL_POLICY.prices.embeddingInput) + 1;
  if (providerOperationCostMicroUsd('corpus-embedding', { inputTokens: tokens, outputTokens: 0 }) !== cost) {
    throw new Error(`no embedding token count for ${cost}`);
  }
  return tokens;
}

async function openGuard() {
  const root = await mkdtemp(join(tmpdir(), 'local-budget-guard-'));
  roots.push(root);
  const path = join(root, 'budget-ledger.json');
  const ledger = await LocalBudgetLedger.open(path, { clock: () => SEPTEMBER, hardCapMicroUsd: 1_000_000 });
  const inner = await InMemoryUsageGuard.create({ clock: () => SEPTEMBER });
  const guard = await LocalBudgetUsageGuard.create({ ledger, inner });
  return { inner, ledger, guard, path };
}

describe('LocalBudgetUsageGuard', () => {
  it('reserves query embedding, generation, and semantic maxima in one bundle before any stage callback', async () => {
    const { guard, ledger } = await openGuard();
    const lease = await guard.acquire({ networkKey: 'network', requestId: 'request', signal: signal() });
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: REQUEST_COST, availableMicroUsd: 1_000_000 - REQUEST_COST });
    lease.beginStage('embedding');
    lease.settleStage('embedding', { inputTokens: 13, outputTokens: 0 });
    lease.beginStage('generation');
    lease.settleStage('generation', { inputTokens: 200, outputTokens: 40 });
    await lease.release();
    expect(await ledger.snapshot()).toMatchObject({
      chargedMicroUsd: providerOperationCostMicroUsd('query-embedding', { inputTokens: 13, outputTokens: 0 })
        + providerOperationCostMicroUsd('generation', { inputTokens: 200, outputTokens: 40 }),
    });
  });

  it('rejects a second concurrent exact-cap acquire before any provider-stage callback', async () => {
    const { guard, ledger } = await openGuard();
    await ledger.reserve({
      operation: 'corpus-embedding',
      maxUsage: { inputTokens: embeddingTokensForCost(1_000_000 - REQUEST_COST), outputTokens: 0 },
    });
    const begun: string[] = [];
    const attempts = ['a', 'b'].map(async (id) => {
      const lease = await guard.acquire({ networkKey: id, requestId: id, signal: signal() });
      begun.push(id);
      lease.beginStage('embedding');
      return lease;
    });
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PublicAnswerCostLimitError);
    expect(begun).toEqual([expect.stringMatching(/^[ab]$/u)]);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 1_000_000, availableMicroUsd: 0 });
    await (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof guard.acquire>>>).value.release();
  });

  it('preserves in-memory traffic controls and does not charge the ledger on a rate-limit rejection', async () => {
    const { guard, ledger, inner } = await openGuard();
    for (let index = 0; index < 3; index += 1) {
      await (await guard.acquire({ networkKey: 'same', requestId: String(index), signal: signal() })).release();
    }
    await expect(guard.acquire({ networkKey: 'same', requestId: 'burst', signal: signal() }))
      .rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 0 });
    expect(inner.usageTotals()).toEqual({ providerTokens: 0, providerCostMicroUsd: 0 });
  });

  it('releases the inner lease when the monthly cap rejects the bundle', async () => {
    const { guard, ledger, inner } = await openGuard();
    await ledger.reserve({
      operation: 'corpus-embedding',
      maxUsage: { inputTokens: embeddingTokensForCost(1_000_000), outputTokens: 0 },
    });
    await expect(guard.acquire({ networkKey: 'network', requestId: 'request', signal: signal() }))
      .rejects.toBeInstanceOf(PublicAnswerCostLimitError);
    expect(inner.usageTotals()).toEqual({ providerTokens: 0, providerCostMicroUsd: 0 });
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 1_000_000 });
  });

  it('refunds unused stages, settles measured usage, and keeps attempted unsettled stages ambiguous', async () => {
    const { guard, ledger, path } = await openGuard();
    const unused = await guard.acquire({ networkKey: 'unused', requestId: 'unused', signal: signal() });
    await unused.release();
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 0 });

    const settled = await guard.acquire({ networkKey: 'settled', requestId: 'settled', signal: signal() });
    settled.beginStage('embedding');
    settled.settleStage('embedding', { inputTokens: 10, outputTokens: 0 });
    await settled.release();
    expect(await ledger.snapshot()).toMatchObject({
      chargedMicroUsd: providerOperationCostMicroUsd('query-embedding', { inputTokens: 10, outputTokens: 0 }),
    });

    const ambiguous = await guard.acquire({ networkKey: 'ambiguous', requestId: 'ambiguous', signal: signal() });
    ambiguous.beginStage('generation');
    await ambiguous.release();
    const generationCost = providerOperationCostMicroUsd('generation', { inputTokens: 6_000, outputTokens: 500 });
    expect(await ledger.snapshot()).toMatchObject({
      chargedMicroUsd: providerOperationCostMicroUsd('query-embedding', { inputTokens: 10, outputTokens: 0 }) + generationCost,
    });
    expect(await readFile(path, 'utf8')).not.toMatch(/question|answer|excerpt|api[_-]?key|\/articles\//iu);
  });

  it('returns a promise from release and is idempotent', async () => {
    const { guard } = await openGuard();
    const lease = await guard.acquire({ networkKey: 'network', requestId: 'request', signal: signal() });
    const first = lease.release();
    expect(first).toBeInstanceOf(Promise);
    await first;
    await lease.release();
  });
});
