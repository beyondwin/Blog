import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

import type { ProviderTokenUsage } from '../../application/ports/usage-guard.js';
import { PublicAnswerCostLimitError } from '../../domain/public-answer-errors.js';
import { canonicalProviderJson } from '../openai/provider-json.js';
import {
  PROVIDER_MODEL_POLICY,
  type ProviderOperation,
  providerOperationCostMicroUsd,
} from '../openai/provider-model-policy.js';

const OPERATIONS = new Set<ProviderOperation>(['corpus-embedding', 'query-embedding', 'generation', 'semantic']);
const DOCUMENT_KEYS = ['hardCapMicroUsd', 'operations', 'policyHash', 'schemaVersion'] as const;
const OPERATION_KEYS = [
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
] as const;
const STATES = new Set(['reserved', 'settled', 'ambiguous', 'released'] as const);
const OPERATION_ID = /^[a-f0-9]{64}$/u;
const MONTH = /^\d{4}-\d{2}$/u;
const LEDGER_BYTES_CAP = 8 * 1024 * 1024;
const HARD_CAP = 1_000_000 as const;

type LedgerState = 'reserved' | 'settled' | 'ambiguous' | 'released';

interface LedgerOperation {
  chargedMicroUsd: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  measuredInputTokens: number | null;
  measuredOutputTokens: number | null;
  model: 'gpt-5.6-luna' | 'text-embedding-3-large';
  month: string;
  operation: ProviderOperation;
  operationId: string;
  policyHash: string;
  reservedMicroUsd: number;
  state: LedgerState;
}

interface LedgerDocument {
  hardCapMicroUsd: 1_000_000;
  operations: LedgerOperation[];
  policyHash: string;
  schemaVersion: 1;
}

export interface LocalBudgetReservation {
  readonly operationId: string;
  begin(): Promise<void>;
  settle(usage: ProviderTokenUsage): Promise<void>;
  releaseUnattempted(): Promise<void>;
}

export interface LocalBudgetLedgerFaults {
  readonly afterStageWrite?: () => Promise<void>;
  readonly afterFileFsync?: () => Promise<void>;
  readonly afterDirectoryFsync?: () => Promise<void>;
  readonly beforeRename?: () => Promise<void>;
}

export interface LocalBudgetLedgerOptions {
  readonly clock?: () => number;
  readonly hardCapMicroUsd?: 1_000_000;
  readonly faults?: LocalBudgetLedgerFaults;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} is invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unknown fields`);
  }
}

function addMicroUsd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) {
    throw new Error('budget ledger arithmetic overflow');
  }
  if (right > Number.MAX_SAFE_INTEGER - left) throw new Error('budget ledger arithmetic overflow');
  return left + right;
}

function wouldOverflowProduct(tokens: number, price: number): boolean {
  return tokens > 0 && price > Math.floor(Number.MAX_SAFE_INTEGER / tokens);
}

function operationCost(operation: ProviderOperation, usage: Readonly<ProviderTokenUsage>): number {
  if (!Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0) {
    throw new Error('budget ledger arithmetic overflow');
  }
  const prices = PROVIDER_MODEL_POLICY.prices;
  if (operation === 'corpus-embedding' || operation === 'query-embedding') {
    if (usage.outputTokens !== 0) throw new Error('budget ledger reservation is invalid');
    if (wouldOverflowProduct(usage.inputTokens, prices.embeddingInput)) {
      throw new Error('budget ledger arithmetic overflow');
    }
  } else if (operation === 'generation' || operation === 'semantic') {
    if (wouldOverflowProduct(usage.inputTokens, prices.responsesInput)
      || wouldOverflowProduct(usage.outputTokens, prices.responsesOutput)) {
      throw new Error('budget ledger arithmetic overflow');
    }
    const inputProduct = usage.inputTokens * prices.responsesInput;
    const outputProduct = usage.outputTokens * prices.responsesOutput;
    if (outputProduct > Number.MAX_SAFE_INTEGER - inputProduct) throw new Error('budget ledger arithmetic overflow');
  } else {
    throw new Error('budget ledger reservation is invalid');
  }
  const cost = providerOperationCostMicroUsd(operation, usage);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('budget ledger arithmetic overflow');
  return cost;
}

function modelFor(operation: ProviderOperation): LedgerOperation['model'] {
  if (operation === 'corpus-embedding' || operation === 'query-embedding') return PROVIDER_MODEL_POLICY.embeddingModel;
  return PROVIDER_MODEL_POLICY.generationModel;
}

function utcMonth(clock: () => number): string {
  const now = clock();
  if (!Number.isFinite(now)) throw new Error('budget ledger clock is invalid');
  return new Date(now).toISOString().slice(0, 7);
}

function emptyDocument(): LedgerDocument {
  return {
    hardCapMicroUsd: HARD_CAP,
    operations: [],
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    schemaVersion: 1,
  };
}

function parseOperation(value: unknown): LedgerOperation {
  exactKeys(value, OPERATION_KEYS, 'budget ledger operation');
  if (typeof value.operation !== 'string' || !OPERATIONS.has(value.operation as ProviderOperation)
    || typeof value.operationId !== 'string' || !OPERATION_ID.test(value.operationId)
    || typeof value.month !== 'string' || !MONTH.test(value.month)
    || typeof value.state !== 'string' || !STATES.has(value.state as LedgerState)
    || value.policyHash !== PROVIDER_MODEL_POLICY.policyHash
    || value.model !== modelFor(value.operation as ProviderOperation)
    || !Number.isSafeInteger(value.maxInputTokens) || (value.maxInputTokens as number) < 0
    || !Number.isSafeInteger(value.maxOutputTokens) || (value.maxOutputTokens as number) < 0
    || !Number.isSafeInteger(value.reservedMicroUsd) || (value.reservedMicroUsd as number) < 0
    || !Number.isSafeInteger(value.chargedMicroUsd) || (value.chargedMicroUsd as number) < 0) {
    throw new Error('budget ledger operation is invalid');
  }
  const operation = value.operation as ProviderOperation;
  const state = value.state as LedgerState;
  const measuredInputTokens = value.measuredInputTokens;
  const measuredOutputTokens = value.measuredOutputTokens;
  const reservedMicroUsd = operationCost(operation, {
    inputTokens: value.maxInputTokens as number,
    outputTokens: value.maxOutputTokens as number,
  });
  if (value.reservedMicroUsd !== reservedMicroUsd) throw new Error('budget ledger operation is invalid');
  if (state === 'settled') {
    if (!Number.isSafeInteger(measuredInputTokens) || (measuredInputTokens as number) < 0
      || !Number.isSafeInteger(measuredOutputTokens) || (measuredOutputTokens as number) < 0
      || (measuredInputTokens as number) > (value.maxInputTokens as number)
      || (measuredOutputTokens as number) > (value.maxOutputTokens as number)) {
      throw new Error('budget ledger operation is invalid');
    }
    const charged = operationCost(operation, {
      inputTokens: measuredInputTokens as number,
      outputTokens: measuredOutputTokens as number,
    });
    if (value.chargedMicroUsd !== charged) throw new Error('budget ledger operation is invalid');
    return { ...value, operation, state, measuredInputTokens, measuredOutputTokens, reservedMicroUsd } as LedgerOperation;
  }
  if (measuredInputTokens !== null || measuredOutputTokens !== null) throw new Error('budget ledger operation is invalid');
  if (state === 'released' && value.chargedMicroUsd !== 0) throw new Error('budget ledger operation is invalid');
  if ((state === 'reserved' || state === 'ambiguous') && value.chargedMicroUsd !== reservedMicroUsd) {
    throw new Error('budget ledger operation is invalid');
  }
  return { ...value, operation, state, measuredInputTokens: null, measuredOutputTokens: null, reservedMicroUsd } as LedgerOperation;
}

function monthCharged(operations: readonly LedgerOperation[], month: string): number {
  let charged = 0;
  for (const operation of operations) {
    if (operation.month !== month) continue;
    charged = addMicroUsd(charged, operation.chargedMicroUsd);
  }
  if (charged > HARD_CAP) throw new Error('budget ledger arithmetic overflow');
  return charged;
}

function parseDocument(value: unknown): LedgerDocument {
  exactKeys(value, DOCUMENT_KEYS, 'budget ledger');
  if (value.schemaVersion !== 1 || value.hardCapMicroUsd !== HARD_CAP
    || value.policyHash !== PROVIDER_MODEL_POLICY.policyHash || !Array.isArray(value.operations)) {
    throw new Error('budget ledger is invalid');
  }
  const operations = value.operations.map(parseOperation);
  const seen = new Set<string>();
  for (const operation of operations) {
    if (seen.has(operation.operationId)) throw new Error('budget ledger is invalid');
    seen.add(operation.operationId);
  }
  const months = new Set(operations.map((operation) => operation.month));
  for (const month of months) monthCharged(operations, month);
  return { hardCapMicroUsd: HARD_CAP, operations, policyHash: PROVIDER_MODEL_POLICY.policyHash, schemaVersion: 1 };
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function assertOwnedDirectory(path: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()
    || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
    throw new Error('budget ledger parent must be one owned real directory');
  }
}

export class LocalBudgetLedger {
  readonly #path: string;
  readonly #clock: () => number;
  readonly #faults: LocalBudgetLedgerFaults;
  #queue: Promise<void> = Promise.resolve();

  private constructor(path: string, options: LocalBudgetLedgerOptions) {
    this.#path = path;
    this.#clock = options.clock ?? Date.now;
    this.#faults = options.faults ?? {};
  }

  static async open(path: string, options: LocalBudgetLedgerOptions = {}): Promise<LocalBudgetLedger> {
    if (!isAbsolute(path) || path.endsWith('/') || (options.hardCapMicroUsd !== undefined && options.hardCapMicroUsd !== HARD_CAP)
      || HARD_CAP !== PROVIDER_MODEL_POLICY.monthlyHardCapMicroUsd) {
      throw new Error('budget ledger path or cap is invalid');
    }
    await assertOwnedDirectory(dirname(path));
    try {
      const state = await lstat(path);
      if (state.isSymbolicLink()) throw new Error('budget ledger must not be a symbolic link');
      if (!state.isFile()) throw new Error('budget ledger must be one owned regular file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new LocalBudgetLedger(path, options);
      throw error;
    }
    await readDocumentIfPresent(path);
    return new LocalBudgetLedger(path, options);
  }

  reserveBundle(input: readonly {
    readonly operation: ProviderOperation;
    readonly maxUsage: ProviderTokenUsage;
  }[]): Promise<readonly LocalBudgetReservation[]> {
    return this.#serialized(async () => this.#withLock(async (document) => {
      const month = utcMonth(this.#clock);
      const additions: LedgerOperation[] = input.map((item) => {
        if (!OPERATIONS.has(item.operation)) throw new Error('budget ledger reservation is invalid');
        const reservedMicroUsd = operationCost(item.operation, item.maxUsage);
        return {
          chargedMicroUsd: reservedMicroUsd,
          maxInputTokens: item.maxUsage.inputTokens,
          maxOutputTokens: item.maxUsage.outputTokens,
          measuredInputTokens: null,
          measuredOutputTokens: null,
          model: modelFor(item.operation),
          month,
          operation: item.operation,
          operationId: randomBytes(32).toString('hex'),
          policyHash: PROVIDER_MODEL_POLICY.policyHash,
          reservedMicroUsd,
          state: 'reserved',
        };
      });
      let additional = 0;
      for (const operation of additions) additional = addMicroUsd(additional, operation.reservedMicroUsd);
      const charged = addMicroUsd(monthCharged(document.operations, month), additional);
      if (charged > HARD_CAP) throw new PublicAnswerCostLimitError('public answer provider budget exceeded');
      if (additions.length === 0) return { document, write: false, result: [] };
      return {
        document: { ...document, operations: [...document.operations, ...additions] },
        write: true,
        result: additions.map((operation) => this.#reservation(operation.operationId)),
      };
    }));
  }

  reserve(input: Readonly<{
    operation: ProviderOperation;
    maxUsage: ProviderTokenUsage;
  }>): Promise<LocalBudgetReservation> {
    return this.reserveBundle([input]).then((reservations) => {
      const reservation = reservations[0];
      if (!reservation) throw new Error('budget ledger reservation is invalid');
      return reservation;
    });
  }

  snapshot(): Promise<Readonly<{
    month: string;
    hardCapMicroUsd: 1_000_000;
    chargedMicroUsd: number;
    availableMicroUsd: number;
  }>> {
    return this.#serialized(async () => this.#withLock(async (document) => {
      const month = utcMonth(this.#clock);
      const chargedMicroUsd = monthCharged(document.operations, month);
      return {
        document,
        write: false,
        result: Object.freeze({
          month,
          hardCapMicroUsd: HARD_CAP,
          chargedMicroUsd,
          availableMicroUsd: HARD_CAP - chargedMicroUsd,
        }),
      };
    }));
  }

  #reservation(operationId: string): LocalBudgetReservation {
    return Object.freeze({
      operationId,
      begin: () => this.#transition(operationId, (operation) => {
        if (operation.state !== 'reserved') throw new Error('budget ledger reservation already begun');
        return { ...operation, state: 'ambiguous' as const };
      }),
      settle: (usage: ProviderTokenUsage) => this.#transition(operationId, (operation) => {
        if (operation.state === 'reserved') throw new Error('budget ledger reservation must begin before settlement');
        if (operation.state !== 'ambiguous') throw new Error('budget ledger reservation already settled');
        if (usage.inputTokens > operation.maxInputTokens || usage.outputTokens > operation.maxOutputTokens) {
          throw new Error('budget ledger reservation usage is invalid');
        }
        const chargedMicroUsd = operationCost(operation.operation, usage);
        return {
          ...operation,
          state: 'settled' as const,
          chargedMicroUsd,
          measuredInputTokens: usage.inputTokens,
          measuredOutputTokens: usage.outputTokens,
        };
      }),
      releaseUnattempted: () => this.#transition(operationId, (operation) => {
        if (operation.state === 'ambiguous' || operation.state === 'settled') {
          throw new Error('budget ledger reservation already attempted');
        }
        if (operation.state !== 'reserved') throw new Error('budget ledger reservation already released');
        return {
          ...operation,
          state: 'released' as const,
          chargedMicroUsd: 0,
        };
      }),
    });
  }

  #transition(operationId: string, update: (operation: LedgerOperation) => LedgerOperation): Promise<void> {
    return this.#serialized(async () => this.#withLock(async (document) => {
      const index = document.operations.findIndex((operation) => operation.operationId === operationId);
      if (index < 0) throw new Error('budget ledger reservation is unknown');
      const operations = document.operations.slice();
      operations[index] = update(operations[index]!);
      monthCharged(operations, utcMonth(this.#clock));
      monthCharged(operations, operations[index]!.month);
      return { document: { ...document, operations }, write: true, result: undefined };
    }));
  }

  #serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work, work);
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async #withLock<T>(
    work: (document: LedgerDocument) => Promise<{ document: LedgerDocument; write: boolean; result: T }>,
  ): Promise<T> {
    const lockPath = `${this.#path}.lock`;
    let lockHandle;
    try {
      lockHandle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'ELOOP') throw new Error('budget ledger lock is unavailable');
      throw error;
    }
    try {
      const current = await readDocumentIfPresent(this.#path);
      const next = await work(current);
      if (next.write) await this.#replace(next.document);
      return next.result;
    } finally {
      await lockHandle.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }

  async #replace(document: LedgerDocument): Promise<void> {
    const parsed = parseDocument(document);
    const bytes = `${canonicalProviderJson(parsed)}\n`;
    const stage = `${this.#path}.stage-${process.pid}-${Date.now()}-${randomBytes(8).toString('hex')}`;
    const handle = await open(stage, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(bytes);
      await this.#faults.afterStageWrite?.();
      await handle.sync();
      await this.#faults.afterFileFsync?.();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(stage, { force: true });
      throw error;
    }
    await handle.close();
    try {
      await fsyncDirectory(dirname(this.#path));
      await this.#faults.afterDirectoryFsync?.();
      await this.#faults.beforeRename?.();
      await rename(stage, this.#path);
    } catch (error) {
      await rm(stage, { force: true });
      throw error;
    }
    await fsyncDirectory(dirname(this.#path));
  }
}

async function readDocumentIfPresent(path: string): Promise<LedgerDocument> {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument();
    throw error;
  }
  if (before.isSymbolicLink()) throw new Error('budget ledger must not be a symbolic link');
  if (!before.isFile()) throw new Error('budget ledger must be one owned regular file');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new Error('budget ledger must not be a symbolic link');
    throw error;
  }
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || state.size > LEDGER_BYTES_CAP
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('budget ledger must be one owned regular file');
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) {
      throw new Error('budget ledger changed while reading');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    } catch {
      throw new Error('budget ledger is invalid');
    }
    const document = parseDocument(parsed);
    if (bytes.toString('utf8') !== `${canonicalProviderJson(document)}\n`) {
      throw new Error('budget ledger bytes are not canonical');
    }
    return document;
  } finally {
    await handle.close();
  }
}
