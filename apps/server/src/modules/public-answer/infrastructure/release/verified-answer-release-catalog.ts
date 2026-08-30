import type { Pool } from 'pg';

import type { ServerConfig } from '../../../../config/server-config.js';
import type { AnswerReleaseCatalogSource } from '../../application/ports/answer-release-catalog.js';
import type { AnswerReleaseCatalogSnapshot, AuthorizedEvidence } from '../../domain/public-answer.js';

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
  readonly manifest: { readonly identity: { readonly contentManifestHash: string } };
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
    Object.defineProperty(release, serverVerifiedAnswerRelease, { value: true, enumerable: false });
    return release as VerifiedActivePublicAnswerReleaseAuthority;
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
  readonly embeddingSource: 'fixture' | 'provider';
  readonly embeddingReceiptHash: string;
  readonly evidenceById: ReadonlyMap<string, AuthorizedEvidence>;
  readonly chunkById: ReadonlyMap<string, VerifiedActivePublicAnswerReleaseAuthority['chunks'][number]>;
  readonly tombstones: ReadonlySet<string>;
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

  async snapshot(signal: AbortSignal): Promise<VerifiedCatalogSnapshot> {
    if (signal.aborted) throw signal.reason ?? new Error('catalog snapshot aborted');
    const approval = await this.readers.readApproval(this.config.corpusApprovalPath);
    const content = await this.readers.readContent(this.config.contentReleaseRoot);
    const release = await this.readers.readAnswer(this.config.answerReleaseRoot, content, approval);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const bindingResult = await client.query<{
        binding_id: string; content_release_id: string; answer_release_id: string; content_manifest_hash: string;
        answer_manifest_hash: string; answer_artifact_hash: string; embedding_source: 'fixture' | 'provider';
        embedding_receipt_hash: string; chunk_count: number;
      }>("SELECT * FROM public_answer_release_bindings WHERE state='active'");
      if (bindingResult.rowCount !== 1) throw new Error('catalog requires exactly one active binding');
      const binding = bindingResult.rows[0]!;
      if (binding.content_release_id !== release.contentReleaseId || binding.answer_release_id !== release.answerReleaseId
        || binding.content_manifest_hash !== release.manifest.identity.contentManifestHash
        || binding.answer_manifest_hash !== release.manifestHash || binding.answer_artifact_hash !== release.artifactHash
        || binding.chunk_count !== release.chunks.length) throw new Error('filesystem release and active binding mismatch');
      const tombstoneRows = (await client.query<{ entity_kind: 'record' | 'evidence'; entity_id: string }>(
        'SELECT entity_kind,entity_id FROM public_answer_tombstones ORDER BY entity_kind,entity_id')).rows;
      await client.query('COMMIT');
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
      const chunkById = immutableMap(chunks.map((item) => [item.chunkId, Object.freeze({ ...item })] as const));
      const snapshot: VerifiedCatalogSnapshot = {
        bindingId: binding.binding_id, contentReleaseId: release.contentReleaseId, answerReleaseId: release.answerReleaseId,
        corpusApprovalHash: release.corpusApprovalHash, chunkCount: chunks.length,
        embeddingSource: binding.embedding_source, embeddingReceiptHash: binding.embedding_receipt_hash,
        evidenceById, chunkById, tombstones,
        isBoundTo: (contentReleaseId, answerReleaseId) => (
          contentReleaseId === release.contentReleaseId && answerReleaseId === release.answerReleaseId
        ),
        evidenceFor: (ids) => Object.freeze(ids.flatMap((id) => evidenceById.get(id) ?? [])),
      };
      return Object.freeze(snapshot);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
