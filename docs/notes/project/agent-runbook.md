# Agent Runbook

This runbook is for coding agents working in `beyondwin`. It routes tasks to the
right source documents, edit surfaces, boundaries, and verification commands.

Use the human-facing project docs for explanation:

- [Project docs hub](README.md)
- [Getting started](getting-started.md)
- [Publishing workflows](publishing-workflows.md)
- [Architecture reference](architecture-reference.md)
- [Design and content rationale](design-and-content-rationale.md)

## Scoped Guidance And Skills

Start from the root `AGENTS.md`, then read the closest guidance before editing:

| Scope | Guidance | Project skill |
| --- | --- | --- |
| Astro routes, layouts, components, styles, interactions | `src/AGENTS.md` | `site-change` |
| MDX content and source-grounded writing | `src/AGENTS.md`, `src/content/AGENTS.md` | `research-and-publish` |
| Archive documents and indexes | `docs/AGENTS.md` | `archive-and-memory` |
| Private memory and public projection inputs | `memory/AGENTS.md` | `archive-and-memory` |

Critical safety rules live in `AGENTS.md`. Long repeatable procedures live in `.agents/skills/`; use the smallest matching skill set. Graphify is not a project operating dependency.

## Read Order

Read the smallest useful set for the task.

| Task | Read first | Then confirm |
| --- | --- | --- |
| Architecture or codebase question | `docs/notes/project/architecture-reference.md` | Relevant `src/` or `scripts/` files |
| Ordinary article | `docs/notes/project/publishing-workflows.md` | `src/content.config.ts` |
| Source-grounded article | `docs/notes/project/publishing-workflows.md`, relevant `docs/notes/article-factory/` packet | Rendered article route |
| Review, idea, or travel note | `docs/notes/project/publishing-workflows.md`, `docs/notes/project/architecture-reference.md` | Matching collection schema in `src/content.config.ts` |
| Queue analysis | `SYNC.md`, `docs/notes/project/publishing-workflows.md` | `scripts/queue.mjs` and `queue.md` |
| Public memory projection | `docs/notes/project/architecture-reference.md`, `docs/implementation/memory-second-brain.md` | `scripts/memory/schema.mjs`, `scripts/memory/project.mjs`, `src/lib/memory/`, `src/pages/memory.astro`, `src/pages/memory/[slug].astro` |
| Archive docs note | `docs/README.md`, `docs/_index/README.md` | `docs/_index/catalog.yml`, `docs/_index/topics.yml`, `docs/INDEX.md` |
| New content lane | `docs/notes/project/architecture-reference.md`, `DESIGN.md` | Existing pages, layouts, validation scripts, and navigation |
| Route, layout, or style change | `DESIGN.md`, `docs/notes/project/architecture-reference.md` | Target `src/pages`, `src/layouts`, `src/components`, or CSS files |
| Product, architecture, boundary, or durable UX decision | `docs/notes/project/adr/README.md`, relevant accepted ADRs | `PRODUCT.md`, `DESIGN.md`, specs, and implementation evidence |

## Task Map

| Task family | Purpose | Editable surface | Risky surface | Verification |
| --- | --- | --- | --- | --- |
| Ordinary article | Add a technical essay or development note | `src/content/articles/*.mdx` | Routes, layouts, schema, unrelated articles | `npm run validate`; preview the generated article route, such as `/articles/my-note/`, when user asks for rendered review |
| Source-grounded article | Publish a source-backed analysis article with evidence | `src/content/articles/*.mdx`, `docs/notes/article-factory/*.md` | Long copied source text, missing evidence, unrelated packets | `npm run validate`; inspect rendered article route |
| Review | Add a book, article, tool, course, or media review | `src/content/reviews/*.mdx` | Review layout and imported review contracts unless requested | `npm run validate`; preview the generated review route, such as `/reviews/my-review/`, for substantial prose |
| Idea | Add a seed, sketch, or proposal | `src/content/ideas/*.mdx` | Schema defaults without explicit `maturity` | `npm run validate` |
| Travel note | Add a travel or place record | `src/content/travel/*.mdx` | Collection routing and unrelated travel entries | `npm run validate` |
| Structured content record | Scaffold an article, review, scene, or idea with its media bundle | `src/content/<collection>/`, `src/assets/content/<collection>/<slug>/media.yml` | Writing assets outside the bundle, unsafe/incomplete manifest provenance, assuming a scaffold is public | `npm run media:validate`; `npm run validate` |
| Queue analysis | Turn a queued URL into an analysis entry | `queue.md`, `src/content/analysis/*.mdx` | Fabricated source claims, paywalled source guesses, missing `output:` metadata | `npm run validate`; confirm `queue.md` metadata |
| Public memory projection | Promote accepted public thoughts to `/memory` | `memory/thoughts/*.md`, `memory/edges.jsonl`, `memory/sources.jsonl`, `src/data/memory.public.json` | Direct imports from `memory/**` in public routes, private thoughts, unsafe source paths | `npm run memory:validate`; `npm run validate` before closeout |
| Archive docs note | Add or move a curated internal document | `docs/notes/**`, `docs/raw/**` when provenance matters, `docs/_index/*.yml`, `docs/INDEX.md` | `docs/wiki/`, uncataloged durable notes | `npm run validate` when practical; confirm index paths exist |
| New content lane | Add a new public collection and route surface | `src/content.config.ts`, `src/pages`, `src/layouts`, `src/lib/content.ts`, validation scripts, project docs | Treating a lane as a folder-only change | `npm run validate`; preview listing and detail routes |
| Route, layout, or style change | Change visible site behavior or reading experience | `src/pages`, `src/layouts`, `src/components`, `src/styles/global.css` | One-note palettes, nested cards, broken mobile text, missing focus states | `npm run validate`; browser check affected routes |

## Validation Matrix

| Change type | Minimum verification | Extra verification |
| --- | --- | --- |
| Docs-only project note | `npm run agent:check`, `git diff --check` | `npm run validate` before final closeout |
| Archive docs note or index change | `npm run agent:check`, `git diff --check` | `npm run validate` |
| Ordinary content | `npm run validate` | Route preview when text quality or layout matters |
| Source-grounded article | `npm run validate` | Rendered route review and evidence packet check |
| Memory projection | `npm run memory:validate`, `npm run validate` | Preview `/memory/` when UI or projection output changes |
| Route, layout, style, or component | `npm run validate` | Browser check on desktop and mobile-sized viewport |
| New content lane | `npm run validate` | Listing route and detail route preview |
| ADR addition or status change | `npm run agent:check`, `git diff --check` | Confirm ADR index, docs catalog, topics when needed, and `docs/INDEX.md` agree |

## Structured Content Handoff

Use these commands from the repository root:

```bash
npm run content:new -- <article|review|scene|idea> ...
npm run article:new -- ...
npm run media:validate
npm run validate
```

Only `status: "published"` with `draft: false` (`published && !draft`) is
public. A scaffold is intentionally `review` and draft. Keep each asset and
its `media.yml` under `src/assets/content/<collection>/<slug>/`; the manifest
records asset metadata and provenance, not a UI-specific path.

The design/route layer consumes `src/lib/content/viewModels.ts` and
already-resolved `ResolvedMedia` from `src/lib/content/mediaRegistry.ts`.
Publication selection belongs to `src/lib/content/publication.ts`. Do not
repeat manifest/path resolution in pages, layouts, or components. Public
list/detail/home/search/tag surfaces now consistently require
`published && !draft`; `scripts/publication-surfaces.test.mjs` guards this
route-level contract.

The corpus preserves 18 real non-example article sources, all currently
public locally after explicit publication authorization in this branch.
That includes the former review-held Bundle A slugs
`agents-md-vs-agent-skills-evidence`,
`aws-static-frontend-serverless-bff`,
`shared-ai-conversation-evidence-boundaries`, and
`uncle-bob-ai-code-review-evidence`, plus un-drafted
`karpathy-delete-everything-keep-graph`. The authorization is local
frontmatter only; it is not a remote deploy. Risk-resolution work is not
publication authorization.

`npm run validate` includes the strict media gate
`npm run media:validate -- --strict`. Naver review intake must use a new local
directory outside `src/` and `public/`:

```bash
node scripts/import-naver-reviews.mjs \
  --output docs/_inbox/naver-reviews-YYYY-MM-DD
```

The importer emits `status: "review"`, `draft: true`, never `coverImage`, and
keeps a discovered cover URL only in the local `naver-review-intake.json`.
Do not move an intake into the corpus until bibliography/media review and an
explicit verdict approval are complete. The migrated corpus has 18 reviews:
17 source-identified local covers and one `devotion-of-suspect-x` HOLD because
the matching image is below 300px. `doing-good-better` is canonical; the old
route is only a static meta-refresh compatibility page, not a guaranteed HTTP
301 redirect.

## Public And Private Boundaries

- `/memory` reads `src/data/memory.public.json`; it must not import or parse `memory/**` directly.
- Content is public only when `published && !draft`; do not treat non-draft review or archived entries as public.
- New thoughts should start private unless the user explicitly wants public memory.
- Public memory export requires `confidentiality: public`, `surfaces: [memory-public]`, `review.status: accepted`, and at least one safe source.
- `docs/raw/` preserves source wording and provenance; curated explanations belong in a stable topic folder under `docs/notes/`.
- `docs/wiki/` is a generated navigation layer, not source of truth.
- Source-grounded articles need evidence packets or equivalent source notes; do not rely on memory for source-specific claims.
- Direct quotes must stay short enough for `scripts/validate-content.mjs` blockquote checks.

## Index Sync Rules

When adding, moving, or deleting a durable curated note under `docs/notes/`:

1. Update `docs/_index/catalog.yml`.
2. Update `docs/_index/topics.yml` only when the topic category changes or its description becomes inaccurate.
3. Update `docs/INDEX.md` so humans can find the note.
4. Confirm every catalog path points to an existing file.

Do not catalog generated `docs/wiki/` pages as primary sources.

## ADR Update Rules

Use [the ADR index](adr/README.md) for decisions that future work must treat as constraints.

1. Read accepted ADRs before product, architecture, data-boundary, publishing-policy, or durable UX work.
2. Add or update an ADR in the same change when a material decision is accepted, rejected, superseded, or narrowed.
3. Keep research directions and unapproved design options `proposed`.
4. Preserve rejected alternatives and the evidence behind the rejection.
5. If a new decision replaces an accepted ADR, create a new ADR and mark the old one `superseded`; do not rewrite history.
6. Update the ADR index, docs catalog, topics when needed, and human-readable docs index.

## Common Failure Modes

- Adding an MDX file without running `npm run validate`.
- Running only non-strict `media:validate` and treating warnings as completion; `npm run validate` runs strict media validation and is the required final gate.
- Running the Naver importer without a new local intake directory, or copying discovered cover URLs into public frontmatter.
- Publishing a `source-grounded` article without source evidence or the required article-quality headings.
- Letting `/memory` read private `memory/**` files directly.
- Editing `/memory` behavior in `src/pages/memory.astro` before checking the focused module under `src/lib/memory/`.
- Adding a curated docs note without updating `catalog.yml`, `topics.yml` when needed, and `docs/INDEX.md`.
- Changing a content lane without updating schema, routes, helpers, validation, navigation, and docs together.
- Treating a request to resolve migration or validation risk as permission to publish a `review` entry.
- Editing broad root docs when a small task-specific docs link would be enough.
- Starting work in a scoped subtree without reading its closest `AGENTS.md`.
- Repeating a long workflow manually instead of using the matching project skill.
- Treating Graphify as a project operating dependency after its removal.
