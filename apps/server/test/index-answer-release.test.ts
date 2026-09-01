import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  localLiveIndexReopensExactly,
  parseIndexCommand,
  parseIndexEmbeddingMode,
  providerIndexBudget,
  reserveAndEmbedCorpus,
} from '../src/index-answer-release.js';
import { PublicAnswerCostLimitError } from '../src/modules/public-answer/domain/public-answer-errors.js';
import { LocalBudgetLedger } from '../src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { createProviderEmbeddingReceipt } from '../src/modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import {
  PROVIDER_MODEL_POLICY,
  providerOperationCostMicroUsd,
} from '../src/modules/public-answer/infrastructure/openai/provider-model-policy.js';

const roots: string[] = [];
const SEPTEMBER = Date.parse('2026-09-02T10:00:00.000Z');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function ledgerPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'index-budget-'));
  roots.push(root);
  return join(root, 'budget-ledger.json');
}

function embeddingTokensForCost(cost: number): number {
  const tokens = Math.floor((cost - 1) * 1_000_000 / PROVIDER_MODEL_POLICY.prices.embeddingInput) + 1;
  if (providerOperationCostMicroUsd('corpus-embedding', { inputTokens: tokens, outputTokens: 0 }) !== cost) {
    throw new Error(`no embedding token count for ${cost}`);
  }
  return tokens;
}

function hash(nibble: string): string {
  return `sha256:${nibble.repeat(64)}`;
}

function localReceipt(overrides: Record<string, unknown> = {}) {
  return createProviderEmbeddingReceipt({
    schemaVersion: 1,
    contentReleaseId: 'a'.repeat(64),
    answerReleaseId: 'b'.repeat(64),
    contentManifestHash: hash('1'),
    answerManifestHash: hash('2'),
    answerArtifactHash: hash('3'),
    corpusApprovalHash: hash('4'),
    providerAuthorityKind: 'local-non-zdr',
    providerAuthorityHash: hash('5'),
    providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
    providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    embeddingModel: 'text-embedding-3-large',
    embeddingDimensions: 3072,
    embeddingSource: 'provider',
    entries: [{ chunkChecksum: hash('7'), vectorChecksum: hash('8') }],
    inputTokens: 3,
    costMicroUsd: providerOperationCostMicroUsd('corpus-embedding', { inputTokens: 3, outputTokens: 0 }),
    providerVectorSetChecksum: hash('9'),
    indexChecksum: hash('a'),
    createdAt: '2026-09-02T00:00:00.000Z',
    completedAt: '2026-09-02T00:00:01.000Z',
    ...overrides,
  } as any);
}

function productionReceipt() {
  return createProviderEmbeddingReceipt({
    schemaVersion: 1,
    contentReleaseId: 'a'.repeat(64),
    answerReleaseId: 'b'.repeat(64),
    contentManifestHash: hash('1'),
    answerManifestHash: hash('2'),
    answerArtifactHash: hash('3'),
    corpusApprovalHash: hash('4'),
    providerDataControlReceiptHash: hash('5'),
    providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    embeddingModel: 'text-embedding-3-large',
    embeddingDimensions: 3072,
    embeddingSource: 'provider',
    entries: [{ chunkChecksum: hash('7'), vectorChecksum: hash('8') }],
    inputTokens: 3,
    costMicroUsd: 1,
    providerVectorSetChecksum: hash('9'),
    indexChecksum: hash('a'),
    createdAt: '2026-08-30T00:00:00.000Z',
    completedAt: '2026-08-30T00:00:01.000Z',
  });
}

function answer() {
  return {
    contentReleaseId: 'a'.repeat(64),
    answerReleaseId: 'b'.repeat(64),
    manifest: { identity: { contentManifestHash: hash('1') } },
    manifestHash: hash('2'),
    artifactHash: hash('3'),
    corpusApprovalHash: hash('4'),
    chunks: [{ chunkId: 'c'.repeat(64) }],
    indexInputs: [{ chunkChecksum: hash('7'), text: '한' }],
  };
}

function binding(receipt: ReturnType<typeof localReceipt>) {
  return {
    binding_id: '11111111-1111-4111-8111-111111111111',
    content_release_id: receipt.contentReleaseId,
    answer_release_id: receipt.answerReleaseId,
    content_manifest_hash: receipt.contentManifestHash,
    answer_manifest_hash: receipt.answerManifestHash,
    answer_artifact_hash: receipt.answerArtifactHash,
    embedding_model: receipt.embeddingModel,
    embedding_dimensions: receipt.embeddingDimensions,
    embedding_source: receipt.embeddingSource,
    embedding_receipt_hash: receipt.embeddingReceiptHash,
    chunk_count: receipt.entries.length,
    index_checksum: receipt.indexChecksum,
    state: 'active',
  };
}

describe('local live indexing command', () => {
  it('accepts the local-authority provider flags and keeps production behind two flags', () => {
    expect(parseIndexCommand(['--embedding-mode=fixture'])).toEqual({
      mode: 'fixture', providerAuthority: null,
    });
    expect(parseIndexCommand(['--embedding-mode=provider', '--confirm-live-provider'])).toEqual({
      mode: 'provider', providerAuthority: 'production-zdr',
    });
    expect(parseIndexCommand([
      '--embedding-mode=provider', '--confirm-live-provider', '--provider-authority=local',
    ])).toEqual({
      mode: 'provider', providerAuthority: 'local-non-zdr',
    });
    expect(parseIndexEmbeddingMode([
      '--embedding-mode=provider', '--confirm-live-provider', '--provider-authority=local',
    ])).toBe('provider');
    expect(() => parseIndexCommand(['--embedding-mode=provider', '--confirm-live-provider', '--provider-authority=production'])).toThrow(/confirmation|explicit/u);
  });

  it('reserves corpus-embedding max before embed, settles measured usage, and keeps ambiguous failures', async () => {
    const path = await ledgerPath();
    const ledger = await LocalBudgetLedger.open(path, { clock: () => SEPTEMBER, hardCapMicroUsd: 1_000_000 });
    const inputs = [{ chunkChecksum: 'same', text: '한' }];
    const budget = providerIndexBudget(inputs);
    const reserved = providerOperationCostMicroUsd('corpus-embedding', {
      inputTokens: budget.tokenUpperBound, outputTokens: 0,
    });
    const events: string[] = [];
    const embedded = await reserveAndEmbedCorpus(ledger, inputs, async () => {
      events.push('embed');
      expect(await ledger.snapshot()).toMatchObject({ chargedMicroUsd: reserved });
      return { usage: { inputTokens: 2, outputTokens: 0 }, vectors: [[0]] };
    });
    expect(events).toEqual(['embed']);
    expect(embedded.usage.inputTokens).toBe(2);
    expect(await ledger.snapshot()).toMatchObject({
      chargedMicroUsd: providerOperationCostMicroUsd('corpus-embedding', { inputTokens: 2, outputTokens: 0 }),
    });
    const settled = JSON.parse(await readFile(path, 'utf8')) as { operations: Array<{ state: string }> };
    expect(settled.operations[0]?.state).toBe('settled');

    const failLedgerPath = await ledgerPath();
    const failLedger = await LocalBudgetLedger.open(failLedgerPath, { clock: () => SEPTEMBER, hardCapMicroUsd: 1_000_000 });
    let embedCalls = 0;
    await expect(reserveAndEmbedCorpus(failLedger, inputs, async () => {
      embedCalls += 1;
      throw new Error('provider transport failed');
    })).rejects.toThrow(/provider transport failed/u);
    expect(embedCalls).toBe(1);
    expect(await failLedger.snapshot()).toMatchObject({ chargedMicroUsd: reserved });
    const failed = JSON.parse(await readFile(failLedgerPath, 'utf8')) as {
      operations: Array<{ state: string; chargedMicroUsd: number }>;
    };
    expect(failed.operations[0]).toMatchObject({ state: 'ambiguous', chargedMicroUsd: reserved });
  });

  it('does not embed when the monthly corpus-embedding reservation would exceed the cap', async () => {
    const path = await ledgerPath();
    const ledger = await LocalBudgetLedger.open(path, { clock: () => SEPTEMBER, hardCapMicroUsd: 1_000_000 });
    await ledger.reserve({
      operation: 'corpus-embedding',
      maxUsage: { inputTokens: embeddingTokensForCost(1_000_000), outputTokens: 0 },
    });
    let embedCalls = 0;
    await expect(reserveAndEmbedCorpus(ledger, [{ chunkChecksum: 'same', text: '한' }], async () => {
      embedCalls += 1;
      return { usage: { inputTokens: 1, outputTokens: 0 } };
    })).rejects.toBeInstanceOf(PublicAnswerCostLimitError);
    expect(embedCalls).toBe(0);
  });

  it('reuses a live index only when authority, policy, pricing, checksums, and binding reopen exactly', () => {
    const receipt = localReceipt();
    const expected = {
      providerAuthorityHash: hash('5'),
      providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
      providerPricingReceiptHash: PROVIDER_MODEL_POLICY.pricingReceiptHash,
    };
    expect(localLiveIndexReopensExactly(answer(), receipt, binding(receipt), expected)).toBe(true);
    expect(localLiveIndexReopensExactly(answer(), receipt, { ...binding(receipt), index_checksum: hash('0') }, expected)).toBe(false);
    expect(localLiveIndexReopensExactly(
      { ...answer(), corpusApprovalHash: hash('0') },
      receipt,
      binding(receipt),
      expected,
    )).toBe(false);
    expect(() => localLiveIndexReopensExactly(answer(), productionReceipt(), binding(receipt), expected))
      .toThrow(/unsupported|old|local-non-zdr/u);
  });
});
