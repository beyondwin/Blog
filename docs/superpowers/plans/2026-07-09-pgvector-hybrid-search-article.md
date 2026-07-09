# pgvector Hybrid Search Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one polished Korean blog article about PostgreSQL `pgvector` hybrid search using the supplied lecture note and IVFFLAT diagram.

**Architecture:** This is a content-only change. The article lives in Astro's `articles` content collection, and the diagram is served from `public/images/articles/` through a root-relative image path.

**Tech Stack:** Astro content collections, MDX, public static assets, existing `npm run validate` gate.

## Global Constraints

- Keep the output to one article file because the user supplied one source lecture package.
- Use `src/content/articles/pgvector-hybrid-search.mdx` for the article.
- Use `/images/articles/pgvector-hybrid-search-ivfflat-cluster.png` for the diagram reference.
- Do not add new dependencies.
- Verify with `npm run validate`.

---

### Task 1: Publish Article And Diagram

**Files:**
- Create: `src/content/articles/pgvector-hybrid-search.mdx`
- Create: `public/images/articles/pgvector-hybrid-search-ivfflat-cluster.png`

**Interfaces:**
- Consumes: source lecture markdown and PNG diagram from `/Users/kws/Downloads/pgvector_hybrid_search_junior_lecture_package/`
- Produces: one Astro article route at `/articles/pgvector-hybrid-search/`

- [ ] **Step 1: Copy the diagram asset**

Run:

```bash
mkdir -p public/images/articles
cp /Users/kws/Downloads/pgvector_hybrid_search_junior_lecture_package/ivfflat_cluster_diagram.png public/images/articles/pgvector-hybrid-search-ivfflat-cluster.png
```

Expected: `public/images/articles/pgvector-hybrid-search-ivfflat-cluster.png` exists.

- [ ] **Step 2: Write the article**

Create `src/content/articles/pgvector-hybrid-search.mdx` with valid article frontmatter and sections covering KNN, ANN, IVFFLAT, HNSW, FTS, Hybrid Search, RRF, Spring Boot boundaries, and operational mistakes.

- [ ] **Step 3: Verify content**

Run:

```bash
npm run validate
```

Expected: content validation, article quality validation, memory validation, tests, Astro check, and Astro build complete with exit code 0.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git status --short
git diff -- src/content/articles/pgvector-hybrid-search.mdx docs/superpowers/specs/2026-07-09-pgvector-hybrid-search-article-design.md docs/superpowers/plans/2026-07-09-pgvector-hybrid-search-article.md
```

Expected: only the approved content/spec/plan files and the copied diagram asset are new.
