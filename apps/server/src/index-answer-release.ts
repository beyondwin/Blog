import { pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';

import { parseServerConfig } from './config/server-config.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import { readProviderDataControlReceipt } from './config/provider-data-control-receipt.js';
import { OpenAIEmbeddingClient } from './modules/public-answer/infrastructure/openai/openai-embedding-client.js';
import { estimateEmbeddingCostMicroUsd, readBundledProviderPricing, readProviderEmbeddingReceipt, writeProviderEmbeddingReceipt } from './modules/public-answer/infrastructure/openai/provider-embedding-receipt.js';
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

export function parseIndexEmbeddingMode(argv: readonly string[]): 'fixture' | 'provider' {
  if (argv.length === 1 && argv[0] === '--embedding-mode=fixture') return 'fixture';
  if (argv.length === 2 && argv[0] === '--embedding-mode=provider' && argv[1] === '--confirm-live-provider') return 'provider';
  throw new Error('indexing requires one explicit embedding mode and provider confirmation');
}

export function providerIndexBudget(inputs: readonly { chunkChecksum: string; text: string }[]): Readonly<{ tokenUpperBound: number; costUpperBoundMicroUsd: number }> {
  const unique = [...new Map(inputs.map((item) => [item.chunkChecksum, item])).values()];
  const tokenUpperBound = unique.reduce((total, item) => total + Buffer.byteLength(item.text, 'utf8'), 0);
  const costUpperBoundMicroUsd = estimateEmbeddingCostMicroUsd(tokenUpperBound);
  if (tokenUpperBound > 100_000 || costUpperBoundMicroUsd > 20_000) throw new Error('provider indexing maximum exceeded before call');
  return Object.freeze({ tokenUpperBound, costUpperBoundMicroUsd });
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

export async function indexAnswerRelease(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  stdout: (value: string) => void = (value) => process.stdout.write(value),
): Promise<void> {
  const mode = parseIndexEmbeddingMode(argv); const fixture = mode === 'fixture'; const provider = mode === 'provider';
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
    if (provider && (!config.openAiApiKey || !config.providerDataControlReceiptPath || !config.providerEmbeddingReceiptRoot)) {
      throw new Error('provider indexing requires key, data-control receipt, pricing, and receipt root');
    }
    const dataControl = provider ? await readProviderDataControlReceipt(config.providerDataControlReceiptPath!) : null;
    const startedAt = new Date().toISOString();
    const prepared = await prepareEmbeddingSet(answer, provider
      ? new OpenAIEmbeddingClient(config.openAiApiKey!, { profile: 'index' }) : new DeterministicEmbeddingClient(config.nodeEnv), new AbortController().signal);
    const providerAuthorities = provider ? createProviderEmbeddingAuthorities(answer, prepared, {
      providerDataControlReceiptHash: dataControl!.receiptHash, providerPricingReceiptHash: pricing!.receiptHash,
      createdAt: startedAt, completedAt: new Date().toISOString(),
    }) : null;
    if (providerAuthorities && (providerAuthorities.durable.inputTokens > 100_000 || providerAuthorities.durable.costMicroUsd > 20_000)) {
      throw new Error('provider indexing measured maximum exceeded');
    }
    const receipt = providerAuthorities?.activation ?? createFixtureEmbeddingReceipt(prepared);
    let reopenedProvider; let providerReceiptPath: string | undefined;
    if (providerAuthorities) {
      providerReceiptPath = await writeProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, providerAuthorities.durable);
      try { reopenedProvider = await readProviderEmbeddingReceipt(config.providerEmbeddingReceiptRoot!, answer.answerReleaseId, providerAuthorities.durable.embeddingReceiptHash); }
      catch (error) { await rm(providerReceiptPath, { force: true }); throw error; }
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
    stdout(JSON.stringify({
      kind: 'success', contentReleaseId: answer.contentReleaseId.slice(0, 12), answerReleaseId: answer.answerReleaseId.slice(0, 12),
      approvalHash: answer.corpusApprovalHash.slice(0, 19), chunkCount: answer.chunks.length, model: receipt.model,
    }) + '\n');
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
