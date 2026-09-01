import { describe, expect, it } from 'vitest';

import {
  createLocalProviderAuthorization,
  localProviderAuthorizationHash,
} from '../src/config/local-provider-authorization.js';
import { runRuntimeStartupChecks } from '../src/health/runtime-readiness.js';
import { PROVIDER_MODEL_POLICY } from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { providerChecksum } from '../src/modules/public-answer/infrastructure/openai/provider-json.js';

const binding = Object.freeze({
  contentReleaseId: '1'.repeat(64),
  answerReleaseId: '2'.repeat(64),
});

function providerCatalog() {
  return Object.freeze({
    ...binding,
    bindingId: '11111111-1111-4111-8111-111111111111',
    corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    contentManifestHash: `sha256:${'c'.repeat(64)}`,
    answerManifestHash: `sha256:${'d'.repeat(64)}`,
    answerArtifactHash: `sha256:${'e'.repeat(64)}`,
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

function localReceipt(authorizationHash = localProviderAuthorizationHash(localAuthorization())) {
  return Object.freeze({
    schemaVersion: 1 as const,
    contentReleaseId: binding.contentReleaseId,
    answerReleaseId: binding.answerReleaseId,
    contentManifestHash: `sha256:${'c'.repeat(64)}`,
    answerManifestHash: `sha256:${'d'.repeat(64)}`,
    answerArtifactHash: `sha256:${'e'.repeat(64)}`,
    corpusApprovalHash: `sha256:${'4'.repeat(64)}`,
    providerAuthorityKind: 'local-non-zdr' as const,
    providerAuthorityHash: authorizationHash,
    providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
    providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    embeddingModel: 'text-embedding-3-large' as const,
    embeddingDimensions: 3072 as const,
    embeddingSource: 'provider' as const,
    entries: Object.freeze([]),
    embeddingReceiptHash: `sha256:${'3'.repeat(64)}`,
    indexChecksum: `sha256:${'8'.repeat(64)}`,
    providerVectorSetChecksum: providerChecksum([]),
  });
}

function localAuthorization() {
  return createLocalProviderAuthorization({
    createdAt: '2026-09-02T00:00:00.000Z',
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    monthlyHardCapMicroUsd: 1_000_000,
  });
}

function localAuthority(authorizationHash = localProviderAuthorizationHash(localAuthorization())) {
  return {
    kind: 'local-non-zdr' as const,
    authorizationPath: '/tmp/authorization.json',
    budgetLedgerPath: '/tmp/ledger.json',
    authorizationHash,
  };
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
    const embeddingArgs: unknown[][] = [];
    const authorizationArgs: unknown[][] = [];
    const ledgerArgs: unknown[][] = [];
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { zdrReads += 1; throw new Error('local-non-zdr must not read ZDR'); },
      async readProviderPricing() { zdrReads += 1; throw new Error('local-non-zdr must not read ZDR'); },
      async readProviderEmbedding(...args: unknown[]) {
        embeddingArgs.push(args);
        return localReceipt();
      },
      async readLocalProviderAuthorization(...args: unknown[]) {
        authorizationArgs.push(args);
        return localAuthorization();
      },
      async openLocalBudgetLedger(...args: unknown[]) {
        ledgerArgs.push(args);
        return { kind: 'ledger' };
      },
    };
    const config = {
      nodeEnv: 'development',
      publicAskMode: 'provider',
      providerDataControlReceiptPath: null,
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      providerAuthority: localAuthority(),
    };
    await expect(runRuntimeStartupChecks(config as any, dependencies as any)).resolves.toBe(catalog);
    expect(zdrReads).toBe(0);
    expect(authorizationArgs).toEqual([['/tmp/authorization.json']]);
    expect(ledgerArgs).toEqual([['/tmp/ledger.json']]);
    expect(embeddingArgs).toEqual([[
      '/receipts/embedding',
      catalog.answerReleaseId,
      catalog.embeddingReceiptHash,
    ]]);
    expect(JSON.stringify({ embeddingArgs, authorizationArgs, ledgerArgs }))
      .not.toMatch(/question|excerpt|evidence|OPENAI_API_KEY/iu);
  });

  it('rejects a local-non-zdr index receipt that does not match the active authority or current policy', async () => {
    const catalog = providerCatalog();
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readProviderDataControl() { throw new Error('local-non-zdr must not read ZDR'); },
      async readLocalProviderAuthorization() {
        return localAuthorization();
      },
      async openLocalBudgetLedger() { return { kind: 'ledger' }; },
      async readProviderEmbedding() {
        return localReceipt(`sha256:${'b'.repeat(64)}`);
      },
    };
    await expect(runRuntimeStartupChecks({
      nodeEnv: 'development',
      publicAskMode: 'provider',
      providerDataControlReceiptPath: null,
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      providerAuthority: localAuthority(),
    } as any, dependencies as any)).rejects.toThrow(/authority|policy|local-non-zdr|receipt/u);
  });

  it('rejects a production-shaped embedding receipt as local-non-zdr runtime evidence', async () => {
    const catalog = providerCatalog();
    const dependencies = {
      pool: { async query(sql: string) { return { rows: sql === 'SELECT 1' ? [{}] : [] }; } },
      catalogSource: { async snapshot() { return catalog; } },
      async readLocalProviderAuthorization() {
        return localAuthorization();
      },
      async openLocalBudgetLedger() { return { kind: 'ledger' }; },
      async readProviderEmbedding() {
        return {
          contentReleaseId: binding.contentReleaseId,
          answerReleaseId: binding.answerReleaseId,
          embeddingModel: 'text-embedding-3-large',
          embeddingDimensions: 3072,
          embeddingSource: 'provider',
          providerDataControlReceiptHash: `sha256:${'5'.repeat(64)}`,
          providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
          embeddingReceiptHash: catalog.embeddingReceiptHash,
        };
      },
    };
    await expect(runRuntimeStartupChecks({
      nodeEnv: 'test',
      publicAskMode: 'provider',
      providerDataControlReceiptPath: null,
      providerEmbeddingReceiptRoot: '/receipts/embedding',
      providerAuthority: localAuthority(),
    } as any, dependencies as any)).rejects.toThrow(/local-non-zdr|unsupported|authority/u);
  });
});
