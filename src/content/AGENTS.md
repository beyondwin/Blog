# Content guidance

These rules apply to MDX collections under `src/content/` and extend `src/AGENTS.md`.

## Contracts

- Confirm the matching schema in `src/content.config.ts` and workflow in `docs/notes/project/publishing-workflows.md` before writing.
- Treat required frontmatter as a contract. Use `review`, `published`, or `archived` deliberately; `draft: true` keeps an entry off public listings.
- Do not change an entry to `published` unless the user explicitly requests publication.

## Source quality

- A `source-grounded` article needs a matching evidence packet under `docs/notes/article-factory/` or equivalent curated evidence.
- Prefer primary sources, identify time-sensitive claims, and distinguish verified facts, inferences, and personal conclusions.
- If a material source is unavailable, report the gap instead of inventing the claim.
- Keep direct quotations short enough for `scripts/validate-content.mjs` and link the source.

## Writing and review

- Write natural Korean technical-blog prose. Avoid repetitive report headings, generic AI transitions, marketing tone, and unsupported certainty.
- Preserve verified facts when improving tone.
- Run `npm run validate` for every content change.
- Inspect the rendered route for substantial prose, source-grounded articles, reviews, tables, links, or layout-sensitive content.
