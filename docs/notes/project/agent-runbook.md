# Agent Runbook

This runbook is for coding agents working in `beyondwin`. It routes tasks to the
right source documents, edit surfaces, boundaries, and verification commands.

Use the human-facing project docs for explanation:

- [Project docs hub](README.md)
- [Getting started](getting-started.md)
- [Publishing workflows](publishing-workflows.md)
- [Architecture reference](architecture-reference.md)
- [Design and content rationale](design-and-content-rationale.md)

## Read Order

Read the smallest useful set for the task.

| Task | Read first | Then confirm |
| --- | --- | --- |
| Architecture or codebase question | `graphify-out/GRAPH_REPORT.md`, then `docs/notes/project/architecture-reference.md` | Relevant `src/` or `scripts/` files |
| Ordinary article | `docs/notes/project/publishing-workflows.md` | `src/content.config.ts` |
| Source-grounded article | `docs/notes/project/publishing-workflows.md`, relevant `docs/notes/article-factory/` packet | Rendered article route |
| Review, idea, or travel note | `docs/notes/project/publishing-workflows.md`, `docs/notes/project/architecture-reference.md` | Matching collection schema in `src/content.config.ts` |
| Queue analysis | `SYNC.md`, `docs/notes/project/publishing-workflows.md` | `scripts/queue.mjs` and `queue.md` |
| Public memory projection | `docs/notes/project/architecture-reference.md`, `docs/implementation/memory-second-brain.md` | `scripts/memory/schema.mjs`, `scripts/memory/project.mjs`, `src/lib/memoryData.ts` |
| Archive docs note | `docs/README.md`, `docs/_index/README.md` | `docs/_index/catalog.yml`, `docs/_index/topics.yml`, `docs/INDEX.md` |
| New content lane | `docs/notes/project/architecture-reference.md`, `DESIGN.md` | Existing pages, layouts, validation scripts, and navigation |
| Route, layout, or style change | `DESIGN.md`, `docs/notes/project/architecture-reference.md` | Target `src/pages`, `src/layouts`, `src/components`, or CSS files |

## Task Map

| Task family | Purpose | Editable surface | Risky surface | Verification |
| --- | --- | --- | --- | --- |
| Ordinary article | Add a technical essay or development note | `src/content/articles/*.mdx` | Routes, layouts, schema, unrelated articles | `npm run validate`; preview the generated article route, such as `/articles/my-note/`, when user asks for rendered review |
| Source-grounded article | Publish a source-backed analysis article with evidence | `src/content/articles/*.mdx`, `docs/notes/article-factory/*.md` | Long copied source text, missing evidence, unrelated packets | `npm run validate`; inspect rendered article route |
| Review | Add a book, article, tool, course, or media review | `src/content/reviews/*.mdx` | Review layout and imported review contracts unless requested | `npm run validate`; preview the generated review route, such as `/reviews/my-review/`, for substantial prose |
| Idea | Add a seed, sketch, or proposal | `src/content/ideas/*.mdx` | Schema defaults without explicit `maturity` | `npm run validate` |
| Travel note | Add a travel or place record | `src/content/travel/*.mdx` | Collection routing and unrelated travel entries | `npm run validate` |
| Queue analysis | Turn a queued URL into an analysis entry | `queue.md`, `src/content/analysis/*.mdx` | Fabricated source claims, paywalled source guesses, missing `output:` metadata | `npm run validate`; confirm `queue.md` metadata |
| Public memory projection | Promote accepted public thoughts to `/memory` | `memory/thoughts/*.md`, `memory/edges.jsonl`, `memory/sources.jsonl`, `src/data/memory.public.json` | Direct imports from `memory/**` in public routes, private thoughts, unsafe source paths | `npm run memory:validate`; `npm run validate` before closeout |
| Archive docs note | Add or move a curated internal document | `docs/notes/**`, `docs/raw/**` when provenance matters, `docs/_index/*.yml`, `docs/INDEX.md` | `docs/wiki/`, `graphify-out/`, uncataloged durable notes | `npm run validate` when practical; confirm index paths exist |
| New content lane | Add a new public collection and route surface | `src/content.config.ts`, `src/pages`, `src/layouts`, `src/lib/content.ts`, validation scripts, project docs | Treating a lane as a folder-only change | `npm run validate`; preview listing and detail routes |
| Route, layout, or style change | Change visible site behavior or reading experience | `src/pages`, `src/layouts`, `src/components`, `src/styles/global.css` | One-note palettes, nested cards, broken mobile text, missing focus states | `npm run validate`; browser check affected routes |

## Validation Matrix

| Change type | Minimum verification | Extra verification |
| --- | --- | --- |
| Docs-only project note | `git diff --check` | `npm run validate` before final closeout |
| Archive docs note or index change | `git diff --check`, path check for catalog entries | `npm run validate` |
| Ordinary content | `npm run validate` | Route preview when text quality or layout matters |
| Source-grounded article | `npm run validate` | Rendered route review and evidence packet check |
| Memory projection | `npm run memory:validate`, `npm run validate` | Preview `/memory/` when UI or projection output changes |
| Route, layout, style, or component | `npm run validate` | Browser check on desktop and mobile-sized viewport |
| New content lane | `npm run validate` | Listing route and detail route preview |

## Public And Private Boundaries

- `/memory` reads `src/data/memory.public.json`; it must not import or parse `memory/**` directly.
- New thoughts should start private unless the user explicitly wants public memory.
- Public memory export requires `confidentiality: public`, `surfaces: [memory-public]`, `review.status: accepted`, and at least one safe source.
- `docs/raw/` preserves source wording and provenance; curated explanations belong in a stable topic folder under `docs/notes/`.
- `docs/wiki/` and `graphify-out/` are generated navigation layers, not source of truth.
- Source-grounded articles need evidence packets or equivalent source notes; do not rely on memory for source-specific claims.
- Direct quotes must stay short enough for `scripts/validate-content.mjs` blockquote checks.

## Index Sync Rules

When adding, moving, or deleting a durable curated note under `docs/notes/`:

1. Update `docs/_index/catalog.yml`.
2. Update `docs/_index/topics.yml` only when the topic category changes or its description becomes inaccurate.
3. Update `docs/INDEX.md` so humans can find the note.
4. Confirm every catalog path points to an existing file.

Do not catalog generated `docs/wiki/` pages or `graphify-out/` files as primary sources.

## Graphify Rules

- Before architecture or codebase answers, read `graphify-out/GRAPH_REPORT.md`.
- If a generated wiki exists under `graphify-out/wiki/`, use it for navigation before broad raw-file reads.
- For cross-module relationship questions, prefer `graphify query`, `graphify path`, or `graphify explain` after checking the report.
- Verify important claims against `src/`, `scripts/`, `docs/raw/`, or `docs/notes/`.
- After modifying code files, run `graphify update .`.
- Documentation-only changes do not require a graph refresh unless the task explicitly updates navigation artifacts.

## Common Failure Modes

- Adding an MDX file without running `npm run validate`.
- Publishing a `source-grounded` article without source evidence or the required article-quality headings.
- Letting `/memory` read private `memory/**` files directly.
- Adding a curated docs note without updating `catalog.yml`, `topics.yml` when needed, and `docs/INDEX.md`.
- Treating `graphify-out/` as source material instead of generated navigation.
- Changing a content lane without updating schema, routes, helpers, validation, navigation, and docs together.
- Editing broad root docs when a small task-specific docs link would be enough.
