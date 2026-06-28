# How to Publish And Maintain Content

This guide covers the repeatable project tasks: adding ordinary posts, creating
source-grounded article drafts, processing queue items, projecting public memory,
and maintaining archive docs.

## Prerequisites

- Work from the repository root.
- Run `npm install` once if dependencies are missing.
- Use `npm run validate` before treating a change as ready.

## How to Add An Ordinary Article

1. Create an MDX file under `src/content/articles/`.

   ```mdx
   ---
   title: "Readable title"
   description: "One sentence shown in listings and metadata."
   createdAt: "2026-06-25"
   updatedAt: "2026-06-25"
   tags: ["workflow"]
   status: "review"
   ---

   Start the article body here.
   ```

2. Keep blockquotes short. `scripts/validate-content.mjs` fails any blockquote
   longer than 25 words.

3. Run validation.

   ```bash
   npm run validate
   ```

4. Preview the route.

   ```bash
   npm run dev
   ```

   Visit `/articles/<file-slug>/`.

## How to Add A Review

1. Create an MDX file under `src/content/reviews/`.

   ```mdx
   ---
   title: "Public review title"
   description: "One sentence summary."
   createdAt: "2026-06-25"
   updatedAt: "2026-06-25"
   tags: ["book"]
   status: "review"
   itemType: "book"
   itemTitle: "Original item title"
   itemAuthor: "Author name"
   rating: 4
   completedAt: "2026-06-25"
   sourceUrl: "https://example.com/original"
   coverImage: "https://example.com/cover.jpg"
   ---

   Review body.
   ```

2. Use `itemType` as one of `book`, `article`, `tool`, `course`, or `other`.

3. Run:

   ```bash
   npm run validate
   ```

The review layout renders the cover image when `coverImage` is present. It does
not render original-post links in the article body shell.

## How to Add An Idea Or Travel Note

Use the shared fields from articles plus the collection-specific field.

For ideas:

```mdx
---
title: "Idea title"
description: "Short summary."
createdAt: "2026-06-25"
updatedAt: "2026-06-25"
tags: ["product"]
status: "review"
maturity: "sketch"
---
```

`maturity` must be `seed`, `sketch`, or `proposal`.

For travel:

```mdx
---
title: "Place note"
description: "Short summary."
createdAt: "2026-06-25"
updatedAt: "2026-06-25"
tags: ["travel"]
status: "review"
location: "Seoul"
visitedAt: "2026-06-25"
---
```

## How to Create A Source-Grounded Article Draft

Use the article factory when the article needs an evidence packet plus a
standard source-grounded article scaffold.

```bash
npm run article:new -- "LazyCodex" --title "LazyCodex는 Codex를 어떻게 바꾸는가" --slug "lazycodex"
```

This creates:

- `docs/notes/article-factory/lazycodex.md`
- `src/content/articles/lazycodex.mdx`

The generated article has the `source-grounded` tag. That tag activates
`npm run article:quality`, which requires these sections:

- `## 먼저 알아야 할 개념`
- `## 실제 구조`
- `## 핵심 기능`
- `## 좋은 점`
- `## 조심해야 할 점`
- `## 언제 쓰면 좋은가`
- `## 주니어 개발자가 배울 점`
- `## 내 결론`
- `## 확인한 자료`

Do the source inspection in the packet first, then replace the article scaffold
with real claims and source links.

## How to Process A Queue Item

Queue sync is governed by [SYNC.md](../../../SYNC.md).

1. Add one unchecked URL to [queue.md](../../../queue.md).

   ```md
   - [ ] https://example.com/some-article
     comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
   ```

2. Read the source URL before writing.

3. Use the `comment:` line as the editorial angle.

4. Create an MDX file under `src/content/analysis/` with the required analysis
   frontmatter:

   ```mdx
   ---
   title: "Clear generated title"
   description: "One sentence summary."
   sourceUrl: "https://example.com/source"
   sourceTitle: "Original source title"
   comment: "Original queue comment"
   format: "research-report"
   createdAt: "2026-06-25"
   updatedAt: "2026-06-25"
   tags: ["strategy"]
   status: "review"
   draft: false
   ---
   ```

5. Run:

   ```bash
   npm run validate
   ```

6. Update the queue item with `output:` and, after publishing through GitHub,
   `pr:`. If the source is inaccessible, leave it unchecked and add
   `status: blocked` plus an `error:` line.

## How to Project Public Memory

Reviewed public memory lives in `memory/`. Private drafts should stay in local
ignored files and must not be committed. The public page reads only
`src/data/memory.public.json`.

1. Create or edit a thought under `memory/thoughts/`.

2. To make it public, it must pass all gates:

   - `schema_version: 1`
   - `confidentiality: public`
   - `surfaces` includes `memory-public`
   - `review.status: accepted`
   - `sources` has at least one local path or HTTP(S) URL
   - local source paths are safe relative paths and resolve inside the repo

3. Run the projection:

   ```bash
   npm run memory:project
   ```

4. For validation without rewriting public JSON:

   ```bash
   npm run memory:validate
   ```

5. Preview `/memory/` locally.

## How to Maintain Archive Docs

The archive library under `docs/` has three source layers:

- `docs/_inbox/` for local unsorted intake.
- `docs/raw/` for local source captures where original wording matters.
- `docs/notes/<topic>/` for curated documents.

When adding curated docs:

1. Put the file under a stable `docs/notes/<topic>/` folder.
2. Update `docs/_index/catalog.yml`.
3. Add a topic to `docs/_index/topics.yml` only when the folder is a stable
   retrieval category.
4. Update `docs/INDEX.md`.

`docs/_inbox/`, `docs/raw/`, generated `docs/wiki/`, and `graphify-out/` are
ignored for the public repository unless a document is explicitly promoted into
`docs/notes/`.

## Verification

Run this before considering content or docs ready:

```bash
npm run validate
```

For focused checks:

```bash
npm run article:quality
npm run memory:validate
npm test
npm run build
```

## Troubleshooting

`Content validation failed`
: Check missing frontmatter, invalid `status`, invalid `tags`, invalid URL
  fields, or long blockquotes.

`Article quality validation failed`
: A `source-grounded` article is missing one of the required Korean headings, has
  a repeated `##` heading, contains a placeholder marker, lacks a thesis
  paragraph, or has no source URL in `## 확인한 자료`.

`Memory projection valid` excludes more thoughts than expected
: Inspect the printed `excluded={...}` counts. Common reasons are `private`,
  `notAccepted`, `notPublicSurface`, `missingSource`, and `unsupportedSchema`.

Astro route does not appear
: Confirm the MDX file is in the correct collection folder, `draft` is not
  `true`, and the route slug matches the file name.
