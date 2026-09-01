import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { PROVIDER_MODEL_POLICY } from '../modules/public-answer/infrastructure/openai/provider-model-policy.js';

const checksumPattern = /^sha256:[a-f0-9]{64}$/u;
const exactInputKeys = ['createdAt', 'monthlyHardCapMicroUsd', 'policyHash'] as const;
const exactKeys = [
  'createdAt',
  'endpoints',
  'generationModel',
  'kind',
  'monthlyHardCapMicroUsd',
  'policyHash',
  'reasoningEffort',
  'schemaVersion',
  'scope',
] as const;

export interface LocalProviderAuthorizationInput {
  createdAt: string;
  policyHash: string;
  monthlyHardCapMicroUsd: number;
}

export type LocalProviderAuthorization = Readonly<{
  schemaVersion: 1;
  kind: 'local-non-zdr';
  scope: 'owner-loopback-development';
  endpoints: readonly ['/v1/embeddings', '/v1/responses'];
  generationModel: 'gpt-5.6-luna';
  reasoningEffort: 'high';
  monthlyHardCapMicroUsd: 1_000_000;
  createdAt: string;
  policyHash: string;
}>;

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
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

function canonicalAuthorization(input: LocalProviderAuthorizationInput): LocalProviderAuthorization {
  exactObject(input, exactInputKeys, 'local provider authorization input');
  const createdAt = validInstant(input.createdAt, 'createdAt');
  if (input.policyHash !== PROVIDER_MODEL_POLICY.policyHash || !checksumPattern.test(input.policyHash)
    || input.monthlyHardCapMicroUsd !== 1_000_000
    || input.monthlyHardCapMicroUsd !== PROVIDER_MODEL_POLICY.monthlyHardCapMicroUsd
    || PROVIDER_MODEL_POLICY.generationModel !== 'gpt-5.6-luna'
    || PROVIDER_MODEL_POLICY.reasoningEffort !== 'high'
    || !Number.isSafeInteger(input.monthlyHardCapMicroUsd)) {
    throw new Error('local provider authorization does not match the current Luna policy');
  }
  return Object.freeze({
    createdAt,
    endpoints: Object.freeze(['/v1/embeddings', '/v1/responses'] as const),
    generationModel: 'gpt-5.6-luna',
    kind: 'local-non-zdr',
    monthlyHardCapMicroUsd: 1_000_000,
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    reasoningEffort: 'high',
    schemaVersion: 1,
    scope: 'owner-loopback-development',
  });
}

function parseAuthorization(value: unknown): LocalProviderAuthorization {
  exactObject(value, exactKeys, 'local provider authorization');
  if (value.schemaVersion !== 1 || value.kind !== 'local-non-zdr' || value.scope !== 'owner-loopback-development'
    || value.generationModel !== PROVIDER_MODEL_POLICY.generationModel
    || value.reasoningEffort !== PROVIDER_MODEL_POLICY.reasoningEffort
    || !Array.isArray(value.endpoints) || value.endpoints.length !== 2
    || value.endpoints[0] !== '/v1/embeddings' || value.endpoints[1] !== '/v1/responses') {
    throw new Error('local provider authorization identity is invalid');
  }
  return canonicalAuthorization({
    createdAt: value.createdAt as string,
    policyHash: value.policyHash as string,
    monthlyHardCapMicroUsd: value.monthlyHardCapMicroUsd as number,
  });
}

function canonicalBytes(authorization: LocalProviderAuthorization): string {
  return `${JSON.stringify(authorization, null, 2)}\n`;
}

export function createLocalProviderAuthorization(input: LocalProviderAuthorizationInput): LocalProviderAuthorization {
  return canonicalAuthorization(input);
}

export function localProviderAuthorizationHash(authorization: LocalProviderAuthorization): string {
  return `sha256:${createHash('sha256').update(canonicalBytes(parseAuthorization(authorization))).digest('hex')}`;
}

export async function writeLocalProviderAuthorization(
  path: string,
  authorization: LocalProviderAuthorization,
): Promise<void> {
  const canonical = parseAuthorization(authorization);
  const bytes = canonicalBytes(canonical);
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
  await handle.close();
}

export async function readLocalProviderAuthorization(path: string): Promise<LocalProviderAuthorization> {
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('local provider authorization must not be a symbolic link');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('local provider authorization must not be a symbolic link');
    }
    throw error;
  }
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('local provider authorization must be one owned regular file');
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) {
      throw new Error('local provider authorization changed while reading');
    }
    const parsed = parseAuthorization(JSON.parse(bytes.toString('utf8')) as unknown);
    if (bytes.toString('utf8') !== canonicalBytes(parsed)) {
      throw new Error('local provider authorization bytes are not canonical');
    }
    return parsed;
  } finally {
    await handle.close();
  }
}
