import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalEdgeReachabilityReceipt, parseServerConfig } from '../src/config/server-config.js';
import {
  canonicalProviderDataControlReceipt,
  readProviderDataControlReceipt,
} from '../src/config/provider-data-control-receipt.js';

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
    schemaVersion: 1 as const, publicOrigin: 'https://example.com/', replicaCount: 1 as const,
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

describe('server configuration', () => {
  it('parses once into an immutable fixture configuration with safe defaults', async () => {
    const config = await parseServerConfig(base());
    expect(config).toMatchObject({
      nodeEnv: 'test', host: '127.0.0.1', port: 3000, publicAskMode: 'fixture', replicaCount: 1,
      trustedProxyAddresses: [], openAiApiKey: null, providerDataControlReceiptPath: null,
    });
    expect(config.corpusApprovalPath).toBe(resolve('src/data/public-answer-corpus-approval.v1.json'));
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.trustedProxyAddresses)).toBe(true);
  });

  it.each([
    ['unknown mode', { FORM_THOUGHT_PUBLIC_ASK_MODE: 'maybe' }],
    ['empty secret', { FORM_THOUGHT_NETWORK_HMAC_SECRET: '' }],
    ['fractional port', { PORT: '3000.5' }],
    ['more than one replica', { FORM_THOUGHT_SERVER_REPLICA_COUNT: '2' }],
    ['relative content root', { FORM_THOUGHT_CONTENT_RELEASE_ROOT: 'relative' }],
    ['invalid database URL', { FORM_THOUGHT_DATABASE_URL: 'secret-database-value' }],
  ])('rejects %s without reflecting the supplied value', async (_label, overrides) => {
    await expect(parseServerConfig(base(overrides))).rejects.not.toThrow(/secret-database-value/u);
  });

  it('requires provider key and absolute embedding receipt root in provider mode', async () => {
    await expect(parseServerConfig(base({ FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider' })))
      .rejects.toThrow(/provider mode/u);
  });

  it('forbids provider keys in fixture mode and fixture construction in production', async () => {
    await expect(parseServerConfig(base({ OPENAI_API_KEY: 'forbidden-key' }))).rejects.toThrow(/fixture|provider key/u);
    await expect(parseServerConfig(base({ NODE_ENV: 'production' }))).rejects.toThrow(/fixture|production/u);
  });

  it.each([
    'success',
    'provider-disabled',
    'insufficient-evidence',
    'unavailable',
    'timeout',
    'release-mismatch',
    'slow-sql',
  ] as const)('accepts the internal %s fixture scenario only for a loopback test fixture runtime', async (scenario) => {
    await expect(parseServerConfig(base({
      HOST: '127.0.0.1', PORT: '4307',
      FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308/',
      FORM_THOUGHT_TEST_FIXTURE_SCENARIO: scenario,
    }))).resolves.toMatchObject({
      host: '127.0.0.1', port: 4307, fixtureScenario: scenario, publicOrigin: 'http://127.0.0.1:4308/',
    });
  });

  it.each([
    ['unknown scenario', { FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'magic' }],
    ['non-loopback host', { HOST: '192.0.2.10', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['different loopback host', { HOST: '127.0.0.2', PORT: '4307', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['non-loopback origin', { FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['HTTPS loopback origin', { FORM_THOUGHT_PUBLIC_ORIGIN: 'https://127.0.0.1:4308/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['origin credentials', { FORM_THOUGHT_PUBLIC_ORIGIN: 'http://user@127.0.0.1:4308/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['origin path', { FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308/path', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['origin query', { FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308/?query=1', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['origin fragment', { FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4308/#fragment', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['origin without explicit port', { FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['provider mode', {
      FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider', OPENAI_API_KEY: 'forbidden-key', PORT: '4307',
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: resolve('provider-receipts'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success',
    }],
    ['provider key', { OPENAI_API_KEY: 'forbidden-key', PORT: '4307', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
  ])('rejects fixture scenario control with %s', async (_label, overrides) => {
    await expect(parseServerConfig(base(overrides))).rejects.toThrow(/fixture|scenario|provider key|origin/iu);
  });

  it('rejects unsafe production reachability and wildcard trust', async () => {
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', HOST: '0.0.0.0', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://example.com',
      FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '*', FORM_THOUGHT_CORPUS_APPROVAL_PATH: undefined,
    }))).rejects.toThrow(/production|trusted proxies/u);
  });

  it('binds production edge reachability to the independently verified provider-project spend cap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'production-receipts-')); roots.push(root);
    const providerPath = join(root, 'provider.json');
    const provider = canonicalProviderDataControlReceipt(providerInput());
    await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    const opened = await readProviderDataControlReceipt(providerPath, new Date('2026-08-30T00:00:00.000Z'));
    const edgePath = join(root, 'edge.json');
    const edge = canonicalEdgeReachabilityReceipt(operationsInput(opened.receiptHash));
    await writeFile(edgePath, `${JSON.stringify(edge, null, 2)}\n`);
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }))).resolves.toMatchObject({ nodeEnv: 'production', edgeReachabilityReceiptPath: edgePath });
    await writeFile(edgePath, `${JSON.stringify({ ...edge, providerDataControlReceiptHash: `sha256:${'f'.repeat(64)}` }, null, 2)}\n`);
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }))).rejects.toThrow(/operations|checksum/u);
  });

  it.each([
    ['invalid approval', 'not-a-date', '2099-09-01T00:00:00.000Z'],
    ['invalid expiry', '2026-08-29T00:00:00.000Z', 'not-a-date'],
    ['future approval', '2099-08-29T00:00:00.000Z', '2099-09-01T00:00:00.000Z'],
    ['expired', '2020-08-29T00:00:00.000Z', '2020-09-01T00:00:00.000Z'],
  ])('rejects production edge evidence with %s', async (_label, verifiedAt, expiresAt) => {
    const root = await mkdtemp(join(tmpdir(), 'production-edge-time-')); roots.push(root);
    const providerPath = join(root, 'provider.json');
    const provider = canonicalProviderDataControlReceipt(providerInput());
    await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    const opened = await readProviderDataControlReceipt(providerPath, new Date('2026-08-30T00:00:00.000Z'));
    const edgePath = join(root, 'edge.json');
    const edge = canonicalEdgeReachabilityReceipt(operationsInput(opened.receiptHash, { verifiedAt, expiresAt }));
    await writeFile(edgePath, `${JSON.stringify(edge, null, 2)}\n`);
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }))).rejects.toThrow(/instant|current|valid|edge/u);
  });
});

describe('provider data-control receipt', () => {
  it('strict-opens a complete unexpired receipt and verifies its evidence checksum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-control-')); roots.push(root);
    const path = join(root, 'receipt.json');
    const receipt = providerInput({ expiresAt: '2026-09-01T00:00:00.000Z' });
    const sealed = canonicalProviderDataControlReceipt(receipt);
    await writeFile(path, `${JSON.stringify(sealed, null, 2)}\n`);
    const opened = await readProviderDataControlReceipt(path, new Date('2026-08-30T00:00:00.000Z'));
    expect(opened.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(opened.evidenceChecksum).toBe(sealed.evidenceChecksum);
    expect(Object.isFrozen(opened)).toBe(true);
  });

  it('rejects symlinks, expiry, endpoint gaps, identity gaps, unknown fields, and checksum forgery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-control-')); roots.push(root);
    const valid = canonicalProviderDataControlReceipt(providerInput({ expiresAt: '2026-09-01T00:00:00.000Z' }));
    for (const [name, mutate] of [
      ['expired', (value: any) => ({ ...value, expiresAt: '2026-08-29T00:00:00.000Z' })],
      ['endpoint', (value: any) => ({ ...value, endpoints: ['/v1/embeddings'] })],
      ['identity', (value: any) => { const { verifierIdentityHash: _, ...rest } = value; return rest; }],
      ['unknown', (value: any) => ({ ...value, store: false })],
      ['forged', (value: any) => ({ ...value, projectHash: `sha256:${'f'.repeat(64)}` })],
    ] as const) {
      const path = join(root, `${name}.json`);
      await writeFile(path, `${JSON.stringify(mutate(valid), null, 2)}\n`);
      await expect(readProviderDataControlReceipt(path, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow();
    }
    const target = join(root, 'target.json');
    const link = join(root, 'link.json');
    await writeFile(target, `${JSON.stringify(valid, null, 2)}\n`);
    await symlink(target, link);
    await expect(readProviderDataControlReceipt(link, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow(/symbolic/u);
  });

  it('requires the exact ZDR project, endpoint, role, identity, expiry, and external-evidence contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-control-v2-')); roots.push(root);
    const complete = {
      schemaVersion: 1,
      provider: 'openai',
      projectHash: `sha256:${'a'.repeat(64)}`,
      endpoints: ['/v1/embeddings', '/v1/responses'],
      status: 'zero-data-retention',
      verifierRole: 'provider-admin',
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`,
      custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      verifiedAt: '2026-08-29T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
      externalEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
    } as const;
    const sealed = canonicalProviderDataControlReceipt(complete as any);
    const path = join(root, 'complete.json');
    await writeFile(path, `${JSON.stringify(sealed, null, 2)}\n`);
    await expect(readProviderDataControlReceipt(path, new Date('2026-08-30T00:00:00.000Z')))
      .resolves.toMatchObject({ projectHash: complete.projectHash, status: 'zero-data-retention', verifierRole: 'provider-admin' });

    for (const [label, mutate] of [
      ['boolean attestation', (value: any) => ({ ...value, status: undefined, zeroDataRetention: true })],
      ['project identifier', (value: any) => ({ ...value, projectHash: 'project-name' })],
      ['endpoint gap', (value: any) => ({ ...value, endpoints: ['/v1/embeddings'] })],
      ['verifier role', (value: any) => ({ ...value, verifierRole: 'deployer' })],
      ['same receipt identities', (value: any) => ({ ...value, custodianIdentityHash: value.verifierIdentityHash })],
    ] as const) {
      const invalidPath = join(root, `${label.replace(/ /gu, '-')}.json`);
      await writeFile(invalidPath, `${JSON.stringify(mutate(sealed), null, 2)}\n`);
      await expect(readProviderDataControlReceipt(invalidPath, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow();
    }
  });
});

describe('strict production operations receipt', () => {
  it('cross-binds complete edge, ownership, retention, deletion, provider project, spend, and identity evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'operations-receipt-')); roots.push(root);
    const provider = canonicalProviderDataControlReceipt({
      schemaVersion: 1, provider: 'openai', projectHash: `sha256:${'a'.repeat(64)}`,
      endpoints: ['/v1/embeddings', '/v1/responses'], status: 'zero-data-retention', verifierRole: 'provider-admin',
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`, custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      verifiedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-09-01T00:00:00.000Z',
      externalEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
    } as any);
    const providerPath = join(root, 'provider.json');
    await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    const strictInput = {
      schemaVersion: 1, publicOrigin: 'https://example.com/', replicaCount: 1,
      deployerIdentityHash: `sha256:${'4'.repeat(64)}`, deployerRole: 'deployment-admin',
      edgeOwnerIdentityHash: `sha256:${'5'.repeat(64)}`, trustedProxyAddresses: ['127.0.0.1'],
      directOriginReachability: 'failed', forwardedHeaderPolicy: 'overwrite',
      logOwnerIdentityHash: `sha256:${'6'.repeat(64)}`, metricsOwnerIdentityHash: `sha256:${'7'.repeat(64)}`,
      apmOwnerIdentityHash: `sha256:${'8'.repeat(64)}`, crashOwnerIdentityHash: `sha256:${'9'.repeat(64)}`,
      backupOwnerIdentityHash: `sha256:${'b'.repeat(64)}`, retentionTtlDays: 90,
      purgeMechanism: 'scheduled-delete', latestDeletionProofAt: '2026-08-28T00:00:00.000Z',
      providerDataControlReceiptHash: `sha256:${'0'.repeat(64)}`,
      providerSpend: {
        projectHash: `sha256:${'a'.repeat(64)}`, currency: 'USD', monthlyHardCapMicroUsd: 1_000_000,
        approvedSiteBudgetMicroUsd: 1_500_000, verifierIdentityHash: `sha256:${'c'.repeat(64)}`,
        verifierRole: 'provider-admin', verifiedAt: '2026-08-29T00:00:00.000Z',
        expiresAt: '2099-09-01T00:00:00.000Z', externalEvidenceChecksum: `sha256:${'d'.repeat(64)}`,
      },
      verifiedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-09-01T00:00:00.000Z',
      externalEvidenceChecksum: `sha256:${'e'.repeat(64)}`,
    } as const;
    const openedProvider = await readProviderDataControlReceipt(providerPath, new Date('2026-08-30T00:00:00.000Z'));
    const operations = canonicalEdgeReachabilityReceipt({
      ...strictInput, providerDataControlReceiptHash: openedProvider.receiptHash,
    } as any);
    const operationsPath = join(root, 'operations.json');
    const production = {
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled',
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'), FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/',
      FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1', FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: operationsPath,
      FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    };
    await writeFile(operationsPath, `${JSON.stringify(operations, null, 2)}\n`);
    await expect(parseServerConfig(base(production))).resolves.toMatchObject({ nodeEnv: 'production' });

    for (const [label, mutate] of [
      ['project mismatch', (value: any) => ({ ...value, providerSpend: { ...value.providerSpend, projectHash: `sha256:${'f'.repeat(64)}` } })],
      ['receipt hash mismatch', (value: any) => ({ ...value, providerDataControlReceiptHash: `sha256:${'f'.repeat(64)}` })],
      ['overspend', (value: any) => ({ ...value, providerSpend: { ...value.providerSpend, monthlyHardCapMicroUsd: 2_000_000 } })],
      ['provider role mismatch', (value: any) => ({ ...value, providerSpend: { ...value.providerSpend, verifierRole: 'auditor' } })],
      ['deployer verifier collision', (value: any) => ({ ...value, providerSpend: { ...value.providerSpend, verifierIdentityHash: value.deployerIdentityHash } })],
      ['deployer custodian collision', (value: any) => value],
      ['missing owner', (value: any) => { const { crashOwnerIdentityHash: _, ...rest } = value; return rest; }],
    ] as const) {
      let next: any = mutate(operations);
      if (label === 'deployer custodian collision') {
        const { evidenceChecksum: _checksum, ...providerBody } = provider;
        const collidingProvider = canonicalProviderDataControlReceipt({
          ...providerBody, custodianIdentityHash: operations.deployerIdentityHash,
        } as any);
        await writeFile(providerPath, `${JSON.stringify(collidingProvider, null, 2)}\n`);
        const openedCollision = await readProviderDataControlReceipt(providerPath, new Date('2026-08-30T00:00:00.000Z'));
        next = canonicalEdgeReachabilityReceipt(operationsInput(openedCollision.receiptHash) as any);
      } else if (label !== 'missing owner') {
        const { evidenceChecksum: _staleChecksum, ...semanticInput } = next;
        next = canonicalEdgeReachabilityReceipt(semanticInput as any);
      }
      await writeFile(operationsPath, `${JSON.stringify(next, null, 2)}\n`);
      await expect(parseServerConfig(base(production))).rejects.toThrow(
        label === 'missing owner' ? /missing or unknown fields/u : /does not prove/u,
      );
      await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    }
  });
});
