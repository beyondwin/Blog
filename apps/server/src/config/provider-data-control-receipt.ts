import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

const checksumPattern = /^sha256:[a-f0-9]{64}$/u;
const exactKeys = [
  'schemaVersion', 'provider', 'projectId', 'endpoints', 'verifierIdentityHash', 'custodianIdentityHash',
  'zeroDataRetentionEvidenceChecksum', 'spendCapEvidenceChecksum', 'approvedAt', 'expiresAt', 'evidenceChecksum',
] as const;
const endpointKeys = ['embeddings', 'generation', 'semanticVerification'] as const;

export interface ProviderDataControlReceiptInput {
  schemaVersion: 1;
  provider: 'openai';
  projectId: string;
  endpoints: {
    embeddings: '/v1/embeddings';
    generation: '/v1/responses';
    semanticVerification: '/v1/responses';
  };
  verifierIdentityHash: string;
  custodianIdentityHash: string;
  zeroDataRetentionEvidenceChecksum: string;
  spendCapEvidenceChecksum: string;
  approvedAt: string;
  expiresAt: string;
}

export interface ProviderDataControlReceipt extends ProviderDataControlReceiptInput {
  evidenceChecksum: string;
  receiptHash: string;
}

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => codePointCompare(a, b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  throw new TypeError('receipt values must be JSON data');
}

function checksum(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function exactObject(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(codePointCompare);
  const expected = [...keys].sort(codePointCompare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unknown fields`);
  }
}

function validInstant(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an exact UTC instant`);
  return value;
}

function parseInput(value: unknown, includeChecksum: boolean): ProviderDataControlReceiptInput & { evidenceChecksum?: string } {
  exactObject(value, includeChecksum ? exactKeys : exactKeys.slice(0, -1), 'provider data-control receipt');
  exactObject(value.endpoints, endpointKeys, 'provider data-control endpoints');
  if (value.schemaVersion !== 1 || value.provider !== 'openai' || typeof value.projectId !== 'string' || !value.projectId.trim()) {
    throw new Error('provider data-control identity is invalid');
  }
  if (value.endpoints.embeddings !== '/v1/embeddings'
    || value.endpoints.generation !== '/v1/responses'
    || value.endpoints.semanticVerification !== '/v1/responses') {
    throw new Error('provider data-control receipt has an endpoint gap');
  }
  for (const field of [
    'verifierIdentityHash', 'custodianIdentityHash', 'zeroDataRetentionEvidenceChecksum', 'spendCapEvidenceChecksum',
  ] as const) {
    if (typeof value[field] !== 'string' || !checksumPattern.test(value[field])) {
      throw new Error(`provider data-control ${field} is invalid`);
    }
  }
  if (includeChecksum && (typeof value.evidenceChecksum !== 'string' || !checksumPattern.test(value.evidenceChecksum))) {
    throw new Error('provider data-control evidence checksum is invalid');
  }
  return {
    schemaVersion: 1,
    provider: 'openai',
    projectId: value.projectId,
    endpoints: { embeddings: '/v1/embeddings', generation: '/v1/responses', semanticVerification: '/v1/responses' },
    verifierIdentityHash: value.verifierIdentityHash as string,
    custodianIdentityHash: value.custodianIdentityHash as string,
    zeroDataRetentionEvidenceChecksum: value.zeroDataRetentionEvidenceChecksum as string,
    spendCapEvidenceChecksum: value.spendCapEvidenceChecksum as string,
    approvedAt: validInstant(value.approvedAt, 'approvedAt'),
    expiresAt: validInstant(value.expiresAt, 'expiresAt'),
    ...(includeChecksum ? { evidenceChecksum: value.evidenceChecksum as string } : {}),
  };
}

export function canonicalProviderDataControlReceipt(input: ProviderDataControlReceiptInput): ProviderDataControlReceiptInput & { evidenceChecksum: string } {
  const parsed = parseInput(input, false);
  return Object.freeze({ ...parsed, evidenceChecksum: checksum(canonical(parsed)) });
}

export async function readProviderDataControlReceipt(path: string, now = new Date()): Promise<Readonly<ProviderDataControlReceipt>> {
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('provider data-control receipt must not be a symbolic link');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new Error('provider data-control receipt must not be a symbolic link');
    throw error;
  }
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('provider data-control receipt must be one owned regular file');
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) {
      throw new Error('provider data-control receipt changed while reading');
    }
    const parsed = parseInput(JSON.parse(bytes.toString('utf8')) as unknown, true);
    const { evidenceChecksum, ...input } = parsed;
    if (evidenceChecksum !== checksum(canonical(input))) throw new Error('provider data-control evidence checksum does not match');
    if (bytes.toString('utf8') !== `${JSON.stringify({ ...input, evidenceChecksum }, null, 2)}\n`) {
      throw new Error('provider data-control receipt bytes are not canonical');
    }
    if (Date.parse(input.approvedAt) > now.getTime() || Date.parse(input.expiresAt) <= now.getTime()) {
      throw new Error('provider data-control receipt is not currently valid');
    }
    return Object.freeze({ ...input, evidenceChecksum: evidenceChecksum!, receiptHash: checksum(bytes) });
  } finally {
    await handle.close();
  }
}
