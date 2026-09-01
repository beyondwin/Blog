import { describe, expect, it } from 'vitest';

import { runRuntimeStartupChecks } from '../src/health/runtime-readiness.js';
import { providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';

const binding = Object.freeze({
  contentReleaseId: '1'.repeat(64),
  answerReleaseId: '2'.repeat(64),
});

function providerCatalog() {
  return Object.freeze({
    ...binding,
    bindingId: '11111111-1111-4111-8111-111111111111',
    embeddingSource: 'provider' as const,
    embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
    chunkChecksumById: new Map(),
    indexInputByChunkId: new Map(),
    vectorChecksumByChunkId: new Map(),
    vectorSetChecksum: providerChecksum([]),
    indexRowsChecksum: providerChecksum([]),
    indexChecksum: `sha256:${'8'.repeat(64)}`,
  });
}

describe('runtime readiness provider authority', () => {
  it('rejects local-non-zdr as production readiness evidence', async () => {
    const catalog = providerCatalog();
    let zdrReads = 0;
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() {
        zdrReads += 1;
        return { receiptHash: `sha256:${'5'.repeat(64)}` };
      },
      async readProviderPricing() { zdrReads += 1; return { receiptHash: `sha256:${'6'.repeat(64)}` }; },
      async readProviderEmbedding() { zdrReads += 1; throw new Error('must not call production evidence'); },
    };
    const config = {
      nodeEnv: 'production',
      publicAskMode: 'provider',
      providerDataControlReceiptPath: '/receipts/control.json',
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      productionEvalReportPath: '/receipts/eval.json',
      evaluationUsageReceiptPath: '/receipts/usage.json',
      providerAuthority: {
        kind: 'local-non-zdr',
        authorizationPath: '/tmp/authorization.json',
        budgetLedgerPath: '/tmp/ledger.json',
        authorizationHash: `sha256:${'a'.repeat(64)}`,
      },
    } as const;
    await expect(runRuntimeStartupChecks(config as any, dependencies as any))
      .rejects.toThrow(/local-non-zdr|production-zdr/u);
    expect(zdrReads).toBe(0);
  });

  it('accepts only production-zdr for production provider readiness', async () => {
    const catalog = providerCatalog();
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { return { projectHash: `sha256:${'9'.repeat(64)}`, receiptHash: `sha256:${'5'.repeat(64)}` }; },
      async readProviderPricing() { return { receiptHash: `sha256:${'6'.repeat(64)}` }; },
      async readProviderEmbedding() {
        return {
          contentReleaseId: binding.contentReleaseId, answerReleaseId: binding.answerReleaseId,
          embeddingModel: 'text-embedding-3-large', embeddingDimensions: 3072, embeddingSource: 'provider',
          providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`,
          providerPricingReceiptHash: `sha256:${'6'.repeat(64)}`,
        };
      },
      async readPublicEvaluationManifest() { return Buffer.from('public-eval-manifest'); },
      async readEvaluationUsage() { return { receiptHash: `sha256:${'7'.repeat(64)}`, hiddenManifestHash: `sha256:${'8'.repeat(64)}` }; },
      async readProductionEvaluation() {
        return { evaluationUsageReceiptHash: `sha256:${'7'.repeat(64)}`, hiddenManifestHash: `sha256:${'8'.repeat(64)}` };
      },
    };
    const accepted = {
      nodeEnv: 'production', publicAskMode: 'provider',
      providerDataControlReceiptPath: '/receipts/control.json',
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      productionEvalReportPath: '/receipts/eval.json',
      evaluationUsageReceiptPath: '/receipts/usage.json',
      providerAuthority: { kind: 'production-zdr', receiptPath: '/receipts/control.json' },
    };
    await expect(runRuntimeStartupChecks(accepted as any, dependencies as any)).resolves.toBe(catalog);

    const missingAuthority = { ...accepted, providerAuthority: null };
    await expect(runRuntimeStartupChecks(missingAuthority as any, dependencies as any))
      .rejects.toThrow(/production-zdr/u);
  });

  it('does not read production ZDR receipts for local-non-zdr loopback provider mode', async () => {
    const catalog = providerCatalog();
    let zdrReads = 0;
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { zdrReads += 1; throw new Error('local-non-zdr must not read ZDR'); },
      async readProviderPricing() { zdrReads += 1; throw new Error('local-non-zdr must not read ZDR'); },
      async readProviderEmbedding() { zdrReads += 1; throw new Error('local-non-zdr must not read ZDR'); },
    };
    const config = {
      nodeEnv: 'development',
      publicAskMode: 'provider',
      providerDataControlReceiptPath: null,
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      providerAuthority: {
        kind: 'local-non-zdr',
        authorizationPath: '/tmp/authorization.json',
        budgetLedgerPath: '/tmp/ledger.json',
        authorizationHash: `sha256:${'a'.repeat(64)}`,
      },
    };
    await expect(runRuntimeStartupChecks(config as any, dependencies as any)).resolves.toBe(catalog);
    expect(zdrReads).toBe(0);
  });
});
