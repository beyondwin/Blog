import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DAILY_PROVIDER_COST_MICROUSD,
  DAILY_PROVIDER_TOKENS,
  GLOBAL_DAILY,
  InMemoryUsageGuard,
  WORST_CASE_COST_MICROUSD,
  WORST_CASE_PROVIDER_TOKENS,
  readRuntimeProviderPricing,
} from '../src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { FifoSemaphore } from '../src/modules/public-answer/infrastructure/guards/fifo-semaphore.js';
import { PublicAnswerConcurrencyError, PublicAnswerRateLimitError } from '../src/modules/public-answer/domain/public-answer-errors.js';
import { canonicalProviderJson, providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';

const signal = () => new AbortController().signal;

afterEach(() => vi.useRealTimers());

describe('runtime pricing receipt', () => {
  it('strict-reads the sealed prices and proves the 150-request reservation arithmetic', async () => {
    const pricing = await readRuntimeProviderPricing();
    expect(pricing).toEqual({
      receiptHash: 'sha256:857a4cbb29eed073fe9725f7bb1ec5f88ea8763d9b914fce727dcb74067aa8a4',
      embeddingInputMicroUsdPerMillionTokens: 130_000,
      responsesInputMicroUsdPerMillionTokens: 750_000,
      responsesOutputMicroUsdPerMillionTokens: 4_500_000,
    });
    expect(WORST_CASE_PROVIDER_TOKENS).toBe(15_000);
    expect(WORST_CASE_COST_MICROUSD).toBe(13_760);
    expect(GLOBAL_DAILY * WORST_CASE_PROVIDER_TOKENS).toBe(DAILY_PROVIDER_TOKENS);
    expect(GLOBAL_DAILY * WORST_CASE_COST_MICROUSD).toBeLessThanOrEqual(DAILY_PROVIDER_COST_MICROUSD);
  });

  it('rejects a canonically self-hashed substitution for the pinned pricing receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-pricing-'));
    try {
      const bundled = JSON.parse(await readFile(new URL('../src/modules/public-answer/infrastructure/openai/provider-pricing.v1.json', import.meta.url), 'utf8')) as Record<string, unknown>;
      const { canonicalHash: _, ...body } = bundled;
      const substitutedBody = { ...body, sources: ['https://platform.openai.com/docs/pricing', 'https://platform.openai.com/docs/pricing#embeddings'] };
      const substituted = { canonicalHash: providerChecksum(substitutedBody), ...substitutedBody };
      const path = join(root, 'pricing.json');
      await writeFile(path, `${canonicalProviderJson(substituted)}\n`);
      await expect(readRuntimeProviderPricing(new URL(`file://${path}`))).rejects.toThrow(/pricing receipt/u);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('FifoSemaphore', () => {
  it('grants in FIFO order and releases every permit idempotently', async () => {
    const semaphore = new FifoSemaphore({ running: 1, queued: 2, waitMs: 2_000 });
    const first = await semaphore.acquire(signal());
    const order: string[] = [];
    const second = semaphore.acquire(signal()).then((lease) => { order.push('second'); return lease; });
    const third = semaphore.acquire(signal()).then((lease) => { order.push('third'); return lease; });
    first.release(); first.release();
    const secondLease = await second;
    expect(order).toEqual(['second']);
    secondLease.release();
    const thirdLease = await third;
    expect(order).toEqual(['second', 'third']);
    thirdLease.release();
  });

  it('rejects queue overflow and a two-second wait with the same typed concurrency error', async () => {
    vi.useFakeTimers();
    const semaphore = new FifoSemaphore({ running: 1, queued: 1, waitMs: 2_000 });
    const first = await semaphore.acquire(signal());
    const waiting = semaphore.acquire(signal());
    await expect(semaphore.acquire(signal())).rejects.toBeInstanceOf(PublicAnswerConcurrencyError);
    await vi.advanceTimersByTimeAsync(1_999);
    let settled = false; void waiting.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(waiting).rejects.toBeInstanceOf(PublicAnswerConcurrencyError);
    first.release();
  });

  it('removes an aborted waiter without consuming the next FIFO permit', async () => {
    const semaphore = new FifoSemaphore({ running: 1, queued: 2, waitMs: 2_000 });
    const first = await semaphore.acquire(signal());
    const aborted = new AbortController();
    const second = semaphore.acquire(aborted.signal);
    const third = semaphore.acquire(signal());
    const reason = new Error('abort-sentinel');
    aborted.abort(reason);
    await expect(second).rejects.toBe(reason);
    first.release();
    const thirdLease = await third;
    thirdLease.release();
  });
});

describe('InMemoryUsageGuard', () => {
  it('enforces burst capacity, continuous refill, and does not consume a refilled token on rejection', async () => {
    let now = Date.parse('2026-08-30T00:00:00.000Z');
    const guard = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 3; index += 1) (await guard.acquire({ networkKey: 'same', requestId: String(index), signal: signal() })).release();
    await expect(guard.acquire({ networkKey: 'same', requestId: 'burst', signal: signal() })).rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    now += 19_999;
    await expect(guard.acquire({ networkKey: 'same', requestId: 'early', signal: signal() })).rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    now += 1;
    (await guard.acquire({ networkKey: 'same', requestId: 'refilled', signal: signal() })).release();
  });

  it('uses a true rolling hour, UTC network day, and UTC global reset', async () => {
    const first = Date.parse('2026-08-30T00:00:00.000Z');
    let now = first;
    const guard = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 20; index += 1) {
      (await guard.acquire({ networkKey: 'hourly', requestId: `h${index}`, signal: signal() })).release();
      now += 60_000;
    }
    await expect(guard.acquire({ networkKey: 'hourly', requestId: 'hour-limit', signal: signal() })).rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    now = first + 3_599_999;
    await expect(guard.acquire({ networkKey: 'hourly', requestId: 'hour-edge-minus-one', signal: signal() })).rejects.toMatchObject({ rateBucket: 'network-hour' });
    now = first + 3_600_000;
    (await guard.acquire({ networkKey: 'hourly', requestId: 'hour-edge', signal: signal() })).release();
    now = Date.parse('2026-08-30T20:00:00.000Z');
    for (let index = 0; index < 40; index += 1) {
      (await guard.acquire({ networkKey: 'daily', requestId: `d${index}`, signal: signal() })).release();
      now += 180_000;
    }
    await expect(guard.acquire({ networkKey: 'daily', requestId: 'day-limit', signal: signal() })).rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    now = Date.parse('2026-08-31T00:00:00.000Z');
    (await guard.acquire({ networkKey: 'daily', requestId: 'new-day', signal: signal() })).release();
  });

  it('admits the 150th global request and rejects the 151st before reserving more provider budget', async () => {
    const guard = await InMemoryUsageGuard.create({ clock: () => Date.parse('2026-08-30T12:00:00.000Z') });
    const leases = [];
    for (let index = 0; index < 150; index += 1) leases.push(await guard.acquire({ networkKey: `network-${index}`, requestId: String(index), signal: signal() }));
    expect(guard.usageTotals()).toEqual({ providerTokens: 2_250_000, providerCostMicroUsd: 2_064_000 });
    await expect(guard.acquire({ networkKey: 'network-150', requestId: '150', signal: signal() })).rejects.toBeInstanceOf(PublicAnswerRateLimitError);
    expect(guard.usageTotals()).toEqual({ providerTokens: 2_250_000, providerCostMicroUsd: 2_064_000 });
    for (const lease of leases) lease.release();
  });

  it('resets a saturated 150-request global budget only at the next UTC date', async () => {
    let now = Date.parse('2026-08-30T23:59:59.999Z');
    const guard = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 150; index += 1) (await guard.acquire({ networkKey: `utc-${index}`, requestId: String(index), signal: signal() })).release();
    await expect(guard.acquire({ networkKey: 'utc-rejected', requestId: 'rejected', signal: signal() })).rejects.toMatchObject({ rateBucket: 'global-day' });
    now += 1;
    const lease = await guard.acquire({ networkKey: 'utc-new-day', requestId: 'new-day', signal: signal() });
    expect(guard.operationalSnapshot()).toMatchObject({ day: '2026-08-31', requests: 1, providerTokens: 15_000, providerCostMicroUsd: 13_760 });
    lease.release();
  });

  it('does not consume later global or provider allowances for ordered burst, hour, day, and global rejections', async () => {
    let now = Date.parse('2026-08-30T00:00:00.000Z');
    const burst = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 3; index += 1) (await burst.acquire({ networkKey: 'burst', requestId: String(index), signal: signal() })).release();
    await expect(burst.acquire({ networkKey: 'burst', requestId: 'reject', signal: signal() })).rejects.toMatchObject({ rateBucket: 'network-burst' });
    expect(burst.operationalSnapshot()).toMatchObject({ requests: 3, providerTokens: 0, providerCostMicroUsd: 0 });

    const hour = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 20; index += 1) { (await hour.acquire({ networkKey: 'hour', requestId: String(index), signal: signal() })).release(); now += 60_000; }
    const hourBefore = hour.operationalSnapshot();
    await expect(hour.acquire({ networkKey: 'hour', requestId: 'reject', signal: signal() })).rejects.toMatchObject({ rateBucket: 'network-hour' });
    expect(hour.operationalSnapshot()).toEqual(hourBefore);

    now = Date.parse('2026-08-30T12:00:00.000Z');
    const day = await InMemoryUsageGuard.create({ clock: () => now });
    for (let index = 0; index < 40; index += 1) { (await day.acquire({ networkKey: 'day', requestId: String(index), signal: signal() })).release(); now += 180_000; }
    const dayBefore = day.operationalSnapshot();
    await expect(day.acquire({ networkKey: 'day', requestId: 'reject', signal: signal() })).rejects.toMatchObject({ rateBucket: 'network-day' });
    expect(day.operationalSnapshot()).toEqual(dayBefore);
  });

  it('rejects aborted admission first and preserves the exact abort reason', async () => {
    const guard = await InMemoryUsageGuard.create();
    const controller = new AbortController(); const reason = new Error('abort-reason'); controller.abort(reason);
    await expect(guard.acquire({ networkKey: 'network', requestId: 'request', signal: controller.signal })).rejects.toBe(reason);
    expect(guard.usageTotals()).toEqual({ providerTokens: 0, providerCostMicroUsd: 0 });
  });

  it('enforces begin/settle order, exact-once settlement, and stage usage bounds', async () => {
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: 'network', requestId: 'request', signal: signal() });
    expect(() => lease.settleStage('embedding', { inputTokens: 1, outputTokens: 0 })).toThrow(/begin/u);
    lease.beginStage('embedding');
    expect(() => lease.beginStage('embedding')).toThrow(/already begun/u);
    expect(() => lease.settleStage('embedding', { inputTokens: 2_001, outputTokens: 0 })).toThrow(/usage/u);
    lease.settleStage('embedding', { inputTokens: 10, outputTokens: 0 });
    expect(() => lease.settleStage('embedding', { inputTokens: 10, outputTokens: 0 })).toThrow(/already settled/u);
    lease.release(); lease.release();
    expect(guard.usageTotals()).toEqual({ providerTokens: 10, providerCostMicroUsd: 2 });
  });

  it.each(['embedding', 'generation', 'semantic'] as const)('retains the %s worst case after an attempted unsettled stage', async (stage) => {
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: stage, requestId: stage, signal: signal() });
    lease.beginStage(stage); lease.release();
    const expected = stage === 'embedding'
      ? { providerTokens: 2_000, providerCostMicroUsd: 260 }
      : { providerTokens: 6_500, providerCostMicroUsd: 6_750 };
    expect(guard.usageTotals()).toEqual(expected);
  });

  it('refunds only never-begun stages and replaces settled reservations with trusted actual usage', async () => {
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: 'network', requestId: 'request', signal: signal() });
    lease.beginStage('embedding'); lease.settleStage('embedding', { inputTokens: 1_000, outputTokens: 0 });
    const generation = await lease.acquireGeneration(signal());
    lease.beginStage('generation'); lease.settleStage('generation', { inputTokens: 2_000, outputTokens: 100 });
    generation.release(); generation.release(); lease.release();
    expect(guard.usageTotals()).toEqual({ providerTokens: 3_100, providerCostMicroUsd: 2_080 });
    expect(() => lease.beginStage('semantic')).toThrow(/released/u);
  });

  it.each([
    ['embedding', { inputTokens: 1, outputTokens: 0 }, { providerTokens: 1, providerCostMicroUsd: 1 }],
    ['generation', { inputTokens: 1, outputTokens: 1 }, { providerTokens: 2, providerCostMicroUsd: 6 }],
    ['semantic', { inputTokens: 1, outputTokens: 0 }, { providerTokens: 1, providerCostMicroUsd: 1 }],
  ] as const)('settles %s independently with upward micro-USD rounding', async (stage, usage, expected) => {
    const guard = await InMemoryUsageGuard.create();
    const lease = await guard.acquire({ networkKey: stage, requestId: stage, signal: signal() });
    lease.beginStage(stage); lease.settleStage(stage, usage); lease.release();
    expect(guard.usageTotals()).toEqual(expected);
  });

  it('permits exactly one generation-acquisition attempt after success, timeout, overflow, or abort', async () => {
    const successGuard = await InMemoryUsageGuard.create();
    const success = await successGuard.acquire({ networkKey: 'success', requestId: 'success', signal: signal() });
    const permit = await success.acquireGeneration(signal()); permit.release();
    await expect(success.acquireGeneration(signal())).rejects.toThrow(/already attempted/u);

    vi.useFakeTimers();
    const timeoutSemaphore = new FifoSemaphore({ running: 1, queued: 1, waitMs: 2_000 });
    const occupied = await timeoutSemaphore.acquire(signal());
    const timeoutGuard = await InMemoryUsageGuard.create({ semaphore: timeoutSemaphore });
    const timeout = await timeoutGuard.acquire({ networkKey: 'timeout', requestId: 'timeout', signal: signal() });
    const timed = timeout.acquireGeneration(signal()); const timedAssertion = expect(timed).rejects.toBeInstanceOf(PublicAnswerConcurrencyError);
    await vi.advanceTimersByTimeAsync(2_000); await timedAssertion;
    await expect(timeout.acquireGeneration(signal())).rejects.toThrow(/already attempted/u);
    occupied.release(); vi.useRealTimers();

    const overflowSemaphore = new FifoSemaphore({ running: 1, queued: 0, waitMs: 2_000 });
    const overflowPermit = await overflowSemaphore.acquire(signal());
    const overflowGuard = await InMemoryUsageGuard.create({ semaphore: overflowSemaphore });
    const overflow = await overflowGuard.acquire({ networkKey: 'overflow', requestId: 'overflow', signal: signal() });
    await expect(overflow.acquireGeneration(signal())).rejects.toBeInstanceOf(PublicAnswerConcurrencyError);
    await expect(overflow.acquireGeneration(signal())).rejects.toThrow(/already attempted/u);
    overflowPermit.release();

    const abortGuard = await InMemoryUsageGuard.create();
    const abort = await abortGuard.acquire({ networkKey: 'abort', requestId: 'abort', signal: signal() });
    const controller = new AbortController(); const reason = new Error('safe-abort'); controller.abort(reason);
    await expect(abort.acquireGeneration(controller.signal)).rejects.toBe(reason);
    await expect(abort.acquireGeneration(signal())).rejects.toThrow(/already attempted/u);
  });
});
