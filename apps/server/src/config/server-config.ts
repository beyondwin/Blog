import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

import { readProviderDataControlReceipt } from './provider-data-control-receipt.js';

interface EdgeReachabilityReceiptInput {
  schemaVersion: 1; edgeOnly: true; replicaCount: 1; publicOrigin: string;
  trustedProxyAddresses: readonly string[]; providerProjectSpendCapEvidenceChecksum: string;
  verifierIdentityHash: string; approvedAt: string; expiresAt: string;
}

type SealedEdgeReachabilityReceipt = EdgeReachabilityReceiptInput & { evidenceChecksum: string };
const checksumPattern = /^sha256:[a-f0-9]{64}$/u;

function hash(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function canonicalEdgeReachabilityReceipt(input: EdgeReachabilityReceiptInput): Readonly<SealedEdgeReachabilityReceipt> {
  const normalized: EdgeReachabilityReceiptInput = {
    schemaVersion: input.schemaVersion,
    edgeOnly: input.edgeOnly,
    replicaCount: input.replicaCount,
    publicOrigin: input.publicOrigin,
    trustedProxyAddresses: Object.freeze([...input.trustedProxyAddresses]),
    providerProjectSpendCapEvidenceChecksum: input.providerProjectSpendCapEvidenceChecksum,
    verifierIdentityHash: input.verifierIdentityHash,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  };
  return Object.freeze({ ...normalized, evidenceChecksum: hash(JSON.stringify(normalized)) });
}

async function readEdgeReachabilityReceipt(
  path: string,
  expected: Readonly<{ publicOrigin: string; trustedProxyAddresses: readonly string[]; spendCapEvidenceChecksum: string }>,
  now = new Date(),
): Promise<void> {
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error('edge reachability receipt must not be a symbolic link');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1 || (typeof process.getuid === 'function' && state.uid !== process.getuid())) {
      throw new Error('edge reachability receipt must be one owned regular file');
    }
    const bytes = await handle.readFile();
    const after = await lstat(path);
    if (after.isSymbolicLink() || after.dev !== state.dev || after.ino !== state.ino || after.nlink !== 1) {
      throw new Error('edge reachability receipt changed while reading');
    }
    const parsed = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const keys = [
      'schemaVersion', 'edgeOnly', 'replicaCount', 'publicOrigin', 'trustedProxyAddresses',
      'providerProjectSpendCapEvidenceChecksum', 'verifierIdentityHash', 'approvedAt', 'expiresAt', 'evidenceChecksum',
    ];
    if (!parsed || Array.isArray(parsed) || Object.keys(parsed).sort().join('\0') !== [...keys].sort().join('\0')) {
      throw new Error('edge reachability receipt has missing or unknown fields');
    }
    const input: EdgeReachabilityReceiptInput = {
      schemaVersion: parsed.schemaVersion as 1,
      edgeOnly: parsed.edgeOnly as true,
      replicaCount: parsed.replicaCount as 1,
      publicOrigin: parsed.publicOrigin as string,
      trustedProxyAddresses: parsed.trustedProxyAddresses as string[],
      providerProjectSpendCapEvidenceChecksum: parsed.providerProjectSpendCapEvidenceChecksum as string,
      verifierIdentityHash: parsed.verifierIdentityHash as string,
      approvedAt: parsed.approvedAt as string,
      expiresAt: parsed.expiresAt as string,
    };
    const evidenceChecksum = parsed.evidenceChecksum;
    if (evidenceChecksum !== hash(JSON.stringify(input)) || typeof evidenceChecksum !== 'string' || !checksumPattern.test(evidenceChecksum)) {
      throw new Error('edge reachability evidence checksum does not match');
    }
    if (bytes.toString('utf8') !== `${JSON.stringify({ ...input, evidenceChecksum }, null, 2)}\n`) {
      throw new Error('edge reachability receipt bytes are not canonical');
    }
    const exactInstant = (value: string, label: string): number => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error(`edge ${label} must be an exact UTC instant`);
      }
      return Date.parse(value);
    };
    const approvedAt = exactInstant(input.approvedAt, 'approvedAt');
    const expiresAt = exactInstant(input.expiresAt, 'expiresAt');
    if (input.schemaVersion !== 1 || input.edgeOnly !== true || input.replicaCount !== 1
      || input.publicOrigin !== expected.publicOrigin
      || JSON.stringify(input.trustedProxyAddresses) !== JSON.stringify(expected.trustedProxyAddresses)
      || input.providerProjectSpendCapEvidenceChecksum !== expected.spendCapEvidenceChecksum
      || typeof input.verifierIdentityHash !== 'string' || !checksumPattern.test(input.verifierIdentityHash)
      || approvedAt > now.getTime() || expiresAt <= now.getTime()) {
      throw new Error('edge reachability receipt does not prove the production edge or provider-project spend cap');
    }
  } finally { await handle.close(); }
}

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production'; host: string; port: number;
  publicAskMode: 'disabled' | 'fixture' | 'provider'; replicaCount: 1; databaseUrl: string;
  contentReleaseRoot: string; answerReleaseRoot: string; corpusApprovalPath: string;
  trustedProxyAddresses: readonly string[]; networkHmacSecret: string; publicOrigin: string | null;
  edgeReachabilityReceiptPath: string | null; openAiApiKey: string | null;
  providerDataControlReceiptPath: string | null; providerEmbeddingReceiptRoot: string | null;
  deletionReceiptRoot: string | null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required and must not be empty`);
  return value;
}

function enumeration<T extends string>(value: string | undefined, values: readonly T[], name: string, fallback?: T): T {
  const candidate = value ?? fallback;
  if (!candidate || !values.includes(candidate as T)) throw new Error(`${name} is invalid`);
  return candidate as T;
}

function integer(value: string | undefined, name: string, fallback: number): number {
  const candidate = value ?? String(fallback);
  if (!/^(?:0|[1-9]\d*)$/u.test(candidate)) throw new Error(`${name} must be an integer`);
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

function absolute(value: string | undefined, name: string, fallback?: string): string {
  const candidate = value ?? fallback;
  if (!candidate || !isAbsolute(candidate)) throw new Error(`${name} must be an absolute path`);
  return candidate;
}

function optionalAbsolute(value: string | undefined, name: string): string | null {
  if (value === undefined) return null;
  if (!value || !isAbsolute(value)) throw new Error(`${name} must be a non-empty absolute path`);
  return value;
}

function databaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') throw new Error();
    return value;
  } catch { throw new Error('FORM_THOUGHT_DATABASE_URL is invalid'); }
}

function normalizedOrigin(value: string | undefined): string | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.toString() !== value) throw new Error();
    return value;
  } catch { throw new Error('production public origin must be exact normalized HTTPS'); }
}

function proxies(value: string | undefined): readonly string[] {
  if (value === undefined || value === '') return Object.freeze([]);
  const addresses = value.split(',').map((item) => item.trim());
  if (addresses.some((item) => !item || isIP(item) === 0)) throw new Error('trusted proxies must be normalized exact IP addresses');
  return Object.freeze([...new Set(addresses)]);
}

export async function parseServerConfig(env: NodeJS.ProcessEnv): Promise<Readonly<ServerConfig>> {
  const nodeEnv = enumeration(env.NODE_ENV, ['development', 'test', 'production'] as const, 'NODE_ENV', 'development');
  const publicAskMode = enumeration(env.FORM_THOUGHT_PUBLIC_ASK_MODE, ['disabled', 'fixture', 'provider'] as const,
    'FORM_THOUGHT_PUBLIC_ASK_MODE', 'disabled');
  const port = integer(env.PORT, 'PORT', 3000);
  if (port < 1 || port > 65535) throw new Error('PORT is out of range');
  const replicas = integer(env.FORM_THOUGHT_SERVER_REPLICA_COUNT, 'FORM_THOUGHT_SERVER_REPLICA_COUNT', 1);
  if (replicas !== 1) throw new Error('FORM_THOUGHT_SERVER_REPLICA_COUNT must equal one');
  const host = env.HOST ?? '127.0.0.1';
  const trustedProxyAddresses = proxies(env.FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES);
  const providerDataControlReceiptPath = optionalAbsolute(env.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT,
    'FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT');
  const providerEmbeddingReceiptRoot = optionalAbsolute(env.FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT,
    'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT');
  const openAiApiKey = env.OPENAI_API_KEY ?? null;
  if (publicAskMode === 'provider' && (!openAiApiKey || !providerEmbeddingReceiptRoot)) {
    throw new Error('provider mode requires an API key and absolute embedding receipt root');
  }
  const corpusApprovalPath = absolute(env.FORM_THOUGHT_CORPUS_APPROVAL_PATH, 'FORM_THOUGHT_CORPUS_APPROVAL_PATH',
    nodeEnv === 'production' ? undefined : resolve('src/data/public-answer-corpus-approval.v1.json'));
  const publicOrigin = normalizedOrigin(env.FORM_THOUGHT_PUBLIC_ORIGIN);
  const edgeReachabilityReceiptPath = optionalAbsolute(env.FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT,
    'FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT');
  if (nodeEnv === 'production') {
    if (host === '0.0.0.0' || host === '::' || host === '*' || !publicOrigin || trustedProxyAddresses.length === 0
      || !edgeReachabilityReceiptPath || !providerDataControlReceiptPath || !env.FORM_THOUGHT_CORPUS_APPROVAL_PATH) {
      throw new Error('production requires explicit edge-only reachability, origin, proxy, approval, and data-control evidence');
    }
    const providerReceipt = await readProviderDataControlReceipt(providerDataControlReceiptPath);
    await readEdgeReachabilityReceipt(edgeReachabilityReceiptPath, {
      publicOrigin, trustedProxyAddresses, spendCapEvidenceChecksum: providerReceipt.spendCapEvidenceChecksum,
    });
  }
  const result: ServerConfig = {
    nodeEnv, host, port, publicAskMode, replicaCount: 1,
    databaseUrl: databaseUrl(required(env, 'FORM_THOUGHT_DATABASE_URL')),
    contentReleaseRoot: absolute(env.FORM_THOUGHT_CONTENT_RELEASE_ROOT, 'FORM_THOUGHT_CONTENT_RELEASE_ROOT'),
    answerReleaseRoot: absolute(env.FORM_THOUGHT_ANSWER_RELEASE_ROOT, 'FORM_THOUGHT_ANSWER_RELEASE_ROOT'),
    corpusApprovalPath, trustedProxyAddresses, networkHmacSecret: required(env, 'FORM_THOUGHT_NETWORK_HMAC_SECRET'),
    publicOrigin, edgeReachabilityReceiptPath, openAiApiKey, providerDataControlReceiptPath, providerEmbeddingReceiptRoot,
    deletionReceiptRoot: optionalAbsolute(env.FORM_THOUGHT_DELETION_RECEIPT_ROOT, 'FORM_THOUGHT_DELETION_RECEIPT_ROOT'),
  };
  return Object.freeze(result);
}
