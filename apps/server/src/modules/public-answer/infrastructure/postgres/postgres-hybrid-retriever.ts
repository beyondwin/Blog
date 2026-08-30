import type { EmbeddingClient } from '../../application/ports/embedding-client.js';
import type { Retriever } from '../../application/ports/retriever.js';
import type { VerifiedCatalogSnapshot } from '../release/verified-answer-release-catalog.js';
import { ANSWER_QUERY_NORMALIZER_VERSION, normalizeAnswerQuery } from './answer-query-normalizer.js';
import type { CancellablePgQueryRunner } from './cancellable-pg-query-runner.js';
import { fuseRankedCandidates, retrievalIsSufficient } from './reciprocal-rank-fusion.js';

const LEXICAL_SQL = `WITH scored AS (
  SELECT c.chunk_id,c.chunk_checksum,c.record_id,
         ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',$3)) AS fts,
         similarity(c.search_text,$3) AS trigram
  FROM public_answer_chunks c JOIN public_answer_release_bindings b
    ON b.binding_id=c.binding_id AND b.binding_id=$1::uuid
  WHERE c.answer_release_id=$2 AND NOT EXISTS (
    SELECT 1 FROM public_answer_tombstones t WHERE t.entity_kind='record' AND t.entity_id=c.record_id)
), normalized AS (
  SELECT chunk_id,chunk_checksum,record_id,greatest(
    coalesce(fts/nullif(max(fts) over (),0),0),coalesce(trigram/nullif(max(trigram) over (),0),0)) AS score
  FROM scored
)
SELECT chunk_id,chunk_checksum,record_id,score FROM normalized WHERE score>0 ORDER BY score DESC,chunk_id ASC LIMIT 20`;

const VECTOR_SQL = `SELECT c.chunk_id,c.chunk_checksum,c.record_id,1-(c.embedding <=> $2::vector) AS score
FROM public_answer_chunks c JOIN public_answer_release_bindings b
 ON b.binding_id=c.binding_id AND b.binding_id=$1::uuid
WHERE c.answer_release_id=$3 AND NOT EXISTS (
  SELECT 1 FROM public_answer_tombstones t WHERE t.entity_kind='record' AND t.entity_id=c.record_id)
ORDER BY c.embedding <=> $2::vector,c.chunk_id ASC LIMIT 20`;

interface Row { chunk_id: string; chunk_checksum: string; record_id: string; score: number }
function vectorText(values: readonly number[]): string { return `[${values.join(',')}]`; }

export class PostgresHybridRetriever implements Retriever {
  constructor(private readonly embedder: EmbeddingClient, private readonly queries: CancellablePgQueryRunner, private readonly queryBudgetMs = 2_000) {}

  async retrieve(input: Parameters<Retriever['retrieve']>[0]): ReturnType<Retriever['retrieve']> {
    const catalog = input.catalog as VerifiedCatalogSnapshot;
    if (input.limit !== 6 || catalog.normalizerVersion !== ANSWER_QUERY_NORMALIZER_VERSION) throw new Error('answer query normalizer version drift');
    if (catalog.chunkCount === 0) {
      if (catalog.chunkById.size !== 0 || catalog.chunkChecksumById.size !== 0 || catalog.evidenceById.size !== 0) throw new Error('empty binding catalog authority is inconsistent');
      return Object.freeze({evidence:Object.freeze([]),sufficient:false,candidateCount:0,usage:Object.freeze({calls:0,inputTokens:0,outputTokens:0})});
    }
    const normalized = normalizeAnswerQuery(input.question); if (!normalized) throw new Error('normalized question is empty');
    const embedded = await this.embedder.embed([normalized], input.signal);
    if (embedded.vectors.length !== 1 || embedded.vectors[0]!.length !== 3072) throw new Error('query embedding contract mismatch');
    const [lexicalResult, vectorResult] = await Promise.all([
      this.queries.query<Row>(LEXICAL_SQL, [catalog.bindingId, catalog.answerReleaseId, normalized], input.signal, this.queryBudgetMs),
      this.queries.query<Row>(VECTOR_SQL, [catalog.bindingId, vectorText(embedded.vectors[0]!), catalog.answerReleaseId], input.signal, this.queryBudgetMs),
    ]);
    const validate = (row: Row) => {
      const chunk = catalog.chunkById.get(row.chunk_id); const expectedChecksum = catalog.chunkChecksumById.get(row.chunk_id);
      if (!chunk || !expectedChecksum || chunk.recordId !== row.record_id || expectedChecksum !== row.chunk_checksum
        || catalog.tombstones.has(`record:${row.record_id}`)) throw new Error('database chunk is absent from or mismatched with release catalog');
      return Object.freeze({ chunkId: row.chunk_id, recordId: row.record_id });
    };
    const selected = fuseRankedCandidates(lexicalResult.rows.map(validate), vectorResult.rows.map(validate));
    const authorized = selected.flatMap((candidate) => {
      const evidenceIds = [...catalog.evidenceById.values()].filter((item) => item.chunkId === candidate.chunkId).map((item) => item.evidenceId);
      const evidence = catalog.evidenceFor(evidenceIds);
      if (evidence.some((item) => item.chunkId !== candidate.chunkId || item.recordId !== candidate.recordId)) {
        throw new Error('snapshot evidence authority mismatches selected database chunk');
      }
      return evidence.length === 0 ? [] : [{ candidate, evidence }];
    });
    const evidence = authorized.flatMap((item) => item.evidence);
    const authorizedCandidates = authorized.map((item) => item.candidate);
    return Object.freeze({ evidence: Object.freeze(evidence), sufficient: retrievalIsSufficient(authorizedCandidates), candidateCount: authorizedCandidates.length, usage: embedded.usage });
  }
}
