---
name: research-and-publish
description: Use when beyondwin work involves external repository or URL analysis, source-grounded articles, substantial content revisions, or evidence-backed reviews; not for code-only or archive-only changes.
---

# Research and publish

## Read first

Read `src/content/AGENTS.md`, `docs/notes/project/publishing-workflows.md`, `src/content.config.ts`, and the closest relevant packet under `docs/notes/article-factory/`.

## Workflow

1. Identify the target collection, reader, requested status, and rendered route.
2. Build a source inventory from primary sources: official docs, source code, releases, issues, and reproducible local inspection.
3. Record claim-level evidence, strength, date sensitivity, and the article section it supports.
4. Use `npm run article:new -- <input> --title <title> --slug <slug>` when creating a source-grounded article pair.
5. Separate verified fact, inference, opinion, and unresolved uncertainty in the draft.
6. Keep quotations short and include source URLs.
7. Run `npm run validate`.
8. Inspect the rendered route for prose, table overflow, links, heading rhythm, and desktop/mobile readability.

## Stop conditions

- Do not invent a source-specific claim when access is blocked.
- Do not switch to `published`, promote memory, add dependencies, commit, or push without explicit authorization.
- Do not treat the MDX diff alone as acceptance for a substantial article.
