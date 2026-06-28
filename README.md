# beyondwin

Personal knowledge and publishing system for development articles, book and
tool reviews, ideas, travel notes, source-grounded analysis, and public memory
notes.

The site is built with Astro and MDX. Content lives in typed collections under
`src/content/`, so adding a new post should usually be a frontmatter-and-MDX
change rather than a layout change.

## Publishing Lanes

- `src/content/articles/` - development articles and technical essays.
- `src/content/reviews/` - books, tools, courses, articles, and other reviews.
- `src/content/ideas/` - early ideas, sketches, and proposals.
- `src/content/travel/` - travel essays and place notes.
- `src/content/analysis/` - source-grounded analysis generated from queue items.
- `memory/` and `src/data/memory.public.json` - reviewed public memory source
  and generated projection for `/memory`. Keep private drafts out of Git.

Each collection is defined in `src/content.config.ts`. Shared listing and
metadata helpers live in `src/lib/content.ts`.

## Design Context

- `PRODUCT.md` captures the product purpose, audience, brand personality, and
  design principles.
- `DESIGN.md` captures the color, typography, layout, and component system.
- `src/styles/global.css` is the source of truth for tokens and visual rules.

The intended feel is a precise personal field notebook: quiet enough for long
reading, structured enough for archive browsing, and more owned than a platform
blog.

## Commands

```bash
npm run dev
npm run validate
npm run build
```

`npm run validate` is the preferred pre-commit check. It validates content
frontmatter and quote length, projects public memory data, runs tests, checks
Astro types, and builds the static site.

## Docs And Graph Rules

Archive documents still live under `docs/`:

- Use `docs/_inbox/` only for local unsorted intake; it is ignored for the
  public repository.
- Preserve source captures in `docs/raw/` locally when original wording or
  provenance matters; raw captures are ignored unless explicitly promoted.
- Store curated documents in `docs/notes/<topic>/`.
- Treat `docs/wiki/` and `graphify-out/` as generated navigation layers.
- Keep `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and `docs/INDEX.md`
  aligned when moving or adding documents.

After modifying code files, refresh the local knowledge graph:

```bash
graphify update .
```

## Project Documentation

Project-level docs live under `docs/notes/project/`:

- `docs/notes/project/getting-started.md` - local setup tutorial.
- `docs/notes/project/publishing-workflows.md` - content, queue, article
  factory, memory, and archive-doc maintenance tasks.
- `docs/notes/project/architecture-reference.md` - routes, schemas, scripts,
  tests, and data contracts.
- `docs/notes/project/design-and-content-rationale.md` - why the content model,
  design system, and memory boundary work this way.
