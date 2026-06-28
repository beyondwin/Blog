# Queue Sync Contract

Use this document when the user asks Codex or Claude to "queue sync 해줘".

## Inputs

- Read `queue.md`.
- Process unchecked items that have a `comment:` line.
- Process one item per sync session unless the user explicitly asks for a batch.

## Required Behavior

1. Read the source URL before writing content.
2. Use the queue comment as the editorial angle.
3. Do not rely on memory for source-specific facts.
4. Do not copy long passages from the source.
5. Keep direct quotes short and below 25 words per quote.
6. Choose one analysis format:
   - `research-report`
   - `essay`
   - `visual-page`
7. Create an MDX file under `src/content/analysis/`.
8. Use valid frontmatter from `src/content.config.ts`.
9. Keep generated content readable and reviewable.
10. Run `npm run validate`.
11. Create a `codex/` branch for generated work.
12. Commit, push, and open a GitHub PR.
13. Update the processed queue item with `output:` and `pr:`.

## Queue Item Format

```md
- [ ] https://example.com/some-article
  comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
```

## Successful Output

```md
- [x] https://example.com/some-article
  comment: 제품 전략 관점에서 핵심 주장과 반론을 정리해줘.
  output: src/content/analysis/some-article.mdx
  pr: https://github.com/owner/repo/pull/123
```

## Blocked Output

```md
- [ ] https://example.com/paywalled
  comment: 사업적 시사점 중심으로.
  status: blocked
  error: paywall or access restriction
```

## Generated MDX Shape

```mdx
---
title: "Clear generated title"
description: "One sentence summary for listing and SEO."
sourceUrl: "https://example.com/source"
sourceTitle: "Original source title"
comment: "Original queue comment"
format: "research-report"
createdAt: "2026-05-16"
updatedAt: "2026-05-16"
tags: ["strategy"]
status: "review"
draft: false
---

## Summary

Summarize the source in original language.

## Core argument

Explain the main claim and the evidence.

## Counterpoints

List missing assumptions, risks, or alternate explanations.

## Takeaways

Connect the source to practical decisions.
```
