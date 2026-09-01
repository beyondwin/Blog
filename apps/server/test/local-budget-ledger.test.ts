import { afterEach, describe, expect, it } from 'vitest';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { PublicAnswerCostLimitError } from '../src/modules/public-answer/domain/public-answer-errors.js';
import {
  LocalBudgetLedger,
  type LocalBudgetLedgerOptions,
} from '../src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { canonicalProviderJson } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';
import {
  PROVIDER_MODEL_POLICY,
  providerOperationCostMicroUsd,
} from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

const roots: string[] = [];
const SEPTEMBER = Date.parse('2026-09-02T10:00:00.000Z');
const GENERATION_MAX = { inputTokens: 6_000, outputTokens: 500 } as const;
const GENERATION_COST = providerOperationCostMicroUsd('generation', GENERATION_MAX);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function ledgerPath(label = 'ledger'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `local-budget-${label}-`));
  roots.push(root);
  return join(root, 'budget-ledger.json');
}

function options(overrides: LocalBudgetLedgerOptions = {}): LocalBudgetLedgerOptions {
  return { clock: () => SEPTEMBER, hardCapMicroUsd: 1_000_000, ...overrides };
}

function embeddingTokensForCost(cost: number): number {
  const tokens = Math.floor((cost - 1) * 1_000_000 / PROVIDER_MODEL_POLICY.prices.embeddingInput) + 1;
  if (providerOperationCostMicroUsd('corpus-embedding', { inputTokens: tokens, outputTokens: 0 }) !== cost) {
    throw new Error(`no embedding token count for ${cost}`);
  }
  return tokens;
}

async function fillCharged(ledger: LocalBudgetLedger, chargedMicroUsd: number) {
  return ledger.reserve({
    operation: 'corpus-embedding',
    maxUsage: { inputTokens: embeddingTokensForCost(chargedMicroUsd), outputTokens: 0 },
  });
}

describe('LocalBudgetLedger', () => {
  it('reserves conservatively, settles measured Luna usage, and reports the UTC month snapshot', async () => {
    const path = await ledgerPath('happy');
    const ledger = await LocalBudgetLedger.open(path, {
      clock: () => Date.parse('2026-09-02T10:00:00.000Z'),
      hardCapMicroUsd: 1_000_000,
    });
    const reservation = await ledger.reserve({
      operation: 'generation',
      maxUsage: { inputTokens: 6_000, outputTokens: 500 },
    });
    expect(await ledger.snapshot()).toMatchObject({
      month: '2026-09',
      hardCapMicroUsd: 1_000_000,
      chargedMicroUsd: GENERATION_COST,
      availableMicroUsd: 1_000_000 - GENERATION_COST,
    });
    await reservation.begin();
    await reservation.settle({ inputTokens: 200, outputTokens: 40 });
    expect(await ledger.snapshot()).toMatchObject({ month: '2026-09', chargedMicroUsd: 88 });
    expect(reservation.operationId).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects a second concurrent reservation at the exact remaining cap before begin', async () => {
    const path = await ledgerPath('exact-cap');
    const ledger = await LocalBudgetLedger.open(path, options());
    await fillCharged(ledger, 1_000_000 - GENERATION_COST);
    const begun: string[] = [];
    const attempts = [0, 1].map(async () => {
      const reservation = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
      begun.push(reservation.operationId);
      await reservation.begin();
      return reservation;
    });
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PublicAnswerCostLimitError);
    expect(begun).toHaveLength(1);
    expect(await ledger.snapshot()).toMatchObject({
      chargedMicroUsd: 1_000_000,
      availableMicroUsd: 0,
    });
  });

  it('resets available budget at the next UTC month while preserving prior-month records', async () => {
    let now = Date.parse('2026-09-30T23:59:59.999Z');
    const path = await ledgerPath('rollover');
    const ledger = await LocalBudgetLedger.open(path, { ...options(), clock: () => now });
    const reservation = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await reservation.begin();
    await reservation.settle({ inputTokens: 200, outputTokens: 40 });
    expect(await ledger.snapshot()).toMatchObject({ month: '2026-09', chargedMicroUsd: 88 });
    now = Date.parse('2026-10-01T00:00:00.000Z');
    expect(await ledger.snapshot()).toMatchObject({
      month: '2026-10',
      hardCapMicroUsd: 1_000_000,
      chargedMicroUsd: 0,
      availableMicroUsd: 1_000_000,
    });
    const october = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    expect(await ledger.snapshot()).toMatchObject({ month: '2026-10', chargedMicroUsd: GENERATION_COST });
    const bytes = await readFile(path, 'utf8');
    expect(bytes).toContain('2026-09');
    expect(bytes).toContain('2026-10');
    await october.releaseUnattempted();
  });

  it.each([
    ['truncated json', '{'],
    ['non-object json', '[]\n'],
    ['unknown field', `${canonicalProviderJson({ extra: true, hardCapMicroUsd: 1_000_000, operations: [], policyHash: PROVIDER_MODEL_POLICY.policyHash, schemaVersion: 1 })}\n`],
  ] as const)('fails closed on %s', async (_label, body) => {
    const path = await ledgerPath('corrupt');
    await writeFile(path, body);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/budget ledger/u);
  });

  it('fails closed on non-canonical bytes of an otherwise valid document', async () => {
    const path = await ledgerPath('non-canonical');
    const ledger = await LocalBudgetLedger.open(path, options());
    await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/canonical/u);
  });

  it('rejects a symbolic-link ledger path', async () => {
    const path = await ledgerPath('symlink');
    const target = `${path}.target`;
    await writeFile(target, '{}\n');
    await symlink(target, path);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/symbolic/u);
  });

  it('rejects a multi-link ledger file', async () => {
    const path = await ledgerPath('nlink');
    const ledger = await LocalBudgetLedger.open(path, options());
    await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await link(path, `${path}.other`);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/owned regular file/u);
  });

  it('fails closed on an adjacent exclusive lock collision', async () => {
    const path = await ledgerPath('lock');
    const handle = await open(`${path}.lock`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.close();
    const ledger = await LocalBudgetLedger.open(path, options());
    await expect(ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX })).rejects.toThrow(/lock/u);
    await expect(ledger.snapshot()).rejects.toThrow(/lock/u);
    await expect(lstat(path).then(() => 'present', (error: NodeJS.ErrnoException) => error.code)).resolves.toBe('ENOENT');
  });

  it('preserves the original file when a stage write fails', async () => {
    const path = await ledgerPath('stage-write');
    const ledger = await LocalBudgetLedger.open(path, options());
    await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    const original = await readFile(path);
    const failing = await LocalBudgetLedger.open(path, {
      ...options(),
      faults: { afterStageWrite: async () => { throw new Error('stage-write-fault'); } },
    });
    await expect(failing.reserve({ operation: 'semantic', maxUsage: GENERATION_MAX })).rejects.toThrow(/stage-write-fault/u);
    expect(await readFile(path)).toEqual(original);
    expect(await lstat(`${path}.lock`).then(() => 'present', () => 'absent')).toBe('absent');
  });

  it('preserves the original file when fsync or rename fails', async () => {
    const path = await ledgerPath('rename');
    const ledger = await LocalBudgetLedger.open(path, options());
    await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    const original = await readFile(path);
    const fsyncFail = await LocalBudgetLedger.open(path, {
      ...options(),
      faults: { afterFileFsync: async () => { throw new Error('fsync-fault'); } },
    });
    await expect(fsyncFail.reserve({ operation: 'semantic', maxUsage: GENERATION_MAX })).rejects.toThrow(/fsync-fault/u);
    expect(await readFile(path)).toEqual(original);
    const renameFail = await LocalBudgetLedger.open(path, {
      ...options(),
      faults: { beforeRename: async () => { throw new Error('rename-fault'); } },
    });
    await expect(renameFail.reserve({ operation: 'semantic', maxUsage: GENERATION_MAX })).rejects.toThrow(/rename-fault/u);
    expect(await readFile(path)).toEqual(original);
    expect(await lstat(`${path}.lock`).then(() => 'present', () => 'absent')).toBe('absent');
  });

  it('fails closed before any reservation when cost arithmetic would overflow', async () => {
    const path = await ledgerPath('overflow');
    const ledger = await LocalBudgetLedger.open(path, options());
    await expect(ledger.reserve({
      operation: 'generation',
      maxUsage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER },
    })).rejects.toThrow(/overflow/u);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 0, availableMicroUsd: 1_000_000 });
    await expect(lstat(path).then(() => 'present', (error: NodeJS.ErrnoException) => error.code)).resolves.toBe('ENOENT');
  });

  it('fails closed on an existing ledger whose charged total is not a safe integer', async () => {
    const path = await ledgerPath('unsafe-charged');
    const document = {
      hardCapMicroUsd: 1_000_000,
      operations: [{
        chargedMicroUsd: Number.MAX_SAFE_INTEGER,
        maxInputTokens: 1,
        maxOutputTokens: 0,
        measuredInputTokens: null,
        measuredOutputTokens: null,
        model: PROVIDER_MODEL_POLICY.embeddingModel,
        month: '2026-09',
        operation: 'corpus-embedding',
        operationId: 'a'.repeat(64),
        policyHash: PROVIDER_MODEL_POLICY.policyHash,
        reservedMicroUsd: Number.MAX_SAFE_INTEGER,
        state: 'reserved',
      }],
      policyHash: PROVIDER_MODEL_POLICY.policyHash,
      schemaVersion: 1,
    };
    await writeFile(path, `${canonicalProviderJson(document)}\n`);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/overflow|budget ledger/u);
  });

  it('refunds an unattempted reservation and keeps an attempted unsettled reservation consumed', async () => {
    const path = await ledgerPath('release');
    const ledger = await LocalBudgetLedger.open(path, options());
    const unused = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await unused.releaseUnattempted();
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 0, availableMicroUsd: 1_000_000 });
    const attempted = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await attempted.begin();
    await expect(attempted.releaseUnattempted()).rejects.toThrow(/attempted/u);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: GENERATION_COST, availableMicroUsd: 1_000_000 - GENERATION_COST });
  });

  it('rejects settle without begin, double settlement, and a second begin', async () => {
    const path = await ledgerPath('double');
    const ledger = await LocalBudgetLedger.open(path, options());
    const reservation = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await expect(reservation.settle({ inputTokens: 200, outputTokens: 40 })).rejects.toThrow(/begin/u);
    await reservation.begin();
    await expect(reservation.begin()).rejects.toThrow(/already/u);
    await reservation.settle({ inputTokens: 200, outputTokens: 40 });
    await expect(reservation.settle({ inputTokens: 200, outputTokens: 40 })).rejects.toThrow(/already settled/u);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 88 });
  });

  it('persists a reserveBundle atomically or not at all', async () => {
    const path = await ledgerPath('bundle');
    const ledger = await LocalBudgetLedger.open(path, options());
    await fillCharged(ledger, 1_000_000 - 1_000);
    await expect(ledger.reserveBundle([
      { operation: 'query-embedding', maxUsage: { inputTokens: 2_000, outputTokens: 0 } },
      { operation: 'generation', maxUsage: GENERATION_MAX },
    ])).rejects.toBeInstanceOf(PublicAnswerCostLimitError);
    expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: 999_000, availableMicroUsd: 1_000 });
    const [embedding, generation] = await ledger.reserveBundle([
      { operation: 'query-embedding', maxUsage: { inputTokens: 2_000, outputTokens: 0 } },
    ]);
    expect(generation).toBeUndefined();
    expect(embedding?.operationId).toMatch(/^[a-f0-9]{64}$/u);
    await embedding?.releaseUnattempted();
  });

  it('never stores question, answer, excerpt, provider payload, API key, or content locators', async () => {
    const path = await ledgerPath('privacy');
    const ledger = await LocalBudgetLedger.open(path, options());
    const reservation = await ledger.reserve({ operation: 'generation', maxUsage: GENERATION_MAX });
    await reservation.begin();
    await reservation.settle({ inputTokens: 200, outputTokens: 40 });
    const bytes = await readFile(path, 'utf8');
    expect(bytes).not.toMatch(/question|answer|excerpt|api[_-]?key|provider payload|\/articles\/|canonicalPath/iu);
    const parsed = JSON.parse(bytes) as { operations: Array<Record<string, unknown>> };
    expect(Object.keys(parsed).sort()).toEqual(['hardCapMicroUsd', 'operations', 'policyHash', 'schemaVersion']);
    expect(Object.keys(parsed.operations[0] ?? {}).sort()).toEqual([
      'chargedMicroUsd',
      'maxInputTokens',
      'maxOutputTokens',
      'measuredInputTokens',
      'measuredOutputTokens',
      'model',
      'month',
      'operation',
      'operationId',
      'policyHash',
      'reservedMicroUsd',
      'state',
    ]);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(bytes).toBe(`${canonicalProviderJson(parsed)}\n`);
  });

  it('creates the parent lock beside a missing ledger without creating a directory at the ledger path', async () => {
    const path = await ledgerPath('missing');
    const parent = await lstat(join(path, '..'));
    expect(parent.isDirectory()).toBe(true);
    const ledger = await LocalBudgetLedger.open(path, options());
    expect(await ledger.snapshot()).toEqual({
      month: '2026-09',
      hardCapMicroUsd: 1_000_000,
      chargedMicroUsd: 0,
      availableMicroUsd: 1_000_000,
    });
    await expect(lstat(path).then(() => 'present', (error: NodeJS.ErrnoException) => error.code)).resolves.toBe('ENOENT');
  });

  it('rejects a directory where the ledger file must be', async () => {
    const path = await ledgerPath('directory');
    await mkdir(path);
    await expect(LocalBudgetLedger.open(path, options())).rejects.toThrow(/regular file/u);
  });
});
