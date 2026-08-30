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
      FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/',
      FORM_THOUGHT_TEST_FIXTURE_SCENARIO: scenario,
    }))).resolves.toMatchObject({ fixtureScenario: scenario, publicOrigin: 'http://127.0.0.1:4307/' });
  });

  it.each([
    ['unknown scenario', { FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'magic' }],
    ['non-loopback host', { HOST: '192.0.2.10', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['non-loopback origin', { FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
    ['provider mode', {
      FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider', OPENAI_API_KEY: 'forbidden-key', PORT: '4307',
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: resolve('provider-receipts'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success',
    }],
    ['provider key', { OPENAI_API_KEY: 'forbidden-key', PORT: '4307', FORM_THOUGHT_PUBLIC_ORIGIN: 'http://127.0.0.1:4307/', FORM_THOUGHT_TEST_FIXTURE_SCENARIO: 'success' }],
  ])('rejects fixture scenario control with %s', async (_label, overrides) => {
    await expect(parseServerConfig(base(overrides))).rejects.toThrow(/fixture|scenario|provider key/iu);
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
    const provider = canonicalProviderDataControlReceipt({
      schemaVersion: 1, provider: 'openai', projectId: 'project-public-answer',
      endpoints: { embeddings: '/v1/embeddings', generation: '/v1/responses', semanticVerification: '/v1/responses' },
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`, custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      zeroDataRetentionEvidenceChecksum: `sha256:${'3'.repeat(64)}`, spendCapEvidenceChecksum: `sha256:${'4'.repeat(64)}`,
      approvedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-09-01T00:00:00.000Z',
    });
    await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    const edgePath = join(root, 'edge.json');
    const edge = canonicalEdgeReachabilityReceipt({
      schemaVersion: 1, edgeOnly: true, replicaCount: 1, publicOrigin: 'https://example.com/',
      trustedProxyAddresses: ['127.0.0.1'], providerProjectSpendCapEvidenceChecksum: provider.spendCapEvidenceChecksum,
      verifierIdentityHash: `sha256:${'5'.repeat(64)}`, approvedAt: '2026-08-29T00:00:00.000Z',
      expiresAt: '2099-09-01T00:00:00.000Z',
    });
    const reorderedEdge = canonicalEdgeReachabilityReceipt({
      expiresAt: '2099-09-01T00:00:00.000Z', approvedAt: '2026-08-29T00:00:00.000Z',
      verifierIdentityHash: `sha256:${'5'.repeat(64)}`,
      providerProjectSpendCapEvidenceChecksum: provider.spendCapEvidenceChecksum,
      trustedProxyAddresses: ['127.0.0.1'], publicOrigin: 'https://example.com/', replicaCount: 1,
      edgeOnly: true, schemaVersion: 1,
    });
    expect(reorderedEdge).toEqual(edge);
    await writeFile(edgePath, `${JSON.stringify(edge, null, 2)}\n`);
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }))).resolves.toMatchObject({ nodeEnv: 'production', edgeReachabilityReceiptPath: edgePath });
    await writeFile(edgePath, `${JSON.stringify({ ...edge, providerProjectSpendCapEvidenceChecksum: `sha256:${'6'.repeat(64)}` }, null, 2)}\n`);
    await expect(parseServerConfig(base({
      NODE_ENV: 'production', FORM_THOUGHT_PUBLIC_ASK_MODE: 'disabled', FORM_THOUGHT_CORPUS_APPROVAL_PATH: resolve('approval.json'),
      FORM_THOUGHT_PUBLIC_ORIGIN: 'https://example.com/', FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_EDGE_REACHABILITY_RECEIPT: edgePath, FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT: providerPath,
    }))).rejects.toThrow(/spend cap|checksum/u);
  });

  it.each([
    ['invalid approval', 'not-a-date', '2099-09-01T00:00:00.000Z'],
    ['invalid expiry', '2026-08-29T00:00:00.000Z', 'not-a-date'],
    ['future approval', '2099-08-29T00:00:00.000Z', '2099-09-01T00:00:00.000Z'],
    ['expired', '2020-08-29T00:00:00.000Z', '2020-09-01T00:00:00.000Z'],
  ])('rejects production edge evidence with %s', async (_label, approvedAt, expiresAt) => {
    const root = await mkdtemp(join(tmpdir(), 'production-edge-time-')); roots.push(root);
    const providerPath = join(root, 'provider.json');
    const provider = canonicalProviderDataControlReceipt({
      schemaVersion: 1, provider: 'openai', projectId: 'project-public-answer',
      endpoints: { embeddings: '/v1/embeddings', generation: '/v1/responses', semanticVerification: '/v1/responses' },
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`, custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      zeroDataRetentionEvidenceChecksum: `sha256:${'3'.repeat(64)}`, spendCapEvidenceChecksum: `sha256:${'4'.repeat(64)}`,
      approvedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2099-09-01T00:00:00.000Z',
    });
    await writeFile(providerPath, `${JSON.stringify(provider, null, 2)}\n`);
    const edgePath = join(root, 'edge.json');
    const edge = canonicalEdgeReachabilityReceipt({
      schemaVersion: 1, edgeOnly: true, replicaCount: 1, publicOrigin: 'https://example.com/',
      trustedProxyAddresses: ['127.0.0.1'], providerProjectSpendCapEvidenceChecksum: provider.spendCapEvidenceChecksum,
      verifierIdentityHash: `sha256:${'5'.repeat(64)}`, approvedAt, expiresAt,
    });
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
    const receipt = {
      schemaVersion: 1 as const,
      provider: 'openai' as const,
      projectId: 'project-public-answer',
      endpoints: {
        embeddings: '/v1/embeddings',
        generation: '/v1/responses',
        semanticVerification: '/v1/responses',
      },
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`,
      custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      zeroDataRetentionEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
      spendCapEvidenceChecksum: `sha256:${'4'.repeat(64)}`,
      approvedAt: '2026-08-29T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
    } as const;
    const sealed = canonicalProviderDataControlReceipt(receipt);
    await writeFile(path, `${JSON.stringify(sealed, null, 2)}\n`);
    const opened = await readProviderDataControlReceipt(path, new Date('2026-08-30T00:00:00.000Z'));
    expect(opened.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(opened.evidenceChecksum).toBe(sealed.evidenceChecksum);
    expect(Object.isFrozen(opened)).toBe(true);
  });

  it('rejects symlinks, expiry, endpoint gaps, identity gaps, unknown fields, and checksum forgery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-control-')); roots.push(root);
    const valid = canonicalProviderDataControlReceipt({
      schemaVersion: 1,
      provider: 'openai',
      projectId: 'project-public-answer',
      endpoints: { embeddings: '/v1/embeddings', generation: '/v1/responses', semanticVerification: '/v1/responses' },
      verifierIdentityHash: `sha256:${'1'.repeat(64)}`,
      custodianIdentityHash: `sha256:${'2'.repeat(64)}`,
      zeroDataRetentionEvidenceChecksum: `sha256:${'3'.repeat(64)}`,
      spendCapEvidenceChecksum: `sha256:${'4'.repeat(64)}`,
      approvedAt: '2026-08-29T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    for (const [name, mutate] of [
      ['expired', (value: any) => ({ ...value, expiresAt: '2026-08-29T00:00:00.000Z' })],
      ['endpoint', (value: any) => ({ ...value, endpoints: { embeddings: '/v1/embeddings' } })],
      ['identity', (value: any) => { const { verifierIdentityHash: _, ...rest } = value; return rest; }],
      ['unknown', (value: any) => ({ ...value, store: false })],
      ['forged', (value: any) => ({ ...value, projectId: 'substituted' })],
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
});
