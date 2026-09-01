import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

import {
  localProviderAuthorizationHash,
  readLocalProviderAuthorization,
} from './local-provider-authorization.js';
import { readProviderDataControlReceipt } from './provider-data-control-receipt.js';

export interface ProviderSpendReceiptInput {
  projectHash: string; currency: 'USD'; monthlyHardCapMicroUsd: number; approvedSiteBudgetMicroUsd: number;
  verifierIdentityHash: string; verifierRole: 'provider-admin'; verifiedAt: string; expiresAt: string;
  externalEvidenceChecksum: string;
}

export interface EdgeReachabilityReceiptInput {
  schemaVersion: 1; publicOrigin: string; replicaCount: 1;
  deployerIdentityHash: string; deployerRole: string; edgeOwnerIdentityHash: string;
  trustedProxyAddresses: readonly string[]; directOriginReachability: 'failed'; forwardedHeaderPolicy: 'overwrite';
  logOwnerIdentityHash: string; metricsOwnerIdentityHash: string; apmOwnerIdentityHash: string;
  crashOwnerIdentityHash: string; backupOwnerIdentityHash: string;
  retentionTtlDays: number; purgeMechanism: string; latestDeletionProofAt: string;
  providerDataControlReceiptHash: string; providerSpend: ProviderSpendReceiptInput;
  verifiedAt: string; expiresAt: string; externalEvidenceChecksum: string;
}

export type SealedEdgeReachabilityReceipt = EdgeReachabilityReceiptInput & { evidenceChecksum: string };
const checksumPattern = /^sha256:[a-f0-9]{64}$/u;
const operationsKeys = [
  'schemaVersion','publicOrigin','replicaCount','deployerIdentityHash','deployerRole','edgeOwnerIdentityHash',
  'trustedProxyAddresses','directOriginReachability','forwardedHeaderPolicy','logOwnerIdentityHash','metricsOwnerIdentityHash',
  'apmOwnerIdentityHash','crashOwnerIdentityHash','backupOwnerIdentityHash','retentionTtlDays','purgeMechanism',
  'latestDeletionProofAt','providerDataControlReceiptHash','providerSpend','verifiedAt','expiresAt','externalEvidenceChecksum',
  'evidenceChecksum',
] as const;
const spendKeys = [
  'projectHash','currency','monthlyHardCapMicroUsd','approvedSiteBudgetMicroUsd','verifierIdentityHash','verifierRole',
  'verifiedAt','expiresAt','externalEvidenceChecksum',
] as const;

function hash(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function canonicalEdgeReachabilityReceipt(input: EdgeReachabilityReceiptInput): Readonly<SealedEdgeReachabilityReceipt> {
  const normalized: EdgeReachabilityReceiptInput = {
    schemaVersion: input.schemaVersion,
    publicOrigin: input.publicOrigin,
    replicaCount: input.replicaCount,
    deployerIdentityHash: input.deployerIdentityHash,
    deployerRole: input.deployerRole,
    edgeOwnerIdentityHash: input.edgeOwnerIdentityHash,
    trustedProxyAddresses: Object.freeze([...input.trustedProxyAddresses]),
    directOriginReachability: input.directOriginReachability,
    forwardedHeaderPolicy: input.forwardedHeaderPolicy,
    logOwnerIdentityHash: input.logOwnerIdentityHash,
    metricsOwnerIdentityHash: input.metricsOwnerIdentityHash,
    apmOwnerIdentityHash: input.apmOwnerIdentityHash,
    crashOwnerIdentityHash: input.crashOwnerIdentityHash,
    backupOwnerIdentityHash: input.backupOwnerIdentityHash,
    retentionTtlDays: input.retentionTtlDays,
    purgeMechanism: input.purgeMechanism,
    latestDeletionProofAt: input.latestDeletionProofAt,
    providerDataControlReceiptHash: input.providerDataControlReceiptHash,
    providerSpend: Object.freeze({ ...input.providerSpend }),
    verifiedAt: input.verifiedAt,
    expiresAt: input.expiresAt,
    externalEvidenceChecksum: input.externalEvidenceChecksum,
  };
  return Object.freeze({ ...normalized, evidenceChecksum: hash(JSON.stringify(normalized)) });
}

export async function readEdgeReachabilityReceipt(
  path: string,
  expected: Readonly<{
    publicOrigin: string; trustedProxyAddresses: readonly string[];
    provider: Awaited<ReturnType<typeof readProviderDataControlReceipt>>;
  }>,
  now = new Date(),
): Promise<Readonly<SealedEdgeReachabilityReceipt>> {
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
    if (!parsed || Array.isArray(parsed) || Object.keys(parsed).sort().join('\0') !== [...operationsKeys].sort().join('\0')) {
      throw new Error('edge reachability receipt has missing or unknown fields');
    }
    if (!parsed.providerSpend || typeof parsed.providerSpend !== 'object' || Array.isArray(parsed.providerSpend)
      || Object.keys(parsed.providerSpend as object).sort().join('\0') !== [...spendKeys].sort().join('\0')) {
      throw new Error('provider spend receipt has missing or unknown fields');
    }
    const rawSpend = parsed.providerSpend as Record<string, unknown>;
    const providerSpend: ProviderSpendReceiptInput = {
      projectHash: rawSpend.projectHash as string,
      currency: rawSpend.currency as 'USD',
      monthlyHardCapMicroUsd: rawSpend.monthlyHardCapMicroUsd as number,
      approvedSiteBudgetMicroUsd: rawSpend.approvedSiteBudgetMicroUsd as number,
      verifierIdentityHash: rawSpend.verifierIdentityHash as string,
      verifierRole: rawSpend.verifierRole as 'provider-admin',
      verifiedAt: rawSpend.verifiedAt as string,
      expiresAt: rawSpend.expiresAt as string,
      externalEvidenceChecksum: rawSpend.externalEvidenceChecksum as string,
    };
    const input: EdgeReachabilityReceiptInput = {
      schemaVersion: parsed.schemaVersion as 1,
      publicOrigin: parsed.publicOrigin as string,
      replicaCount: parsed.replicaCount as 1,
      deployerIdentityHash: parsed.deployerIdentityHash as string,
      deployerRole: parsed.deployerRole as string,
      edgeOwnerIdentityHash: parsed.edgeOwnerIdentityHash as string,
      trustedProxyAddresses: parsed.trustedProxyAddresses as string[],
      directOriginReachability: parsed.directOriginReachability as 'failed',
      forwardedHeaderPolicy: parsed.forwardedHeaderPolicy as 'overwrite',
      logOwnerIdentityHash: parsed.logOwnerIdentityHash as string,
      metricsOwnerIdentityHash: parsed.metricsOwnerIdentityHash as string,
      apmOwnerIdentityHash: parsed.apmOwnerIdentityHash as string,
      crashOwnerIdentityHash: parsed.crashOwnerIdentityHash as string,
      backupOwnerIdentityHash: parsed.backupOwnerIdentityHash as string,
      retentionTtlDays: parsed.retentionTtlDays as number,
      purgeMechanism: parsed.purgeMechanism as string,
      latestDeletionProofAt: parsed.latestDeletionProofAt as string,
      providerDataControlReceiptHash: parsed.providerDataControlReceiptHash as string,
      providerSpend,
      verifiedAt: parsed.verifiedAt as string,
      expiresAt: parsed.expiresAt as string,
      externalEvidenceChecksum: parsed.externalEvidenceChecksum as string,
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
    const verifiedAt = exactInstant(input.verifiedAt, 'verifiedAt');
    const expiresAt = exactInstant(input.expiresAt, 'expiresAt');
    const deletionProofAt = exactInstant(input.latestDeletionProofAt, 'latestDeletionProofAt');
    const spendVerifiedAt = exactInstant(providerSpend.verifiedAt, 'providerSpend.verifiedAt');
    const spendExpiresAt = exactInstant(providerSpend.expiresAt, 'providerSpend.expiresAt');
    const identityFields = [
      input.deployerIdentityHash,input.edgeOwnerIdentityHash,input.logOwnerIdentityHash,input.metricsOwnerIdentityHash,
      input.apmOwnerIdentityHash,input.crashOwnerIdentityHash,input.backupOwnerIdentityHash,providerSpend.verifierIdentityHash,
    ];
    if (input.schemaVersion !== 1 || input.replicaCount !== 1
      || input.publicOrigin !== expected.publicOrigin
      || JSON.stringify(input.trustedProxyAddresses) !== JSON.stringify(expected.trustedProxyAddresses)
      || input.directOriginReachability !== 'failed' || input.forwardedHeaderPolicy !== 'overwrite'
      || !input.deployerRole || !input.purgeMechanism || !Number.isSafeInteger(input.retentionTtlDays) || input.retentionTtlDays < 1
      || !identityFields.every((value) => typeof value === 'string' && checksumPattern.test(value))
      || typeof input.externalEvidenceChecksum !== 'string' || !checksumPattern.test(input.externalEvidenceChecksum)
      || input.providerDataControlReceiptHash !== expected.provider.receiptHash
      || providerSpend.projectHash !== expected.provider.projectHash || providerSpend.currency !== 'USD'
      || !Number.isSafeInteger(providerSpend.monthlyHardCapMicroUsd) || providerSpend.monthlyHardCapMicroUsd < 0
      || !Number.isSafeInteger(providerSpend.approvedSiteBudgetMicroUsd) || providerSpend.approvedSiteBudgetMicroUsd < 0
      || providerSpend.monthlyHardCapMicroUsd > providerSpend.approvedSiteBudgetMicroUsd
      || providerSpend.verifierRole !== 'provider-admin'
      || typeof providerSpend.externalEvidenceChecksum !== 'string' || !checksumPattern.test(providerSpend.externalEvidenceChecksum)
      || new Set(identityFields).size !== identityFields.length
      || expected.provider.verifierIdentityHash === input.deployerIdentityHash
      || expected.provider.custodianIdentityHash === input.deployerIdentityHash
      || verifiedAt > now.getTime() || expiresAt <= now.getTime() || deletionProofAt > now.getTime()
      || spendVerifiedAt > now.getTime() || spendExpiresAt <= now.getTime()) {
      throw new Error('operations receipt does not prove the production edge, ownership, retention, deletion, or provider spend controls');
    }
    return Object.freeze({ ...input, evidenceChecksum });
  } finally { await handle.close(); }
}

export type ProviderAuthority =
  | Readonly<{ kind: 'production-zdr'; receiptPath: string }>
  | Readonly<{
      kind: 'local-non-zdr';
      authorizationPath: string;
      budgetLedgerPath: string;
      authorizationHash: string;
    }>
  | null;

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production'; host: string; port: number;
  publicAskMode: 'disabled' | 'fixture' | 'provider'; replicaCount: 1; databaseUrl: string;
  contentReleaseRoot: string; answerReleaseRoot: string; corpusApprovalPath: string;
  trustedProxyAddresses: readonly string[]; networkHmacSecret: string; publicOrigin: string | null;
  edgeReachabilityReceiptPath: string | null; openAiApiKey: string | null;
  providerDataControlReceiptPath: string | null; providerEmbeddingReceiptRoot: string | null;
  deletionReceiptRoot: string | null;
  productionEvalReportPath?: string | null; evaluationUsageReceiptPath?: string | null;
  fixtureScenario: FixtureScenario | null;
  providerAuthority: ProviderAuthority;
}

export type FixtureScenario =
  | 'success'
  | 'provider-disabled'
  | 'insufficient-evidence'
  | 'unavailable'
  | 'timeout'
  | 'release-mismatch'
  | 'slow-sql'
  | 'stress-max'
  | 'replace-active';

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

export function loopbackAddress(value: string): boolean {
  const family = isIP(value);
  return (family === 4 && value.startsWith('127.')) || (family === 6 && value === '::1');
}

export function assertLocalProviderRuntime(config: Readonly<ServerConfig>): void {
  if (config.providerAuthority?.kind !== 'local-non-zdr') return;
  if (config.nodeEnv === 'production') throw new Error('production rejects local-non-zdr authority');
  if (!loopbackAddress(config.host)) throw new Error('local-non-zdr authorization requires a loopback host');
  let originHost = '';
  try { originHost = new URL(config.publicOrigin ?? '').hostname.replace(/^\[|\]$/gu, ''); } catch { /* rejected below */ }
  if (!config.publicOrigin || !loopbackAddress(originHost)) {
    throw new Error('local-non-zdr authorization requires a loopback public origin');
  }
  if (config.trustedProxyAddresses.some((address) => !loopbackAddress(address))) {
    throw new Error('local-non-zdr authorization requires loopback trusted proxies');
  }
}

function normalizedOrigin(
  value: string | undefined,
  nodeEnv: ServerConfig['nodeEnv'],
  allowHttpLoopback = false,
): string | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    const protocolAllowed = url.protocol === 'https:'
      || ((allowHttpLoopback || nodeEnv === 'test') && url.protocol === 'http:' && loopbackAddress(host));
    if (!protocolAllowed || url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || url.origin !== value) throw new Error();
    return url.origin;
  } catch { throw new Error('public origin must be exact normalized HTTPS or test loopback HTTP'); }
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
  const fixtureScenario = env.FORM_THOUGHT_TEST_FIXTURE_SCENARIO === undefined ? null : enumeration(
    env.FORM_THOUGHT_TEST_FIXTURE_SCENARIO,
    ['success', 'provider-disabled', 'insufficient-evidence', 'unavailable', 'timeout', 'release-mismatch', 'slow-sql', 'stress-max', 'replace-active'] as const,
    'FORM_THOUGHT_TEST_FIXTURE_SCENARIO',
  );
  const trustedProxyAddresses = proxies(env.FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES);
  const providerDataControlReceiptPath = optionalAbsolute(env.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT,
    'FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT');
  const providerEmbeddingReceiptRoot = optionalAbsolute(env.FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT,
    'FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT');
  const productionEvalReportPath = optionalAbsolute(env.FORM_THOUGHT_PUBLIC_ANSWER_EVAL_REPORT,
    'FORM_THOUGHT_PUBLIC_ANSWER_EVAL_REPORT');
  const evaluationUsageReceiptPath = optionalAbsolute(env.FORM_THOUGHT_EVAL_USAGE_RECEIPT,
    'FORM_THOUGHT_EVAL_USAGE_RECEIPT');
  const openAiApiKey = env.OPENAI_API_KEY ?? null;
  if (publicAskMode === 'fixture' && openAiApiKey) throw new Error('fixture mode forbids a provider key');
  if (nodeEnv === 'production' && publicAskMode === 'fixture') throw new Error('fixture mode construction is forbidden in production');
  if (publicAskMode === 'provider' && (!openAiApiKey || !providerEmbeddingReceiptRoot)) {
    throw new Error('provider mode requires an API key and absolute embedding receipt root');
  }
  const corpusApprovalPath = absolute(env.FORM_THOUGHT_CORPUS_APPROVAL_PATH, 'FORM_THOUGHT_CORPUS_APPROVAL_PATH',
    nodeEnv === 'production' ? undefined : resolve('src/data/public-answer-corpus-approval.v1.json'));
  if (nodeEnv === 'production'
    && (env.FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION !== undefined
      || env.FORM_THOUGHT_LOCAL_BUDGET_LEDGER !== undefined)) {
    throw new Error('production rejects local-non-zdr provider authorization');
  }
  const localProviderAuthorizationPath = optionalAbsolute(env.FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION,
    'FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION');
  const localBudgetLedgerPath = optionalAbsolute(env.FORM_THOUGHT_LOCAL_BUDGET_LEDGER,
    'FORM_THOUGHT_LOCAL_BUDGET_LEDGER');
  const publicOrigin = normalizedOrigin(
    env.FORM_THOUGHT_PUBLIC_ORIGIN,
    nodeEnv,
    localProviderAuthorizationPath !== null,
  );
  if (fixtureScenario !== null) {
    let originHost = '';
    let originPort = '';
    let originProtocol = '';
    try {
      const url = new URL(publicOrigin ?? '');
      originHost = url.hostname.replace(/^\[|\]$/gu, '');
      originPort = url.port;
      originProtocol = url.protocol;
    } catch { /* rejected by the complete fixture guard below */ }
    if (nodeEnv !== 'test' || !loopbackAddress(host) || !loopbackAddress(originHost)
      || originHost !== host || originProtocol !== 'http:' || !/^[1-9]\d{0,4}$/u.test(originPort)
      || Number(originPort) > 65_535 || publicAskMode === 'provider'
      || (publicAskMode !== 'fixture' && fixtureScenario !== 'provider-disabled') || openAiApiKey) {
      throw new Error('fixture scenario requires a test-only loopback fixture runtime without a provider key');
    }
  }
  const edgeReachabilityReceiptPath = optionalAbsolute(env.FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT,
    'FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT');
  if (nodeEnv === 'production') {
    if (host === '0.0.0.0' || host === '::' || host === '*' || !publicOrigin || trustedProxyAddresses.length === 0
      || !edgeReachabilityReceiptPath || !providerDataControlReceiptPath || !env.FORM_THOUGHT_CORPUS_APPROVAL_PATH) {
      throw new Error('production requires explicit edge-only reachability, origin, proxy, approval, and data-control evidence');
    }
    const providerReceipt = await readProviderDataControlReceipt(providerDataControlReceiptPath);
    await readEdgeReachabilityReceipt(edgeReachabilityReceiptPath, {
      publicOrigin, trustedProxyAddresses, provider: providerReceipt,
    });
  }
  let providerAuthority: ProviderAuthority = null;
  if (localProviderAuthorizationPath) {
    if (publicAskMode !== 'provider') throw new Error('local-non-zdr authorization requires provider mode');
    if (!loopbackAddress(host)) throw new Error('local-non-zdr authorization requires a loopback host');
    let originHost = '';
    try { originHost = new URL(publicOrigin ?? '').hostname.replace(/^\[|\]$/gu, ''); } catch { /* rejected below */ }
    if (!publicOrigin || !loopbackAddress(originHost)) {
      throw new Error('local-non-zdr authorization requires a loopback public origin');
    }
    if (!localBudgetLedgerPath) throw new Error('local-non-zdr authorization requires an absolute budget ledger path');
    if (trustedProxyAddresses.some((address) => !loopbackAddress(address))) {
      throw new Error('local-non-zdr authorization requires loopback trusted proxies');
    }
    if (providerDataControlReceiptPath) {
      throw new Error('local-non-zdr authorization cannot be combined with production ZDR evidence');
    }
    const authorization = await readLocalProviderAuthorization(localProviderAuthorizationPath);
    providerAuthority = Object.freeze({
      kind: 'local-non-zdr' as const,
      authorizationPath: localProviderAuthorizationPath,
      budgetLedgerPath: localBudgetLedgerPath,
      authorizationHash: localProviderAuthorizationHash(authorization),
    });
  } else if (localBudgetLedgerPath) {
    throw new Error('local budget ledger requires local-non-zdr authorization');
  } else if (nodeEnv === 'production' && providerDataControlReceiptPath) {
    providerAuthority = Object.freeze({
      kind: 'production-zdr' as const,
      receiptPath: providerDataControlReceiptPath,
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
    productionEvalReportPath, evaluationUsageReceiptPath,
    fixtureScenario, providerAuthority,
  };
  return Object.freeze(result);
}
