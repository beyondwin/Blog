# Task 10 report — public search

## Outcome

- Replaced the former `찾기` surface with the exact `검색` route and metadata.
- Kept search as an accessible browser-native `GET /search/?q=…` form. The request-aware route loader applies the same 120-code-point bound as the client, while the static production export preserves canonical no-JavaScript GET navigation and discovery links.
- Restricted `SearchKind` and the release inventory to `article | review | thought`; secondary collections, public-memory records, tag documents, and the former `글 / 책 / 문장 / 주제와 태그` headings are absent.
- Added deterministic, corpus-derived popular keywords from active article, review, and thought tags only. Display labels are mapped after normalization, exclusions are applied before counting, ties sort by Korean label, and output is capped at eight.
- Added one fixed, verified release record for each primary discovery lane: `black-swan`, `graphify-code-knowledge-graph-deep-dive`, and `why-i-read-in-the-ai-era`. Only the article card uses its existing approved release asset.
- Search results are one flattened relevance list ordered by title, then tag, then description match, with plain-text type labels. The zero-result state offers real corpus-derived keyword links.
- Omitted the optional bottom closure because no separately approved copy-and-media pair was present.

## TDD evidence

RED was established before implementation with:

```text
npm exec vitest run apps/site/test/ui/search-page.test.tsx apps/site/test/routes.test.tsx
```

The new contract failed against the old grouped `찾기` implementation: exact title/form semantics, primary-only inventory, bounded loader query, dedicated route CSS, deterministic keywords, flattened relevance order, and zero-state suggestions were absent.

Fresh GREEN evidence after implementation:

```text
Test Files  2 passed (2)
Tests       14 passed (14)
```

## Direct consumer expansions

- `apps/site/test/ui/route-presentations.test.tsx`: updated the direct `SearchPage`/route presentation fixtures for discovery data, primary kinds, metadata, and bounded search origin.
- `apps/site/test/css-source-accounting.test.ts`: updated the direct route-critical-CSS consumer to require the dedicated search stylesheet.
- `tests/e2e/no-js.spec.ts`: added production-output GET-form and canonical-navigation checks at desktop and mobile widths.
- `tests/e2e/search-return.spec.ts`: expanded the existing direct search-return consumer to cover empty, non-empty, zero-result, overlong-query, stale-anchor, accessibility, runtime-error, and overflow behavior.

No Task 7 golden or source file was changed. `output/` remains untracked and unstaged.

## Verification

| Check | Result |
| --- | --- |
| Focused search/route Vitest | 14/14 passed |
| `npm run site:test` | 170/170 passed |
| `npm run public-release:build` | passed; release `9c3357e13b2bf32217968e24a512e077626311980065351ba71aa710aa1326ff`, 43 records, 9 assets |
| `npm run public-release:verify` | passed; `privateBoundaryHits: 0` |
| `npm run typecheck --workspace @beyondwin/site` | passed |
| `npm run site:build` | passed; production `/search/` HTML and data were prerendered |
| Dedicated Playwright search-return + no-JS | 10/10 passed at 1440, 390, 426, 360, and 768 px coverage |
| Axe scan of `.search-page` | 0 violations |
| Horizontal overflow/runtime checks | passed for empty, non-empty, zero-result, and overlong-query states |
| Playwright CLI visual inspection | desktop empty and mobile result surfaces inspected; no follow-up correction required |
| Impeccable detector | 0 findings |
| `git diff --cached --check` | passed |

## Repository-wide validation boundary

`npm run validate` completed agent, content, media, article-quality, and memory checks, then stopped in the pre-existing legacy Astro contract because `reading-desk-cobalt` has no media registry record. The independent failures were:

- `src/lib/content/mediaRegistry.test.ts`: 1 failed (`unknown media id reading-desk-cobalt`)
- `tools/parity/test/html-contract.test.ts`: legacy build dependency failed for the same missing record
- `tools/parity/test/route-inventory.test.ts`: legacy build dependency failed for the same missing record

The Task 10 diff does not touch the referenced media registry test, manifest, legacy scene, or parity fixtures. The current React Router production build, release verification, focused search suite, complete site suite, typecheck, and dedicated browser suite all pass independently.
