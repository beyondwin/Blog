import { pathToFileURL } from 'node:url';

import { parseServerConfig } from './config/server-config.js';
import { DeterministicEmbeddingClient } from './modules/public-answer/infrastructure/fixture/deterministic-embedding-client.js';
import {
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
  if (argv.length !== 1 || argv[0] !== '--embedding-mode=fixture') throw new Error('only explicit fixture indexing is installed');
  const config = await parseServerConfig(env);
  if (config.publicAskMode !== 'fixture') throw new Error('fixture indexing requires fixture mode');
  const { answer } = await readVerifiedAnswerReleaseAuthority(config);
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runPostgresMigrations(pool);
    const prepared = await prepareEmbeddingSet(answer, new DeterministicEmbeddingClient(config.nodeEnv), new AbortController().signal);
    const receipt = createFixtureEmbeddingReceipt(prepared);
    const activated = await new PostgresAnswerReleaseIndexer(config.nodeEnv)
      .activate(answer, prepared, receipt, pool, new AbortController().signal);
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
