import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { EvaluationUsageGuard } from '../../src/modules/public-answer/evaluation/evaluation-usage-guard.js';
import { readEvaluationUsageReceipt } from '../../src/modules/public-answer/evaluation/evaluation-usage-receipt.js';
import { canonicalProviderJson, providerChecksum } from '../../src/modules/public-answer/infrastructure/openai/provider-json.js';

const receipt = {
  maxApplicationRequests: 180,
  maxApplicationProviderTokens: 2_700_000,
  maxApplicationCostMicroUsd: 694_800,
  maxIndexProviderTokens: 100_000,
  maxIndexCostMicroUsd: 20_000,
} as const;
const roots: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function usageReceipt(overrides: Record<string, unknown> = {}) {
  const body = {
    schemaVersion: 1, providerProjectHash: `sha256:${'1'.repeat(64)}`,
    providerDataControlReceiptHash: `sha256:${'2'.repeat(64)}`,
    providerPricingReceiptHash: `sha256:${'3'.repeat(64)}`,
    hiddenManifestHash: `sha256:${'4'.repeat(64)}`, corpusApprovalHash: `sha256:${'5'.repeat(64)}`,
    providerEmbeddingReceiptHash: `sha256:${'6'.repeat(64)}`, retrievalPolicyHash: `sha256:${'7'.repeat(64)}`,
    runCount: 3, maxApplicationRequests: 180, maxApplicationProviderTokens: 2_700_000,
    maxApplicationCostMicroUsd: 694_800, maxIndexProviderTokens: 100_000, maxIndexCostMicroUsd: 20_000,
    verifierIdentityHash: `sha256:${'8'.repeat(64)}`, issuedAt: '2026-08-29T00:00:00.000Z',
    expiresAt: '2026-09-02T00:00:00.000Z', ...overrides,
  };
  return { ...body, canonicalHash: providerChecksum(body) };
}

describe('evaluation usage guard', () => {
  it('admits exactly 180 application requests and rejects 181 before a call', () => {
    const guard = new EvaluationUsageGuard(receipt);
    for (let index = 0; index < 180; index += 1) guard.beginApplicationRequest().release();
    expect(() => guard.beginApplicationRequest()).toThrow(/181|request|maximum/i);
    expect(guard.snapshot().applicationRequests).toBe(180);
    expect('acquire' in guard).toBe(false);
  });

  it('retains attempted-stage worst-case charges and rejects token/currency/index overage before calls', () => {
    const guard = new EvaluationUsageGuard(receipt);
    const lease = guard.beginApplicationRequest();
    lease.beginStage('embedding');
    lease.release();
    expect(guard.snapshot()).toMatchObject({ applicationProviderTokens: 2_000, applicationCostMicroUsd: 260 });
    expect(() => guard.reserveIndex(100_001, 1)).toThrow(/index.*token|maximum/i);
    expect(() => guard.reserveIndex(1, 20_001)).toThrow(/index.*cost|maximum/i);
    guard.reserveIndex(100_000, 20_000);
    guard.settleIndex(99_000, 19_000);
    expect(guard.snapshot()).toMatchObject({ indexProviderTokens: 99_000, indexCostMicroUsd: 19_000 });
  });

  it('settles actual bucketed totals and refuses application token/cost overages', () => {
    const small = new EvaluationUsageGuard({ ...receipt, maxApplicationProviderTokens: 14_999, maxApplicationCostMicroUsd: 3_859 });
    expect(() => small.beginApplicationRequest()).toThrow(/token|cost|maximum/i);
    const guard = new EvaluationUsageGuard(receipt);
    const lease = guard.beginApplicationRequest();
    lease.beginStage('embedding');
    lease.settleStage('embedding', { inputTokens: 2, outputTokens: 0 });
    lease.release();
    expect(guard.snapshot()).toMatchObject({ applicationProviderTokens: 2, applicationCostMicroUsd: 1 });
  });

  it('strict-opens the canonical immutable receipt and binds every provider/release maximum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'evaluation-usage-')); roots.push(root);
    const path = join(root, 'usage.json');
    const sealed = usageReceipt();
    await writeFile(path, `${canonicalProviderJson(sealed)}\n`);
    const opened = await readEvaluationUsageReceipt(path, {
      providerProjectHash: sealed.providerProjectHash,
      hiddenManifestHash: sealed.hiddenManifestHash,
      providerEmbeddingReceiptHash: sealed.providerEmbeddingReceiptHash,
    }, new Date('2026-08-30T00:00:00.000Z'));
    expect(opened).toMatchObject({ runCount: 3, maxApplicationRequests: 180, maxIndexProviderTokens: 100_000 });
    expect(opened.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('rejects substituted, forged, expired, non-canonical, and symlinked receipts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'evaluation-usage-negative-')); roots.push(root);
    const valid = usageReceipt();
    for (const [name, value] of [
      ['substituted', usageReceipt({ hiddenManifestHash: `sha256:${'9'.repeat(64)}` })],
      ['forged', { ...valid, maxApplicationRequests: 181 }],
      ['expired', usageReceipt({ expiresAt: '2026-08-29T00:00:00.000Z' })],
    ] as const) {
      const path = join(root, `${name}.json`);
      await writeFile(path, `${canonicalProviderJson(value)}\n`);
      await expect(readEvaluationUsageReceipt(path, {
        hiddenManifestHash: valid.hiddenManifestHash,
      }, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow();
    }
    const pretty = join(root, 'pretty.json');
    await writeFile(pretty, `${JSON.stringify(valid, null, 2)}\n`);
    await expect(readEvaluationUsageReceipt(pretty, {}, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow(/canonical/i);
    const target = join(root, 'target.json');
    const link = join(root, 'link.json');
    await writeFile(target, `${canonicalProviderJson(valid)}\n`);
    await symlink(target, link);
    await expect(readEvaluationUsageReceipt(link, {}, new Date('2026-08-30T00:00:00.000Z'))).rejects.toThrow(/symbolic/i);
  });
});
