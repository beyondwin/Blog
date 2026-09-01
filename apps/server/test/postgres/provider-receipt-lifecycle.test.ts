import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProviderEmbeddingReceipt, writeProviderEmbeddingReceipt } from '../../src/modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import { PROVIDER_MODEL_POLICY } from '../../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { runPostgresMigrations } from '../../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';

const databaseUrl = process.env.FORM_THOUGHT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FORM_THOUGHT_TEST_DATABASE_URL is required');
let pool: Pool;
const roots: string[] = [];

beforeEach(async () => {
  pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runPostgresMigrations(pool);
});

afterEach(async () => {
  await pool.end();
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function productionReceipt() {
  return createProviderEmbeddingReceipt({
    schemaVersion: 1, contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64),
    contentManifestHash: `sha256:${'1'.repeat(64)}`, answerManifestHash: `sha256:${'2'.repeat(64)}`,
    answerArtifactHash: `sha256:${'3'.repeat(64)}`, corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`, providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`,
    embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
    entries: [], inputTokens: 0, costMicroUsd: 0, providerVectorSetChecksum: `sha256:${'7'.repeat(64)}`,
    indexChecksum: `sha256:${'8'.repeat(64)}`, createdAt: '2026-08-30T00:00:00.000Z', completedAt: '2026-08-30T00:00:01.000Z',
  });
}

function localReceipt() {
  return createProviderEmbeddingReceipt({
    schemaVersion: 1, contentReleaseId: 'a'.repeat(64), answerReleaseId: 'b'.repeat(64),
    contentManifestHash: `sha256:${'1'.repeat(64)}`, answerManifestHash: `sha256:${'2'.repeat(64)}`,
    answerArtifactHash: `sha256:${'3'.repeat(64)}`, corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    providerAuthorityKind: 'local-non-zdr', providerAuthorityHash: `sha256:${'5'.repeat(64)}`,
    providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
    providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
    entries: [], inputTokens: 0, costMicroUsd: 0, providerVectorSetChecksum: `sha256:${'7'.repeat(64)}`,
    indexChecksum: `sha256:${'8'.repeat(64)}`, createdAt: '2026-09-02T00:00:00.000Z', completedAt: '2026-09-02T00:00:01.000Z',
  });
}

describe('provider receipt partial publication', () => {
  it('leaves neither completed receipt nor binding after a post-link failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-pg-fault-'));
    roots.push(root);
    const receipt = productionReceipt();
    await expect(writeProviderEmbeddingReceipt(root, receipt, { afterFinalLink: async () => { throw new Error('post-link-fault'); } })).rejects.toThrow(/post-link/u);
    expect(await readdir(join(root, receipt.answerReleaseId))).toEqual([]);
    expect((await pool.query('SELECT count(*)::int AS count FROM public_answer_release_bindings')).rows[0].count).toBe(0);
  });

  it('leaves neither completed local receipt nor binding after a post-link failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'local-pg-fault-'));
    roots.push(root);
    const receipt = localReceipt();
    await expect(writeProviderEmbeddingReceipt(root, receipt, { afterFinalLink: async () => { throw new Error('post-link-fault'); } })).rejects.toThrow(/post-link/u);
    expect(await readdir(join(root, receipt.answerReleaseId))).toEqual([]);
    expect((await pool.query('SELECT count(*)::int AS count FROM public_answer_release_bindings')).rows[0].count).toBe(0);
  });
});
