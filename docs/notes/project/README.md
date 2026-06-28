# beyondwin Project Documentation

This topic documents the `beyondwin` codebase itself: the Astro site, content
collections, publishing workflows, public memory projection, validation gates,
and archive-docs conventions.

Use this page as the project-doc entry point.

## Start Here

- [Getting Started With beyondwin](getting-started.md) is the first-run
  tutorial. It gets the local site and validation loop working.
- [How to Publish And Maintain Content](publishing-workflows.md) is the
  task guide for articles, reviews, analysis queue items, article-factory
  packets, memory projection, and archive docs.
- [Project Architecture Reference](architecture-reference.md) is the factual
  reference for routes, content schemas, scripts, data files, tests, and
  commands.
- [Why beyondwin Is Structured This Way](design-and-content-rationale.md)
  explains the content model, private-first memory boundary, design direction,
  and trade-offs.

## Source Files Used

These documents are derived from:

- [README.md](../../../README.md)
- [PRODUCT.md](../../../PRODUCT.md)
- [DESIGN.md](../../../DESIGN.md)
- [SYNC.md](../../../SYNC.md)
- [src/content.config.ts](../../../src/content.config.ts)
- [src/lib/content.ts](../../../src/lib/content.ts)
- [scripts/validate-content.mjs](../../../scripts/validate-content.mjs)
- [scripts/article-quality.mjs](../../../scripts/article-quality.mjs)
- [scripts/create-article-packet.mjs](../../../scripts/create-article-packet.mjs)
- [scripts/memory/project.mjs](../../../scripts/memory/project.mjs)
- [scripts/memory/schema.mjs](../../../scripts/memory/schema.mjs)
- [docs/implementation/memory-second-brain.md](../../implementation/memory-second-brain.md)

## Maintenance Rules

- Keep this folder focused on the project itself, not general article research.
- When a command, schema, route, or workflow changes, update the matching
  reference and how-to page in the same change.
- Keep [docs/_index/catalog.yml](../../_index/catalog.yml),
  [docs/_index/topics.yml](../../_index/topics.yml), and
  [docs/INDEX.md](../../INDEX.md) in sync with this folder.
- Treat `docs/wiki/` and `graphify-out/` as generated navigation layers, not as
  source docs.
