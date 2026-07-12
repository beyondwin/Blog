# Graphify Deep-Dive Article Design

Date: 2026-07-12
Status: approved design
Scope: source-grounded Korean article publication

## Goal

Turn the supplied standalone report
`/Users/kws/Downloads/graphify_deep_dive_ko.html` into a native beyondwin
article without losing its code-audit evidence, controlled experiments, or
source trail.

The public result should read like an existing long-form technical article,
not like an embedded microsite or a raw HTML import.

## Approved Direction

Use the repository's source-grounded article workflow:

1. Preserve the supplied HTML unchanged under `docs/raw/graphify/` as the
   provenance capture.
2. Publish an edited MDX article under `src/content/articles/` using the site's
   existing typography, article layout, and collection schema.
3. Add an internal evidence packet under `docs/notes/article-factory/` that
   records the supplied source, important claims, source inventory, experiment
   boundaries, and freshness caveats.
4. Register the evidence packet in `docs/_index/catalog.yml` and `docs/INDEX.md`.
5. Refresh Graphify navigation after the authored files are complete.

## Content Strategy

The HTML already contains a strong research narrative. The MDX adaptation
should preserve the substance while removing presentation code and repeated
report framing.

The article should follow this shape:

1. A direct verdict: Graphify is useful as a structural navigation aid, but it
   is not a semantic oracle or runtime truth source.
2. A junior-friendly explanation of nodes, edges, extraction, and graph
   traversal.
3. The real indexing pipeline: detection, tree-sitter extraction, graph build,
   clustering, analysis, report, and export.
4. How `graphify query` and `graphify path` actually select nodes and expand
   context.
5. The supplied controlled experiments, including successes and missed calls.
6. A careful reading of the project's benchmark claims and reproducibility
   limits.
7. Strengths, weaknesses, security and operations blind spots.
8. Comparison with text search, LSP/SCIP, CodeQL, vector retrieval, and runtime
   tracing.
9. A practical hybrid adoption strategy and evaluation checklist.
10. Method, limitations, and source links.

The prose may be shortened where the standalone report repeats the same
qualification, but numerical results, version distinctions, experimental
limitations, and citations must not be silently weakened or generalized.

## Files

- Preserve `docs/raw/graphify/graphify_deep_dive_ko.html`
- Create `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- Create `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md`
- Update `docs/_index/catalog.yml`
- Update `docs/INDEX.md`
- Create `docs/superpowers/plans/2026-07-12-graphify-deep-dive-article.md`

No new Astro component, page route, client-side script, or global CSS is
required. The source HTML's theme toggle, sticky table of contents, progress
bar, and card styling are presentation details and will not be ported.

## Source and Freshness Rules

- The raw HTML is the authoritative capture of what the user supplied.
- The evidence packet is the internal claim ledger and retrieval surface.
- The public MDX article is an editorial adaptation, not an additional source
  of evidence.
- Claims tied to the report's 2026-07-11 repository and package snapshot must
  retain their date instead of being written as timeless current facts.
- The article must distinguish repository HEAD, the installable PyPI release,
  Graphify's own benchmark claims, and independently reproduced observations.
- Existing links in the supplied source list should be retained when their
  corresponding claims remain in the article.

## Validation

Run the repository's full content gate:

```bash
npm run validate
git diff --check
```

Then refresh generated graph navigation:

```bash
graphify update .
```

Preview the built article route and confirm that headings, tables, lists, code
blocks, and outbound source links render correctly. Generated `graphify-out/`
artifacts remain ignored and are not part of the commit.

## Acceptance Criteria

- The supplied HTML is preserved unchanged in `docs/raw/graphify/`.
- The new public article uses valid article frontmatter and is discoverable on
  the existing article listing.
- The prose is native to the blog and does not embed the standalone page's
  private CSS or JavaScript.
- The key verdict, mechanism explanation, experiments, benchmark caveats,
  blind spots, alternatives, and adoption advice remain present.
- Time-sensitive metrics and versions are explicitly dated.
- The evidence packet is indexed through both curated docs index surfaces.
- `npm run validate` and `git diff --check` pass.
- The rendered article route is checked locally.
- `graphify update .` completes after the content changes.

## Non-Goals

- Reproducing the standalone HTML design pixel for pixel.
- Re-running the original external repository audit or controlled experiments.
- Updating time-sensitive Graphify statistics beyond the supplied report's
  snapshot.
- Adding a custom download page or maintaining two public versions of the same
  article.
