# Research Article Workflow

This note defines the repeatable workflow for turning a keyword, URL, GitHub
repository, or social thread into a publishable article in this Astro blog.

Use this when the user says something like:

- `LazyCodex에 대한 아티클 추가해줘`
- `이 깃허브 주소 분석해서 주니어도 이해하게 글 써줘`
- `이 키워드로 웹/깃허브/스레드 다 찾아서 블로그 글 만들어줘`

## Output Contract

Each request should produce one public article unless the user asks for a
different collection.

- Article path: `src/content/articles/<slug>.mdx`
- Status: `published`
- Language: Korean by default
- Audience: developer readers, including juniors
- Style: product-quality analysis, not a loose memo
- Evidence: primary sources first, social sources as signals only
- Safety: never execute untrusted external repository code during research

## Standard Command Flow

Start a new source-grounded article with:

```bash
npm run article:new -- "<keyword-or-url>" --title "<reader-facing title>"
```

The command creates:

- `docs/notes/article-factory/<slug>.md`
- `src/content/articles/<slug>.mdx`

Complete the research packet before changing article status to `published`.
Run the article quality gate before the full site validation:

```bash
npm run article:quality
npm run validate
```

## Intake

Treat the user input as one of these shapes:

| Input | Action |
| --- | --- |
| Keyword only | Search web, GitHub, social, and official docs for canonical source |
| GitHub URL | Clone to `/tmp/<slug>-review`, inspect source statically, then search external discussion |
| Product URL | Read official docs, search GitHub/source package, then inspect social and third-party analysis |
| Social URL | Open the source, identify the underlying product/repo, then verify against primary sources |

If the canonical source cannot be identified, write a short clarification
question instead of guessing.

## Research Pass

Cover these axes before writing:

1. Canonical identity: official site, GitHub org/repo, package name, owner, license, latest release.
2. Source reality: local clone HEAD, file tree, entrypoint, package metadata, docs, tests, runtime components.
3. Product promise: README, official docs, launch copy, command surface, installation path.
4. Independent discussion: Threads, X, LinkedIn, blog posts, issues, release notes.
5. Risks: permissions, telemetry, untrusted code, maintenance pace, vendor/API drift, cost.
6. Reader value: what a junior should understand, how a senior should evaluate adoption.

For web sources, cite links in the article. For local source inspection, record
the clone path and commit hash in the article's methodology or source section.

## Source Rules

- Prefer official docs, GitHub source, releases, issues, and package metadata.
- Use social posts to understand adoption and current discourse, not as proof of implementation.
- Avoid long direct quotes. Paraphrase and link instead.
- If a page is inaccessible or dynamic, say that the claim is based on search snippets or omit it.
- Do not run install scripts, package scripts, tests, or binaries from an external repository unless the user explicitly asks and the risk is acceptable.

## Article Shape

Use this structure unless the topic needs a different flow:

```md
---
title: "<topic-specific title>"
description: "<one-sentence value proposition>"
createdAt: "YYYY-MM-DD"
updatedAt: "YYYY-MM-DD"
tags: ["AI", "tooling", "workflow"]
status: "published"
---

<Clear thesis in 2-4 paragraphs.>

## 먼저 알아야 할 개념
<Explain the core concept for juniors.>

## 실제 구조
<Explain source-verified architecture and important files.>

## 핵심 기능
<Explain what users actually get.>

## 좋은 점
<What is strong, with evidence.>

## 조심해야 할 점
<Risks and adoption constraints.>

## 언제 쓰면 좋은가
<Practical adoption guidance.>

## 주니어 개발자가 배울 점
<Transferable lessons.>

## 내 결론
<Clear opinion and next-step recommendation.>

## 확인한 자료
<Links and local clone commit.>
```

## Evidence Ledger Template

Keep this ledger mentally or in a scratch note while researching:

| Claim | Evidence | Strength | Article section |
| --- | --- | --- | --- |
| Official identity | Official docs / GitHub repo | High | intro |
| Install path | package entrypoint / docs | High | actual structure |
| Current hype | Threads / X / LinkedIn | Medium | discourse |
| Risk | source file / issue / docs | High | risks |

Only include claims in the article when the evidence strength is clear.

## Verification

After writing:

1. Run `npm run article:quality`.
2. Run `npm run validate`.
3. Open `/articles/` and the article page in the local browser.
4. Check visible title, metadata, prose width, links, and mobile wrapping.
5. Run `graphify update . --force` after graphable file changes.
6. Leave unrelated dirty files unstaged and unmodified.
