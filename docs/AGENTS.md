# Archive documentation guidance

These rules apply under `docs/`.

## Layers

- Use `docs/_inbox/` only for unsorted local intake.
- Use `docs/raw/` when original wording or provenance must be preserved.
- Use `docs/notes/<topic>/` for durable human-curated source documents.
- Treat `docs/wiki/` as generated navigation, not source of truth.
- Verify important claims against `docs/raw/` or `docs/notes/`, even when a generated page gives a quick route.
- Store durable product, architecture, data-boundary, publishing-policy, and UX decisions under `docs/notes/project/adr/`. Keep the ADR index and status current when a later decision changes an earlier one.

## Index contract

When adding, moving, or deleting a durable non-README note under `docs/notes/`:

1. update `docs/_index/catalog.yml`;
2. update `docs/_index/topics.yml` when the stable topic set or description changes;
3. update `docs/INDEX.md`;
4. run `npm run agent:check` and `npm run validate`.

An ADR change also updates `docs/notes/project/adr/README.md`. Mark unresolved exploration as `proposed`; only explicit decisions become `accepted`.

Do not edit generated `docs/wiki/` pages as primary documents. New files under ignored `docs/superpowers/` remain local unless the user explicitly requests staging or a commit.
