import type { Pool } from 'pg';

import type { ServerConfig } from '../../../../config/server-config.js';
import type { AnswerReleaseCatalogSource } from '../../application/ports/answer-release-catalog.js';
import type { AnswerReleaseCatalogSnapshot, AuthorizedEvidence } from '../../domain/public-answer.js';
import { PublicAnswerDeadlineError } from '../../domain/public-answer-errors.js';
import { DeterministicEmbeddingClient } from '../fixture/deterministic-embedding-client.js';
import { readProviderEmbeddingReceipt } from '../openai/provider-embedding-receipt.js';
import { providerChecksum } from '../openai/provider-json.js';
import { createFixtureEmbeddingReceipt, prepareEmbeddingSet } from '../postgres/postgres-answer-release-indexer.js';

const serverVerifiedAnswerRelease = Symbol('ServerVerifiedActivePublicAnswerRelease');
interface PublicAnswerCorpusApproval { readonly schemaVersion: 1; readonly entries: readonly unknown[] }
interface VerifiedActivePublicRelease {
  readonly manifest: { readonly releaseId: string; readonly records: Readonly<Record<string, { readonly href: string }>> };
  readonly manifestHash: string; readonly artifactHash: string;
}
export interface VerifiedActivePublicAnswerReleaseAuthority {
  readonly [serverVerifiedAnswerRelease]: true;
  readonly releasePath: string; readonly contentReleaseId: string; readonly answerReleaseId: string;
  readonly manifestHash: string; readonly artifactHash: string; readonly corpusApprovalHash: string;
  readonly manifest: { readonly identity: { readonly contentManifestHash: string; readonly normalizerVersion: string } };
  readonly chunks: readonly { readonly chunkId: string; readonly recordId: string; readonly canonicalPath: string }[];
  readonly evidence: readonly {
    readonly evidenceId: string; readonly chunkId: string; readonly recordId: string; readonly collectionLabel: string;
    readonly recordTitle: string; readonly canonicalPath: string;
    readonly locator: { readonly kind: 'heading-paragraph' | 'evidence-page'; readonly label: string; readonly ordinal: number };
    readonly excerpt: string; readonly excerptChecksum: string;
  }[];
  readonly indexInputs: readonly {
    readonly chunkId: string; readonly chunkChecksum: string; readonly recordId: string; readonly canonicalPath: string;
    readonly title: string; readonly headingPath: readonly string[]; readonly text: string; readonly searchText: string;
  }[];
}
type VerifiedAnswerReleaseValue = Omit<VerifiedActivePublicAnswerReleaseAuthority, typeof serverVerifiedAnswerRelease>;

function detachedFrozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => detachedFrozen(item))) as T;
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, detachedFrozen(child)]))) as T;
  }
  return value;
}

function sealVerifiedAnswerRelease(release: VerifiedAnswerReleaseValue): VerifiedActivePublicAnswerReleaseAuthority {
  const projection = {
    releasePath: release.releasePath,
    contentReleaseId: release.contentReleaseId,
    answerReleaseId: release.answerReleaseId,
    manifestHash: release.manifestHash,
    artifactHash: release.artifactHash,
    corpusApprovalHash: release.corpusApprovalHash,
    manifest: detachedFrozen({ identity: release.manifest.identity }),
    chunks: detachedFrozen(release.chunks),
    evidence: detachedFrozen(release.evidence),
    indexInputs: detachedFrozen(release.indexInputs),
  };
  Object.defineProperty(projection, serverVerifiedAnswerRelease, { value: true, enumerable: false });
  return Object.freeze(projection) as VerifiedActivePublicAnswerReleaseAuthority;
}

interface CatalogReaders {
  readApproval(path: string): Promise<PublicAnswerCorpusApproval>;
  readContent(root: string): Promise<VerifiedActivePublicRelease>;
  readAnswer(root: string, content: VerifiedActivePublicRelease, approval: PublicAnswerCorpusApproval): Promise<VerifiedActivePublicAnswerReleaseAuthority>;
  verifyAnswer(path: string, content: VerifiedActivePublicRelease, approval: PublicAnswerCorpusApproval): Promise<unknown>;
}

const defaultReaders: CatalogReaders = {
  async readApproval(path) {
    const specifier = '@beyondwin/content/answer-release';
    const module = await import(specifier) as {
      readPublicAnswerCorpusApproval(path: string): Promise<PublicAnswerCorpusApproval>;
    };
    return module.readPublicAnswerCorpusApproval(path);
  },
  async readContent(root) {
    const specifier = '@beyondwin/content/release';
    const module = await import(specifier) as { readActiveRelease(root: string): Promise<VerifiedActivePublicRelease> };
    return module.readActiveRelease(root);
  },
  async readAnswer(root, content, approval) {
    const specifier = '@beyondwin/content/answer-release';
    const module = await import(specifier) as {
      readActiveAnswerRelease(
        root: string, content: VerifiedActivePublicRelease, approval: PublicAnswerCorpusApproval,
      ): Promise<VerifiedAnswerReleaseValue>;
    };
    const release = await module.readActiveAnswerRelease(root, content, approval);
    return sealVerifiedAnswerRelease(release);
  },
  async verifyAnswer(path, content, approval) {
    const specifier = '@beyondwin/content/answer-release';
    const module = await import(specifier) as {
      verifyAnswerReleaseDirectory(
        path: string, content: VerifiedActivePublicRelease, approval: PublicAnswerCorpusApproval,
      ): Promise<unknown>;
    };
    return module.verifyAnswerReleaseDirectory(path, content, approval);
  },
};

export interface VerifiedCatalogSnapshot extends AnswerReleaseCatalogSnapshot {
  readonly normalizerVersion: string;
  readonly contentManifestHash: string;
  readonly answerManifestHash: string;
  readonly answerArtifactHash: string;
  readonly embeddingSource: 'fixture' | 'provider';
  readonly embeddingReceiptHash: string;
  readonly evidenceById: ReadonlyMap<string, AuthorizedEvidence>;
  readonly chunkById: ReadonlyMap<string, VerifiedActivePublicAnswerReleaseAuthority['chunks'][number]>;
  readonly chunkChecksumById: ReadonlyMap<string, string>;
  readonly indexInputByChunkId: ReadonlyMap<string, Readonly<{
    recordId: string; canonicalPath: string; title: string; headingPath: readonly string[]; body: string; searchText: string;
  }>>;
  readonly vectorChecksumByChunkId: ReadonlyMap<string, string>;
  readonly vectorSetChecksum: string;
  readonly indexRowsChecksum: string;
  readonly indexChecksum: string;
  readonly tombstones: ReadonlySet<string>;
}

async function beforeDeadline<T>(
  operation: Promise<T>, signal: AbortSignal, deadlineAt?: number, disposeLate?: (value: T) => void,
): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new Error('catalog snapshot aborted');
  const remaining = deadlineAt === undefined ? Number.POSITIVE_INFINITY : deadlineAt - performance.now();
  if (remaining <= 0) throw new PublicAnswerDeadlineError('catalog snapshot deadline elapsed');
  let timer: NodeJS.Timeout | undefined;
  let listener: (() => void) | undefined;
  let completed = false;
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      listener = () => reject(signal.reason ?? new Error('catalog snapshot aborted'));
      signal.addEventListener('abort', listener, { once: true });
      if (Number.isFinite(remaining)) {
        timer = setTimeout(() => reject(new PublicAnswerDeadlineError('catalog snapshot deadline elapsed')), remaining);
        timer.unref();
      }
    });
    const value = await Promise.race([operation, interrupted]);
    completed = true;
    return value;
  } finally {
    if (timer) clearTimeout(timer);
    if (listener) signal.removeEventListener('abort', listener);
    if (!completed && disposeLate) void operation.then(disposeLate, () => undefined);
  }
}

export async function readVerifiedAnswerReleaseAuthority(config: Readonly<Pick<ServerConfig,
  'corpusApprovalPath' | 'contentReleaseRoot' | 'answerReleaseRoot'>>): Promise<Readonly<{
    approval: PublicAnswerCorpusApproval; content: VerifiedActivePublicRelease;
    answer: VerifiedActivePublicAnswerReleaseAuthority;
  }>> {
  const approval = await defaultReaders.readApproval(config.corpusApprovalPath);
  const content = await defaultReaders.readContent(config.contentReleaseRoot);
  const answer = await defaultReaders.readAnswer(config.answerReleaseRoot, content, approval);
  await defaultReaders.verifyAnswer(answer.releasePath, content, approval);
  return Object.freeze({ approval, content, answer });
}

function immutableMap<K, V>(entries: readonly (readonly [K, V])[]): ReadonlyMap<K, V> {
  const target = new Map<K, V>(entries);
  return new Proxy(target, {
    get(map, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => { throw new Error('catalog map is immutable'); };
      }
      const value = Reflect.get(map, property, map) as unknown;
      return typeof value === 'function' ? value.bind(map) : value;
    },
  });
}

function immutableSet<T>(values: readonly T[]): ReadonlySet<T> {
  const target = new Set(values);
  return new Proxy(target, {
    get(set, property) {
      if (property === 'add' || property === 'delete' || property === 'clear') {
        return () => { throw new Error('catalog set is immutable'); };
      }
      const value = Reflect.get(set, property, set) as unknown;
      return typeof value === 'function' ? value.bind(set) : value;
    },
  });
}

function evidenceLocationKey(evidence: Pick<AuthorizedEvidence,
  'evidenceId' | 'recordId' | 'canonicalPath' | 'locator'>): string {
  return [
    evidence.evidenceId,
    evidence.recordId,
    evidence.canonicalPath,
    evidence.locator.kind,
    evidence.locator.label,
    String(evidence.locator.ordinal),
  ].join('\0');
}

export class VerifiedAnswerReleaseCatalogSource implements AnswerReleaseCatalogSource {
  constructor(
    private readonly config: Readonly<ServerConfig>,
    private readonly pool: Pool,
    private readonly readers: CatalogReaders = defaultReaders,
  ) {}

  async verifyDirectory(path: string): Promise<void> {
    const approval = await this.readers.readApproval(this.config.corpusApprovalPath);
    const content = await this.readers.readContent(this.config.contentReleaseRoot);
    await this.readers.verifyAnswer(path, content, approval);
  }

  async snapshot(signal: AbortSignal, deadlineAt?: number): Promise<VerifiedCatalogSnapshot> {
    if (signal.aborted) throw signal.reason ?? new Error('catalog snapshot aborted');
    const approval = await beforeDeadline(this.readers.readApproval(this.config.corpusApprovalPath), signal, deadlineAt);
    const content = await beforeDeadline(this.readers.readContent(this.config.contentReleaseRoot), signal, deadlineAt);
    const release = await beforeDeadline(this.readers.readAnswer(this.config.answerReleaseRoot, content, approval), signal, deadlineAt);
    const client = await beforeDeadline(this.pool.connect(), signal, deadlineAt, (late) => late.release(true));
    let clientReleased = false;
    const query = async <T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]) => (
      beforeDeadline(client.query<T>(text, values ? [...values] : undefined), signal, deadlineAt, () => {
        if (!clientReleased) { clientReleased = true; client.release(true); }
      })
    );
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const bindingResult = await query<{
        binding_id: string; content_release_id: string; answer_release_id: string; content_manifest_hash: string;
        answer_manifest_hash: string; answer_artifact_hash: string; embedding_source: 'fixture' | 'provider';
        embedding_model: string; embedding_dimensions: number; embedding_receipt_hash: string; chunk_count: number;
        index_checksum: string;
      }>("SELECT * FROM public_answer_release_bindings WHERE state='active'");
      if (bindingResult.rowCount !== 1) throw new Error('catalog requires exactly one active binding');
      const binding = bindingResult.rows[0]!;
      if (release.manifest.identity.normalizerVersion !== 'nfkc-lower-hangul-ngram-v1') throw new Error('verified answer release normalizer authority is missing or drifted');
      if (binding.content_release_id !== release.contentReleaseId || binding.answer_release_id !== release.answerReleaseId
        || binding.content_manifest_hash !== release.manifest.identity.contentManifestHash
        || binding.answer_manifest_hash !== release.manifestHash || binding.answer_artifact_hash !== release.artifactHash
        || binding.embedding_model !== 'text-embedding-3-large' || binding.embedding_dimensions !== 3072
        || binding.chunk_count !== release.chunks.length) throw new Error('filesystem release and active binding mismatch');
      let vectorChecksumByChunkId: ReadonlyMap<string, string>;
      let vectorSetChecksum: string;
      if (binding.embedding_source === 'provider') {
        if (!this.config.providerEmbeddingReceiptRoot) throw new Error('provider binding requires configured durable receipt root');
        const receipt = await readProviderEmbeddingReceipt(this.config.providerEmbeddingReceiptRoot, binding.answer_release_id, binding.embedding_receipt_hash);
        if (receipt.contentReleaseId !== binding.content_release_id || receipt.answerReleaseId !== binding.answer_release_id
          || receipt.contentManifestHash !== binding.content_manifest_hash || receipt.answerManifestHash !== binding.answer_manifest_hash
          || receipt.answerArtifactHash !== binding.answer_artifact_hash || receipt.corpusApprovalHash !== release.corpusApprovalHash
          || receipt.indexChecksum !== binding.index_checksum || receipt.entries.length !== release.indexInputs.length
          || receipt.entries.some((entry, index) => entry.chunkChecksum !== release.indexInputs[index]!.chunkChecksum)) {
          throw new Error('active provider binding durable receipt mismatch');
        }
        vectorChecksumByChunkId = immutableMap(release.indexInputs.map((input, index) => [
          input.chunkId, receipt.entries[index]!.vectorChecksum,
        ] as const));
        vectorSetChecksum = providerChecksum(release.indexInputs.map((input, index) => ({
          chunkId: input.chunkId, chunkChecksum: input.chunkChecksum, vectorChecksum: receipt.entries[index]!.vectorChecksum,
        })));
        if (vectorSetChecksum !== receipt.providerVectorSetChecksum) throw new Error('active provider vector-set checksum mismatch');
      } else {
        const fixturePrepared = await beforeDeadline(prepareEmbeddingSet(
          release, new DeterministicEmbeddingClient(this.config.nodeEnv), signal,
        ), signal, deadlineAt);
        const fixtureReceipt = createFixtureEmbeddingReceipt(fixturePrepared);
        if (binding.binding_id !== fixtureReceipt.bindingId
          || binding.embedding_receipt_hash !== fixtureReceipt.receiptHash || binding.index_checksum !== fixtureReceipt.indexChecksum
          || binding.content_release_id !== fixtureReceipt.contentReleaseId || binding.answer_release_id !== fixtureReceipt.answerReleaseId) {
          throw new Error('active fixture binding provenance mismatch');
        }
        vectorChecksumByChunkId = immutableMap(fixturePrepared.vectors.map((entry) => [entry.chunkId, entry.vectorChecksum] as const));
        vectorSetChecksum = fixturePrepared.vectorSetChecksum;
      }
      const tombstoneRows = (await query<{ entity_kind: 'record' | 'evidence'; entity_id: string }>(
        'SELECT entity_kind,entity_id FROM public_answer_tombstones ORDER BY entity_kind,entity_id')).rows;
      await query('COMMIT');
      const tombstones = immutableSet(tombstoneRows.map((row) => `${row.entity_kind}:${row.entity_id}`));
      const records = content.manifest.records;
      const chunks = release.chunks.filter((chunk) => !tombstones.has(`record:${chunk.recordId}`));
      for (const chunk of chunks) {
        const record = records[chunk.recordId];
        if (!record || record.href !== chunk.canonicalPath) throw new Error('answer chunk canonical route is not emitted by the verified content release');
      }
      const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
      const evidence = release.evidence.filter((item) => chunkIds.has(item.chunkId)
        && !tombstones.has(`record:${item.recordId}`) && !tombstones.has(`evidence:${item.evidenceId}`));
      const evidenceById = immutableMap(evidence.map((item) => [item.evidenceId, Object.freeze({
        evidenceId: item.evidenceId, chunkId: item.chunkId, answerReleaseId: release.answerReleaseId,
        recordId: item.recordId, collectionLabel: item.collectionLabel, recordTitle: item.recordTitle,
        canonicalPath: item.canonicalPath, locator: Object.freeze({ ...item.locator }), excerpt: item.excerpt,
        excerptChecksum: item.excerptChecksum,
      }) satisfies AuthorizedEvidence] as const));
      const authorizedEvidenceLocations = immutableSet(evidence.map((item) => evidenceLocationKey(item)));
      const chunkById = immutableMap(chunks.map((item) => [item.chunkId, Object.freeze({ ...item })] as const));
      const chunkChecksumById = immutableMap(release.indexInputs.map((item) => [item.chunkId, item.chunkChecksum] as const));
      const indexInputByChunkId = immutableMap(release.indexInputs.map((item) => [item.chunkId, Object.freeze({
        recordId: item.recordId, canonicalPath: item.canonicalPath, title: item.title,
        headingPath: Object.freeze([...item.headingPath]), body: item.text, searchText: item.searchText,
      })] as const));
      const indexRowsChecksum = providerChecksum(release.indexInputs.map((item) => ({
        chunkId: item.chunkId,
        chunkChecksum: item.chunkChecksum,
        recordId: item.recordId,
        canonicalPath: item.canonicalPath,
        title: item.title,
        headingPath: [...item.headingPath],
        body: item.text,
        searchText: item.searchText,
        vectorChecksum: vectorChecksumByChunkId.get(item.chunkId)!,
        model: 'text-embedding-3-large',
        dimensions: 3072,
        source: binding.embedding_source,
      })).sort((left, right) => left.chunkId < right.chunkId ? -1 : left.chunkId > right.chunkId ? 1 : 0));
      const snapshot: VerifiedCatalogSnapshot = {
        bindingId: binding.binding_id, contentReleaseId: release.contentReleaseId, answerReleaseId: release.answerReleaseId,
        corpusApprovalHash: release.corpusApprovalHash, chunkCount: chunks.length,
        contentManifestHash: release.manifest.identity.contentManifestHash,
        answerManifestHash: release.manifestHash,
        answerArtifactHash: release.artifactHash,
        embeddingSource: binding.embedding_source, embeddingReceiptHash: binding.embedding_receipt_hash,
        normalizerVersion: release.manifest.identity.normalizerVersion, evidenceById, chunkById, chunkChecksumById,
        indexInputByChunkId, vectorChecksumByChunkId, vectorSetChecksum, indexRowsChecksum,
        indexChecksum: binding.index_checksum, tombstones,
        isBoundTo: (contentReleaseId, answerReleaseId) => (
          contentReleaseId === release.contentReleaseId && answerReleaseId === release.answerReleaseId
        ),
        evidenceFor: (ids) => Object.freeze(ids.flatMap((id) => evidenceById.get(id) ?? [])),
        hasAuthorizedEvidenceLocation: (candidate) => {
          const authority = evidenceById.get(candidate.evidenceId);
          const record = records[candidate.recordId];
          return Boolean(authority && record && record.href === candidate.canonicalPath
            && authorizedEvidenceLocations.has(evidenceLocationKey(candidate))
            && evidenceLocationKey(authority) === evidenceLocationKey(candidate));
        },
      };
      return Object.freeze(snapshot);
    } catch (error) {
      if (!clientReleased && (signal.aborted || error instanceof PublicAnswerDeadlineError)) {
        clientReleased = true;
        client.release(true);
      } else if (!clientReleased) {
        try {
          await query('ROLLBACK');
        } catch (rollbackError) {
          if (!clientReleased) {
            clientReleased = true;
            client.release(true);
          }
          if (rollbackError instanceof PublicAnswerDeadlineError) throw rollbackError;
        }
      }
      throw error;
    } finally { if (!clientReleased) client.release(); }
  }
}
