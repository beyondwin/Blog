import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { canonicalProviderJson, providerChecksum } from '../infrastructure/openai/provider-json.js';

const checksumPattern = /^sha256:[a-f0-9]{64}$/u;
const keys = [
  'schemaVersion', 'providerProjectHash', 'providerDataControlReceiptHash', 'providerPricingReceiptHash',
  'hiddenManifestHash', 'corpusApprovalHash', 'providerEmbeddingReceiptHash', 'retrievalPolicyHash',
  'runCount', 'maxApplicationRequests', 'maxApplicationProviderTokens', 'maxApplicationCostMicroUsd',
  'maxIndexProviderTokens', 'maxIndexCostMicroUsd', 'verifierIdentityHash', 'issuedAt', 'expiresAt', 'canonicalHash',
] as const;

export interface EvaluationUsageReceiptInput {
  readonly schemaVersion: 1;
  readonly providerProjectHash: string;
  readonly providerDataControlReceiptHash: string;
  readonly providerPricingReceiptHash: string;
  readonly hiddenManifestHash: string;
  readonly corpusApprovalHash: string;
  readonly providerEmbeddingReceiptHash: string;
  readonly retrievalPolicyHash: string;
  readonly runCount: 3;
  readonly maxApplicationRequests: 180;
  readonly maxApplicationProviderTokens: 2_700_000;
  readonly maxApplicationCostMicroUsd: 2_476_800;
  readonly maxIndexProviderTokens: 100_000;
  readonly maxIndexCostMicroUsd: 20_000;
  readonly verifierIdentityHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}
export interface EvaluationUsageReceipt extends EvaluationUsageReceiptInput { readonly canonicalHash: string; readonly receiptHash: string }

function parse(input: unknown): EvaluationUsageReceiptInput & { canonicalHash: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error('evaluation usage receipt must be an object');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new Error('evaluation usage receipt has missing or unknown fields');
  }
  const hashes = [
    'providerProjectHash', 'providerDataControlReceiptHash', 'providerPricingReceiptHash', 'hiddenManifestHash',
    'corpusApprovalHash', 'providerEmbeddingReceiptHash', 'retrievalPolicyHash', 'verifierIdentityHash', 'canonicalHash',
  ] as const;
  if (value.schemaVersion !== 1 || hashes.some((field) => typeof value[field] !== 'string' || !checksumPattern.test(value[field] as string))
    || value.runCount !== 3 || value.maxApplicationRequests !== 180
    || value.maxApplicationProviderTokens !== 2_700_000 || value.maxApplicationCostMicroUsd !== 2_476_800
    || value.maxIndexProviderTokens !== 100_000 || value.maxIndexCostMicroUsd !== 20_000) {
    throw new Error('evaluation usage receipt limits or identity are invalid');
  }
  for (const field of ['issuedAt', 'expiresAt'] as const) {
    if (typeof value[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value[field] as string)
      || Number.isNaN(Date.parse(value[field] as string))) throw new Error(`evaluation usage ${field} is invalid`);
  }
  return value as unknown as EvaluationUsageReceiptInput & { canonicalHash: string };
}

export async function readEvaluationUsageReceipt(path: string, expected: Readonly<Partial<EvaluationUsageReceiptInput>>, now = new Date()): Promise<Readonly<EvaluationUsageReceipt>> {
  if (!isAbsolute(path)) throw new Error('evaluation usage receipt path must be absolute');
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('evaluation usage receipt must not be a symbolic link');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || state.size > 64 * 1024
      || (typeof process.getuid === 'function' && state.uid !== process.getuid())) throw new Error('evaluation usage receipt must be one owned regular file');
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) throw new Error('evaluation usage receipt changed while reading');
    const parsed = parse(JSON.parse(bytes.toString('utf8')));
    const { canonicalHash, ...body } = parsed;
    if (canonicalHash !== providerChecksum(body) || bytes.toString('utf8') !== `${canonicalProviderJson(parsed)}\n`) {
      throw new Error('evaluation usage receipt canonical hash or bytes do not match');
    }
    if (Date.parse(parsed.issuedAt) > now.getTime() || Date.parse(parsed.expiresAt) <= now.getTime()) throw new Error('evaluation usage receipt is not currently valid');
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (parsed[field as keyof typeof parsed] !== expectedValue) throw new Error(`evaluation usage receipt ${field} drift`);
    }
    return Object.freeze({ ...parsed, receiptHash: providerChecksum(bytes) });
  } finally { await handle.close(); }
}
