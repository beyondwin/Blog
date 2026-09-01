import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createLocalProviderAuthorization,
  writeLocalProviderAuthorization,
} from '../src/config/local-provider-authorization.js';
import { canonicalProviderDataControlReceipt, readProviderDataControlReceipt } from '../src/config/provider-data-control-receipt.js';
import { canonicalEdgeReachabilityReceipt, parseServerConfig } from '../src/config/server-config.js';
import { PROVIDER_MODEL_POLICY } from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function base(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture',
    FORM_THOUGHT_SERVER_REPLICA_COUNT: '1',
    FORM_THOUGHT_DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:5432/fixture',
    FORM_THOUGHT_CONTENT_RELEASE_ROOT: resolve('build/public-release'),
    FORM_THOUGHT_ANSWER_RELEASE_ROOT: resolve('build/public-answer-release'),
    FORM_THOUGHT_NETWORK_HMAC_SECRET: 'test-secret-at-least-32-characters-long',
    ...overrides,
  };
}

function providerInput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const, provider: 'openai' as const, projectHash: `sha256:${'a'.repeat(64)}`,
    endpoints: ['/v1/embeddings', '/v1/responses'] as const, status: 'zero-data-retention' as const,
    verifierRole: 'provider-admin' as const, verifierIdentityHash: `sha256:${'1'.repeat(64)}`,
    custodianIdentityHash: `sha256:${'2'.repeat(64)}`, verifiedAt: '2026-08-29T00:00:00.000Z',
    expiresAt: '2099-09-01T00:00:00.000Z', externalEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
    ...overrides,
  };
}

function operationsInput(providerReceiptHash: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const, publicOrigin: 'https://example.com', replicaCount: 1 as const,
    deployerIdentityHash: `sha256:${'4'.repeat(64)}`, deployerRole: 'deployment-admin',
    edgeOwnerIdentityHash: `sha256:${'5'.repeat(64)}`, trustedProxyAddresses: ['127.0.0.1'],
    directOriginReachability: 'failed' as const, forwardedHeaderPolicy: 'overwrite' as const,
    logOwnerIdentityHash: `sha256:${'6'.repeat(64)}`, metricsOwnerIdentityHash: `sha256:${'7'.repeat(64)}`,
    apmOwnerIdentityHash: `sha256:${'8'.repeat(64)}`, crashOwnerIdentityHash: `sha256:${'9'.repeat(64)}`,
    backupOwnerIdentityHash: `sha256:${'b'.repeat(64)}`, retentionTtlDays: 90, purgeMechanism: 'scheduled-delete',
    latestDeletionProofAt: '2026-08-28T00:00:00.000Z', providerDataControlReceiptHash: providerReceiptHash,
    providerSpend: {
      projectHash: `sha256:${'a'.repeat(64)}`, currency: 'USD' as const, monthlyHardCapMicroUsd: 1_000_000,
      approvedSiteBudgetMicroUsd: 1_500_000, verifierIdentityHash: `sha256:${'c'.repeat(64)}`,
      verifierRole: 'provider-admin' as const, verifiedAt: '2026-08-29T00:00:00.000Z',
      expiresAt: '2099-09-01T00:00:00.000Z', externalEvidenceChecksum: `sha256:${'d'.repeat(64)}`,
    },
    verifiedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-09-01T00:00:00.000Z',
    externalEvidenceChecksum: `sha256:${'e'.repeat(64)}`,
    ...overrides,
  };
}

async function productionReceipts() {
  const root = await mkdtemp(join(tmpdir(), 'production-authority-')); roots.push(root);
  const providerPath = join(root, 'provider.json');
  const provider = canonicalProviderDataControlReceipt(providerInput());
  await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
  const opened = await readProviderDataControlReceipt(providerPath, new Date('2026-08-30T00:00:00.000Z'));
  const edgePath = join(root, 'edge.json');
  const edge = canonicalEdgeReachabilityReceipt(operationsInput(opened.receiptHash));
  await writeFile(edgePath, `${JSON.stringify(edge, null, 2)}\n`);
  return { root, providerPath, edgePath };
}

async function localAuthorizationFiles() {
  const root = await mkdtemp(join(tmpdir(), 'local-authority-')); roots.push(root);
  const authorizationPath = join(root, 'authorization.json');
  const budgetLedgerPath = join(root, 'ledger.json');
  await writeLocalProviderAuthorization(
    authorizationPath,
    createLocalProviderAuthorization({
      createdAt: '2026-09-02T00:00:00.000Z',
      policyHash: PROVIDER_MODEL_POLICY.policyHash,
      monthlyHardCapMicroUsd: 1_000_000,
    }),
  );
  await writeFile(budgetLedgerPath, '{}\n');
  return { root, authorizationPath, budgetLedgerPath };
}

function localProviderEnv(
  files: Awaited<ReturnType<typeof localAuthorizationFiles>>,
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return base({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '4307',
    FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider',
    OPENAI_API_KEY: 'test-provider-key',
    FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: resolve('provider-receipts'),
    FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308',
    FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: files.authorizationPath,
    FORM_THOUGHT_LOCAL_BUDGET_LEDGER: files.budgetLedgerPath,
    ...overrides,
  });
}

describe('discriminated provider authority', () => {
  it('accepts local-non-zdr authority only for loopback provider development', async () => {
    const files = await localAuthorizationFiles();
    const config = await parseServerConfig(localProviderEnv(files));
    expect(config.providerAuthority).toMatchObject({
      kind: 'local-non-zdr',
      authorizationPath: files.authorizationPath,
      budgetLedgerPath: files.budgetLedgerPath,
    });
    expect(config.providerAuthority?.kind === 'local-non-zdr' && config.providerAuthority.authorizationHash)
      .toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(config.nodeEnv).toBe('test');
    expect(config.publicAskMode).toBe('provider');
  });

  it('accepts development HTTP loopback origin only with local-non-zdr authorization', async () => {
    const files = await localAuthorizationFiles();
    await expect(parseServerConfig(localProviderEnv(files, { NODE_ENV: 'development' })))
      .resolves.toMatchObject({
        nodeEnv: 'development',
        providerAuthority: { kind: 'local-non-zdr' },
        publicOrigin: 'http://127.0.0.1:4308',
      });
    await expect(parseServerConfig(localProviderEnv(files, {
      NODE_ENV: 'development',
      FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: undefined,
      FORM_THOUGHT_LOCAL_BUDGET_LEDGER: undefined,
    }))).rejects.toThrow(/origin/u);
  });

  it.each([
    ['non-loopback host', { HOST: '192.0.2.10' }],
    ['non-loopback origin', { FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com' }],
    ['non-loopback trusted proxy', { FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '192.0.2.10' }],
    ['fixture mode', { FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture', OPENAI_API_KEY: undefined }],
    ['disabled mode', { FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', OPENAI_API_KEY: undefined }],
    ['missing ledger', { FORM_THOUGHT_LOCAL_BUDGET_LEDGER: undefined }],
  ])('rejects local authority with %s', async (_label, overrides) => {
    const files = await localAuthorizationFiles();
    await expect(parseServerConfig(localProviderEnv(files, overrides))).rejects.toThrow(/local-non-zdr|loopback|provider|ledger|origin|fixture|key/u);
  });

  it('rejects mixing local-non-zdr authorization with a ZDR data-control receipt', async () => {
    const files = await localAuthorizationFiles();
    const production = await productionReceipts();
    await expect(parseServerConfig(localProviderEnv(files, {
      FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: production.providerPath,
    }))).rejects.toThrow(/local-non-zdr|ZDR|production/u);
  });

  it('still requires production ZDR and edge receipts and labels them production-zdr', async () => {
    const { providerPath, edgePath } = await productionReceipts();
    const config = await parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled',
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }));
    expect(config.providerAuthority).toEqual({ kind: 'production-zdr', receiptPath: providerPath });
  });

  it('rejects FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION in production even with complete ZDR evidence', async () => {
    const files = await localAuthorizationFiles();
    const { providerPath, edgePath } = await productionReceipts();
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled',
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
      FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: files.authorizationPath,
      FORM_THOUGHT_LOCAL_BUDGET_LEDGER: files.budgetLedgerPath,
    }))).rejects.toThrow(/local-non-zdr|production/u);
  });

  it('rejects a local authorization presented as the production ZDR receipt', async () => {
    const files = await localAuthorizationFiles();
    const { edgePath } = await productionReceipts();
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled',
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath,
      FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: files.authorizationPath,
    }))).rejects.toThrow(/missing or unknown fields|provider data-control|production/u);
  });
});
