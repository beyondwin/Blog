# Why beyondwin Is Structured This Way

`beyondwin` is built around one product decision: writing is the product. The
site is not a CMS demo, a SaaS landing page, or a portfolio shell. It is a
personal archive where development articles, source-grounded analysis, reviews,
ideas, travel notes, and public memory can stay findable over time.

## The Problem

Personal writing systems usually fail in one of three ways:

1. Everything goes into one undifferentiated blog stream, so readers cannot tell
   whether a page is a technical article, a book review, an idea, or a research
   note.
2. The design becomes decorative, so navigation and visual style compete with
   long reading.
3. Private thinking and public publishing get mixed, so unfinished or sensitive
   notes can leak into the public site.

This project solves those problems with typed content lanes, a restrained design
system, and an explicit private-to-public memory projection.

## The Approach

The project separates source types instead of relying on tags alone.

```text
src/content/articles  -> long development articles
src/content/analysis  -> source-grounded queue output
src/content/reviews   -> books, tools, courses, articles, media
src/content/ideas     -> early ideas and proposals
src/content/travel    -> place notes
memory/thoughts       -> reviewed public thought source
src/data/memory.public.json -> reviewed public memory projection
```

Astro content collections enforce each lane's frontmatter. Shared helpers in
`src/lib/content.ts` then normalize dates, routes, labels, tags, and sorting so
pages can stay simple.

## Why Astro And MDX

Astro fits this project because the public surface is mostly static reading:

- Collection routes can be generated at build time.
- MDX keeps writing close to the rendered page while still allowing components
  such as `Callout`.
- There is no backend required for ordinary browsing.
- Validation can happen before deploy through scripts and Astro's own checks.

The trade-off is that dynamic features must be deliberate. `/memory` uses a
static JSON projection instead of reading private memory directly or querying a
database at runtime.

## Why Typed Collections Instead Of One Folder

Typed collections prevent silent content drift. A review has different metadata
from an analysis report. A travel note needs location. An idea has maturity. A
queue-generated analysis needs source provenance.

That separation makes collection pages predictable:

- Review dates prefer `completedAt`.
- Travel dates prefer `visitedAt`.
- Analysis cards can show format labels derived from `format`.
- Draft filtering works consistently across detail pages and listing pages.

The trade-off is that adding a new writing lane requires a schema, route, layout
decision, and validation update. That is intentional. A new lane should be a real
product shape, not a casual folder.

## Why The Memory System Is Private-First

The memory system starts from private thoughts and exports only reviewed public
ones.

```text
memory/thoughts/*.md
  -> scripts/memory/project.mjs
  -> src/data/memory.public.json
  -> src/pages/memory.astro
```

The public gate requires explicit `public` confidentiality, accepted review
status, the `memory-public` surface, and at least one resolvable source. This
keeps `/memory` useful without making the Astro page responsible for privacy.

The trade-off is ceremony. A thought must be reviewed and projected before it
appears publicly. That cost is lower than the cost of leaking private notes.

## Why Source-Grounded Articles Have A Stricter Shape

Articles tagged `source-grounded` represent analysis based on external material
or repository inspection. They need stronger evidence hygiene than ordinary
personal essays.

The article quality gate requires:

- a first thesis paragraph,
- required Korean section headings,
- no placeholder markers,
- no duplicate headings,
- at least one source URL in `## 확인한 자료`.

This makes generated or assisted drafts less likely to ship as loose summaries.
The trade-off is less stylistic freedom for that article type. That is acceptable
because the tag means the reader expects evidence, structure, and transferability.

## Why Docs Have Source, Note, And Generated Layers

The archive under `docs/` separates durable source material from generated
navigation:

```text
docs/_inbox   -> unsorted intake
docs/raw      -> original wording and provenance
docs/notes    -> curated library
docs/wiki     -> generated summaries/navigation
graphify-out  -> generated graph navigation
```

Important answers should verify claims against `docs/raw/` or `docs/notes/`
because generated wiki and graph layers are shortcuts, not source authority.

The trade-off is index maintenance. New curated files must update
`docs/_index/catalog.yml`, `docs/_index/topics.yml` when needed, and
`docs/INDEX.md`. That keeps the library useful for both humans and agents.

## Why The Design Is Restrained

`PRODUCT.md` and `DESIGN.md` define the site as a precise personal field
notebook and paper command journal. The visual system intentionally avoids
generic AI-product patterns:

- no purple-blue gradients,
- no decorative blobs,
- no glass panels,
- no heavy shadows,
- no oversized SaaS hero selling the site back to the reader.

The design uses white paper, black ink, graphite metadata, hairline separators,
compact rows, and one cyan-blue signal accent. This keeps the writing and
archive structure ahead of the decoration.

The trade-off is that the site is quieter than many personal sites. That is the
point. It should be easy to scan, read, and return to months later.

## Operating Principle

Every durable addition should answer three questions:

1. Which lane does this belong to?
2. Which validation gate proves it is safe to publish?
3. Which index or route will help a future reader find it?

If the answer is unclear, use `docs/_inbox/` for intake or keep the material
private until the shape is clear.
