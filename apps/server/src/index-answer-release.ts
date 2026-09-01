import { pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';

import type { Pool } from 'pg';

import { parseServerConfig } from './config/server-config.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { LocalBudgetLedger } from './modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { readProviderDataControlReceipt } from './config/provider-data-control-receipt.js';
import { OpenAIEmbeddingClient } from './modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import {
  estimateEmbeddingCostMicroUsd,
  isLocalProviderEmbeddingReceipt,
  readBundledProviderPricing,
  readProviderEmbeddingReceipt,
  writeProviderEmbeddingReceipt,
  type DurableProviderEmbeddingReceipt,
} from './modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
import {
  PROVIDER_MODEL_POLICY,
} from './modules/public-answer/infrastructure/openai/provider-model-policy.js';
import {
  createProviderEmbeddingAuthorities,
  createFixtureEmbeddingReceipt,
  type EmbeddingProvenanceReceipt,
  PostgresAnswerReleaseIndexer,
  prepareEmbeddingSet,
} from './modules/public-answer/infrastructure/postgres/postgres-answer-release-indexer.js';
import { runPostgresMigrations } from './modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { createPostgresPool } from './modules/public-answer/infrastructure/postgres/postgres-pool.js';
import {
  readVerifiedAnswerReleaseAuthority,
  type VerifiedActivePublicAnswerReleaseAuthority,
} from './modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import type { EmbeddingClient } from './modules/public-answer/application/ports/embedding-client.js';

export interface ActivatedBindingRow {
  binding_id: string; content_release_id: string; answer_release_id: string; content_manifest_hash: string;
  answer_manifest_hash: string; answer_artifact_hash: string; embedding_model: string;
  embedding_dimensions: number; embedding_source: string; embedding_receipt_hash: string;
  chunk_count: number; index_checksum: string; state: string;
}

export interface ActivatedBindingAuthority {
  bindingId: string; contentReleaseId: string; answerReleaseId: string; contentManifestHash: string;
  answerManifestHash: string; answerArtifactHash: string; corpusApprovalHash: string;
  embeddingModel: string; embeddingDimensions: number; embeddingSource: string;
  embeddingReceiptHash: string; chunkCount: number; indexChecksum: string;
}

export function parseIndexCommand(argv: readonly string[]): Readonly<{
  mode: 'fixture' | 'provider';
  providerAuthority: 'local-non-zdr' | 'production-zdr' | null;
}> {
  if (argv.length === 1 && argv[0] === '--embedding-mode=fixture') {
    return { mode: 'fixture', providerAuthority: null };
  }
  if (argv.length === 2 && argv[0] === '--embedding-mode=provider' && argv[1] === '--confirm-live-provider') {
    return { mode: 'provider', providerAuthority: 'production-zdr' };
  }
  if (argv.length === 3 && argv[0] === '--embedding-mode=provider' && argv[1] === '--confirm-live-provider'
    && argv[2] === '--provider-authority=local') {
    return { mode: 'provider', providerAuthority: 'local-non-zdr' };
  }
  throw new Error('indexing requires one explicit embedding mode and provider confirmation');
}

export function parseIndexEmbeddingMode(argv: readonly string[]): 'fixture' | 'provider' {
  return parseIndexCommand(argv).mode;
}

export async function reserveAndEmbedCorpus<T extends { usage: { inputTokens: number } }>(
  ledger: LocalBudgetLedger,
  inputs: readonly { chunkChecksum: string; text: string }[],
  embed: () => Promise<T>,
): Promise<T> {
  const reservation = await ledger.reserve({
    operation: 'corpus-embedding',
    maxUsage: { inputTokens: providerIndexBudget(inputs).tokenUpperBound, outputTokens: 0 },
  });
  await reservation.begin();
  try {
    const embedded = await embed();
    await reservation.settle({ inputTokens: embedded.usage.inputTokens, outputTokens: 0 });
    return embedded;
  } catch (error) {
    // After begin(), provider acceptance is ambiguous; do not releaseUnattempted.
    throw error;
  }
}

export function localLiveIndexReopensExactly(
  answer: {
    contentReleaseId: string;
    answerReleaseId: string;
    manifest: { identity: { contentManifestHash: string } };
    manifestHash: string;
    artifactHash: string;
    corpusApprovalHash: string;
    indexInputs: readonly { chunkChecksum: string }[];
  },
  receipt: DurableProviderEmbeddingReceipt,
  binding: ActivatedBindingRow,
  expected: Readonly<{
    providerAuthorityHash: string;
    providerPolicyHash: string;
    providerPricingReceiptHash: string;
  }>,
): boolean {
  if (!isLocalProviderEmbeddingReceipt(receipt)) {
    throw new Error('old provider embedding receipt is unsupported');
  }
  const releaseMatches = receipt.contentReleaseId === answer.contentReleaseId
    && receipt.answerReleaseId === answer.answerReleaseId
    && receipt.contentManifestHash === answer.manifest.identity.contentManifestHash
    && receipt.answerManifestHash === answer.manifestHash
    && receipt.answerArtifactHash === answer.artifactHash
    && receipt.corpusApprovalHash === answer.corpusApprovalHash
    && receipt.providerAuthorityKind === 'local-non-zdr'
    && receipt.providerAuthorityHash === expected.providerAuthorityHash
    && receipt.providerPolicyHash === expected.providerPolicyHash
    && receipt.providerPolicyHash === PROVIDER_MODEL_POLICY.policyHash
    && receipt.providerPricingReceiptHash === expected.providerPricingReceiptHash
    && receipt.providerPricingReceiptHash === PROVIDER_MODEL_POLICY.pricingReceiptHash
    && receipt.embeddingModel === PROVIDER_MODEL_POLICY.embeddingModel
    && receipt.embeddingDimensions === PROVIDER_MODEL_POLICY.embeddingDimensions
    && receipt.entries.length === answer.indexInputs.length
    && receipt.entries.every((entry, index) => entry.chunkChecksum === answer.indexInputs[index]?.chunkChecksum);
  const bindingMatches = binding.content_release_id === receipt.contentReleaseId
    && binding.answer_release_id === receipt.answerReleaseId
    && binding.content_manifest_hash === receipt.contentManifestHash
    && binding.answer_manifest_hash === receipt.answerManifestHash
    && binding.answer_artifact_hash === receipt.answerArtifactHash
    && binding.embedding_model === receipt.embeddingModel
    && binding.embedding_dimensions === receipt.embeddingDimensions
    && binding.embedding_source === receipt.embeddingSource
    && binding.embedding_receipt_hash === receipt.embeddingReceiptHash
    && binding.chunk_count === receipt.entries.length
    && binding.index_checksum === receipt.indexChecksum
    && binding.state === 'active';
  return releaseMatches && bindingMatches;
}

export function providerIndexBudget(inputs: readonly { chunkChecksum: string; text: string }[]): Readonly<{ tokenUpperBound: number; costUpperBoundMicroUsd: number }> {
  const unique = orderedUniqueIndexInputs(inputs);
  const tokenUpperBound = unique.reduce((total, item) => total + Buffer.byteLength(item.text, 'utf8'), 0);
  const costUpperBoundMicroUsd = estimateEmbeddingCostMicroUsd(tokenUpperBound);
  if (tokenUpperBound > 100_000 || costUpperBoundMicroUsd > 20_000) throw new Error('provider indexing maximum exceeded before call');
  return Object.freeze({ tokenUpperBound, costUpperBoundMicroUsd });
}

function orderedUniqueIndexInputs<T extends { chunkChecksum: string }>(inputs: readonly T[]): readonly T[] {
  return [...new Map(inputs.map((item) => [item.chunkChecksum, item])).values()];
}

export function assertCompleteActivatedBinding(
  row: ActivatedBindingRow,
  authority: ActivatedBindingAuthority,
  verifiedCorpusApprovalHash: string = authority.corpusApprovalHash,
): void {
  const expected: ActivatedBindingRow = {
    binding_id: authority.bindingId, content_release_id: authority.contentReleaseId,
    answer_release_id: authority.answerReleaseId, content_manifest_hash: authority.contentManifestHash,
    answer_manifest_hash: authority.answerManifestHash, answer_artifact_hash: authority.answerArtifactHash,
    embedding_model: authority.embeddingModel, embedding_dimensions: authority.embeddingDimensions,
    embedding_source: authority.embeddingSource, embedding_receipt_hash: authority.embeddingReceiptHash,
    chunk_count: authority.chunkCount, index_checksum: authority.indexChecksum, state: 'active',
  };
  if (JSON.stringify(row) !== JSON.stringify(expected)) throw new Error('complete binding reread mismatch');
  if (authority.corpusApprovalHash !== verifiedCorpusApprovalHash) throw new Error('approval authority mismatch');
}

function bindingAuthority(answer: VerifiedActivePublicAnswerReleaseAuthority, receipt: EmbeddingProvenanceReceipt): ActivatedBindingAuthority {
  return {
    bindingId: receipt.bindingId, contentReleaseId: answer.contentReleaseId, answerReleaseId: answer.answerReleaseId,
    contentManifestHash: answer.manifest.identity.contentManifestHash, answerManifestHash: answer.manifestHash,
    answerArtifactHash: answer.artifactHash, corpusApprovalHash: receipt.corpusApprovalHash,
    embeddingModel: receipt.model, embeddingDimensions: receipt.dimensions, embeddingSource: receipt.source,
    embeddingReceiptHash: receipt.receiptHash, chunkCount: answer.chunks.length, indexChecksum: receipt.indexChecksum,
  };
}

export function verifyPreauthorizedProviderEmbeddingReceipt(
  answer: Pick<VerifiedActivePublicAnswerReleaseAuthority,
    'contentReleaseId' | 'answerReleaseId' | 'manifest' | 'manifestHash' | 'artifactHash' | 'corpusApprovalHash' | 'indexInputs'>,
  receipt: {
    contentReleaseId: string; answerReleaseId: string; contentManifestHash: string; answerManifestHash: string;
    answerArtifactHash: string; corpusApprovalHash: string; providerDataControlReceiptHash: string;
    providerPricingReceiptHash: string; createdAt: string; completedAt: string; inputTokens: number;
    costMicroUsd: number; entries: readonly { readonly chunkChecksum: string }[];
  },
  expected: Readonly<{
    providerDataControlReceiptHash: string; providerPricingReceiptHash: string;
    maxInputTokens: number; maxCostMicroUsd: number;
    orderedIndexInputs: readonly { readonly chunkChecksum: string }[];
  }>,
): Readonly<{ createdAt: string; completedAt: string }> {
  const releaseMatches = receipt.contentReleaseId === answer.contentReleaseId
    && receipt.answerReleaseId === answer.answerReleaseId
    && receipt.contentManifestHash === answer.manifest.identity.contentManifestHash
    && receipt.answerManifestHash === answer.manifestHash && receipt.answerArtifactHash === answer.artifactHash
    && receipt.corpusApprovalHash === answer.corpusApprovalHash;
  const authorityMatches = receipt.providerDataControlReceiptHash === expected.providerDataControlReceiptHash
    && receipt.providerPricingReceiptHash === expected.providerPricingReceiptHash
    && receipt.inputTokens <= expected.maxInputTokens && receipt.costMicroUsd <= expected.maxCostMicroUsd;
  const chunkChecksums = expected.orderedIndexInputs.map(({ chunkChecksum }) => chunkChecksum);
  if (!releaseMatches || !authorityMatches || receipt.entries.length !== chunkChecksums.length
    || receipt.entries.some((entry, index) => entry.chunkChecksum !== chunkChecksums[index])) {
    throw new Error('preauthorized provider embedding receipt release or authority mismatch');
  }
  return Object.freeze({ createdAt: receipt.createdAt, completedAt: receipt.completedAt });
}

export interface IndexAnswerReleaseOptions {
  readonly expectedProviderReceiptHash?: string;
  readonly providerEmbeddingClient?: EmbeddingClient;
}

function emitIndexSuccess(
  stdout: (value: string) => void,
  answer: VerifiedActivePublicAnswerReleaseAuthority,
  model: string,
): void {
  stdout(JSON.stringify({
    kind: 'success', contentReleaseId: answer.contentReleaseId.slice(0, 12), answerReleaseId: answer.answerReleaseId.slice(0, 12),
    approvalHash: answer.corpusApprovalHash.slice(0, 19), chunkCount: answer.chunks.length, model,
  }) + '\n');
}

async function readReusableLocalLiveIndex(
  pool: Pool,
  answer: VerifiedActivePublicAnswerReleaseAuthority,
  expected: Readonly<{
    providerAuthorityHash: string;
    providerPolicyHash: string;
    providerPricingReceiptHash: string;
  }>,
  receiptRoot: string,
): Promise<Readonly<{ row: ActivatedBindingRow; receipt: DurableProviderEmbeddingReceipt }> | null> {
  const active = await pool.query<ActivatedBindingRow>(`SELECT binding_id,content_release_id,answer_release_id,
    content_manifest_hash,answer_manifest_hash,answer_artifact_hash,embedding_model,embedding_dimensions,
    embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state
    FROM public_answer_release_bindings WHERE state='active'`);
  if (active.rowCount !== 1) return null;
  const row = active.rows[0]!;
  if (row.embedding_source !== 'provider') return null;
  let receipt: DurableProviderEmbeddingReceipt;
  try {
    receipt = await readProviderEmbeddingReceipt(receiptRoot, answer.answerReleaseId, row.embedding_receipt_hash);
  } catch {
    return null;
  }
  if (!localLiveIndexReopensExactly(answer, receipt, row, expected)) return null;
  const chunks = await pool.query<{ chunk_checksum: string }>(
    'SELECT chunk_checksum FROM public_answer_chunks WHERE binding_id=$1 ORDER BY chunk_id', [row.binding_id],
  );
  const expectedChecksums = [...answer.indexInputs]
    .sort((left, right) => left.chunkChecksum < right.chunkChecksum ? -1 : left.chunkChecksum > right.chunkChecksum ? 1 : 0)
    .map((item) => item.chunkChecksum);
  const written = [...chunks.rows].map((item) => item.chunk_checksum).sort();
  if (written.length !== expectedChecksums.length || written.some((checksum, index) => checksum !== expectedChecksums[index])) {
    return null;
  }
  return { row, receipt };
}

export async function indexAnswerRelease(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  stdout: (value: string) => void = (value) => process.stdout.write(value),
  options: Readonly<IndexAnswerReleaseOptions> = {},
): Promise<void> {
  const command = parseIndexCommand(argv);
  const fixture = command.mode === 'fixture';
  const provider = command.mode === 'provider';
  const local = command.providerAuthority === 'local-non-zdr';
  const config = await parseServerConfig(env);
  if (fixture && config.publicAskMode !== 'fixture') throw new Error('fixture indexing requires fixture mode');
  if (provider && config.publicAskMode !== 'provider') throw new Error('provider indexing requires provider mode');
  const { answer } = await readVerifiedAnswerReleaseAuthority(config);
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runPostgresMigrations(pool);
    if (provider) stdout('{"kind":"cost-warning","maxEmbeddingTokens":100000,"maxMicroUsd":20000}\n');
    const budget = provider ? providerIndexBudget(answer.indexInputs) : null;
    const pricing = provider ? await readBundledProviderPricing() : null;
    if (provider && budget!.costUpperBoundMicroUsd !== estimateEmbeddingCostMicroUsd(budget!.tokenUpperBound, pricing!.embeddingInputMicroUsdPerMillionTokens)) throw new Error('provider pricing arithmetic mismatch');
    if (local) {
      if (config.providerAuthority?.kind !== 'local-non-zdr' || !config.openAiApiKey || !config.providerEmbeddingReceiptRoot) {
        throw new Error('local provider indexing requires key, receipt root, and local-non-zdr authority');
      }
    } else if (provider && (!config.openAiApiKey || !config.providerDataControlReceiptPath || !config.providerEmbeddingReceiptRoot)) {
      throw new Error('provider indexing requires key, data-control receipt, pricing, and receipt root');
    }
    const localAuthority = config.providerAuthority?.kind === 'local-non-zdr' ? config.providerAuthority : null;
    if (local && localAuthority && pricing) {
      const reused = await readReusableLocalLiveIndex(pool, answer, {
        providerAuthorityHash: localAuthority.authorizationHash,
        providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
        providerPricingReceiptHash: pricing.receiptHash,
      }, config.providerEmbeddingReceiptRoot!);
      if (reused) {
        const authority: ActivatedBindingAuthority = {
          bindingId: reused.row.binding_id, contentReleaseId: reused.row.content_release_id,
          answerReleaseId: reused.row.answer_release_id, contentManifestHash: reused.row.content_manifest_hash,
          answerManifestHash: reused.row.answer_manifest_hash, answerArtifactHash: reused.row.answer_artifact_hash,
          corpusApprovalHash: answer.corpusApprovalHash, embeddingModel: reused.row.embedding_model,
          embeddingDimensions: reused.row.embedding_dimensions, embeddingSource: reused.row.embedding_source,
          embeddingReceiptHash: reused.row.embedding_receipt_hash, chunkCount: reused.row.chunk_count,
          indexChecksum: reused.row.index_checksum,
        };
        assertCompleteActivatedBinding(reused.row, authority, answer.corpusApprovalHash);
        emitIndexSuccess(stdout, answer, reused.receipt.embeddingModel);
        return;
      }
    }
    const dataControl = provider && !local ? await readProviderDataControlReceipt(config.providerDataControlReceiptPath!) : null;
    const expectedProviderReceipt = provider && !local && options.expectedProviderReceiptHash
      ? await readProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, answer.answerReleaseId,
        options.expectedProviderReceiptHash)
      : null;
    if (expectedProviderReceipt && isLocalProviderEmbeddingReceipt(expectedProviderReceipt)) {
      throw new Error('local-non-zdr embedding receipts are not production authority');
    }
    const authorizedTimes = expectedProviderReceipt && !isLocalProviderEmbeddingReceipt(expectedProviderReceipt)
      ? verifyPreauthorizedProviderEmbeddingReceipt(answer, expectedProviderReceipt, {
        providerDataControlReceiptHash: dataControl!.receiptHash,
        providerPricingReceiptHash: pricing!.receiptHash,
        maxInputTokens: budget!.tokenUpperBound,
        maxCostMicroUsd: budget!.costUpperBoundMicroUsd,
        orderedIndexInputs: orderedUniqueIndexInputs(answer.indexInputs),
      }) : null;
    const startedAt = authorizedTimes?.createdAt ?? new Date().toISOString();
    const client = provider
      ? options.providerEmbeddingClient ?? new OpenAIEmbeddingClient(config.openAiApiKey!, { profile: 'index' })
      : new DeterministicEmbeddingClient(config.nodeEnv);
    const signal = new AbortController().signal;
    const prepared = local && localAuthority
      ? await reserveAndEmbedCorpus(
        await LocalBudgetLedger.open(localAuthority.budgetLedgerPath),
        answer.indexInputs,
        () => prepareEmbeddingSet(answer, client, signal),
      )
      : await prepareEmbeddingSet(answer, client, signal);
    const providerAuthorities = provider ? createProviderEmbeddingAuthorities(answer, prepared, local && localAuthority ? {
      providerAuthorityKind: 'local-non-zdr',
      providerAuthorityHash: localAuthority.authorizationHash,
      providerPolicyHash: PROVIDER_MODEL_POLICY.policyHash,
      providerPricingReceiptHash: pricing!.receiptHash,
      createdAt: startedAt, completedAt: authorizedTimes?.completedAt ?? new Date().toISOString(),
    } : {
      providerDataControlReceiptHash: dataControl!.receiptHash, providerPricingReceiptHash: pricing!.receiptHash,
      createdAt: startedAt, completedAt: authorizedTimes?.completedAt ?? new Date().toISOString(),
    }) : null;
    if (providerAuthorities && (providerAuthorities.durable.inputTokens > 100_000 || providerAuthorities.durable.costMicroUsd > 20_000)) {
      throw new Error('provider indexing measured maximum exceeded');
    }
    if (expectedProviderReceipt && providerAuthorities?.durable.embeddingReceiptHash !== expectedProviderReceipt.embeddingReceiptHash) {
      throw new Error('provider indexing result does not match the exact preauthorized receipt');
    }
    const receipt = providerAuthorities?.activation ?? createFixtureEmbeddingReceipt(prepared);
    let reopenedProvider; let providerReceiptPath: string | undefined;
    if (providerAuthorities) {
      if (expectedProviderReceipt) reopenedProvider = expectedProviderReceipt;
      else {
        providerReceiptPath = await writeProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, providerAuthorities.durable);
        try { reopenedProvider = await readProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, answer.answerReleaseId, providerAuthorities.durable.embeddingReceiptHash); }
        catch (error) { await rm(providerReceiptPath, { force: true }); throw error; }
      }
    }
    let activated;
    try { activated = await new PostgresAnswerReleaseIndexer(config.nodeEnv)
      .activate(answer, prepared, receipt, pool, new AbortController().signal, reopenedProvider); }
    catch (error) { if (providerReceiptPath) await rm(providerReceiptPath, { force: true }); throw error; }
    const reread = await pool.query<ActivatedBindingRow>(`SELECT binding_id,content_release_id,answer_release_id,
      content_manifest_hash,answer_manifest_hash,answer_artifact_hash,embedding_model,embedding_dimensions,
      embedding_source,embedding_receipt_hash,chunk_count,index_checksum,state
      FROM public_answer_release_bindings WHERE binding_id=$1`, [activated.bindingId]);
    const row = reread.rows[0];
    if (!row) throw new Error('complete binding reread mismatch');
    assertCompleteActivatedBinding(row, bindingAuthority(answer, receipt), answer.corpusApprovalHash);
    emitIndexSuccess(stdout, answer, receipt.model);
  } finally { await pool.end(); }
}

export async function runIndexAnswerReleaseCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: Readonly<{ stdout(value: string): void; stderr(value: string): void }> = {
    stdout: (value) => process.stdout.write(value), stderr: (value) => process.stderr.write(value),
  },
  operation: typeof indexAnswerRelease = indexAnswerRelease,
): Promise<0 | 1> {
  try {
    await operation(argv, env, io.stdout);
    return 0;
  } catch {
    io.stderr('{"kind":"failure"}\n');
    return 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await runIndexAnswerReleaseCli(process.argv.slice(2), process.env);
}
