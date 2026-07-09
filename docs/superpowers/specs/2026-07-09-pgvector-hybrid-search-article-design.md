# pgvector Hybrid Search Article Design

## Goal

Publish one readable Korean technical article from the supplied junior lecture package:

- Source note: `/Users/kws/Downloads/pgvector_hybrid_search_junior_lecture_package/pgvector_hybrid_search_junior_lecture.md`
- Diagram: `/Users/kws/Downloads/pgvector_hybrid_search_junior_lecture_package/ivfflat_cluster_diagram.png`

The article should help a junior backend developer understand how PostgreSQL `pgvector`, ANN indexes, FTS, and RRF fit into a practical RAG search design.

## Approved Direction

Use the recommended long-form blog article approach:

1. Create a single article in `src/content/articles/`.
2. Compress the lecture into a polished blog narrative instead of copying it verbatim.
3. Preserve the most useful implementation details: KNN query shape, IVFFLAT/HNSW tuning knobs, FTS index shape, RRF SQL, Spring Boot service boundary, and operational mistakes.
4. Copy the provided IVFFLAT diagram into `public/images/articles/` and embed it in the IVFFLAT section.
5. Verify with `npm run validate`.

## Content Shape

The article should use this flow:

1. Problem: `LIKE` search is not enough for RAG.
2. Mental model: FTS finds words, vector search finds meaning.
3. Baseline KNN query and the meaning of pgvector distance operators.
4. Why ANN indexes exist.
5. IVFFLAT explanation with the supplied diagram.
6. HNSW explanation and when it is the better default.
7. FTS and Korean search caveats.
8. Hybrid search and why direct score addition is weak.
9. RRF-based SQL pattern.
10. Spring Boot service boundaries.
11. Production checklist and common junior mistakes.

## Files

- Create `src/content/articles/pgvector-hybrid-search.mdx`
- Create `public/images/articles/pgvector-hybrid-search-ivfflat-cluster.png`
- Create `docs/superpowers/plans/2026-07-09-pgvector-hybrid-search-article.md`

## Acceptance Criteria

- The article has valid frontmatter for the `articles` collection.
- The article is original blog prose based on the source lecture, not a raw lecture dump.
- The IVFFLAT diagram renders through a stable public path.
- SQL examples are practical and avoid implying that FTS score and vector score are directly comparable.
- The article explicitly warns that `simple` PostgreSQL FTS is not a Korean morphological analyzer.
- `npm run validate` passes.
