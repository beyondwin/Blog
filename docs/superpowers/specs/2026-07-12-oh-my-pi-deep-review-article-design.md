# oh-my-pi Deep Review Article Design

Date: 2026-07-12
Status: approved design
Scope: turn the supplied standalone Korean HTML report into one source-grounded blog article

## Goal

Publish a readable Korean technical article based on:

- `/Users/kws/Downloads/oh-my-pi-deep-review-ko.html`

The article should help individual developers and engineering teams understand what `can1357/oh-my-pi` is, where its architecture is strong, which trust boundaries matter, and how to evaluate adoption without treating the project as either a toy or a safe-by-default coding assistant.

## Approved Direction

Use the balanced long-form MDX approach:

1. Convert the report into an article in the existing `articles` collection.
2. Preserve the source-grounded technical, security, and adoption analysis.
3. Remove the standalone HTML shell, custom CSS, theme switcher, navigation JavaScript, and print behavior.
4. Consolidate repeated risk cards and glossary material into a focused blog narrative.
5. Keep time-sensitive repository metrics explicitly labeled as a 2026-07-11 snapshot.
6. Preserve direct links to the upstream repository, official documentation, and cited GitHub issues.

## Content Shape

The article should follow this reading flow:

1. Opening verdict and a compact summary table.
2. A plain-language explanation of OMP as an agent harness rather than a model.
3. Architecture and workflow: entry surfaces, agent runtime, policy/tool registry, and privileged execution boundaries.
4. Engineering strengths: integrated developer tooling, package boundaries, test/CI posture, and rapid maintenance.
5. Security and operational risks, consolidated by theme:
   - permissive approval defaults and headless subagents,
   - unsandboxed extensions and MCP credentials,
   - secrets, sessions, logs, and browser state,
   - prompt injection and model/provider drift,
   - release cadence, native dependencies, and runtime stability.
6. A secure baseline for personal and team use.
7. A staged four-week pilot with measurable speed, quality, cost, safety, and reliability criteria.
8. A practical adoption decision guide and final verdict.
9. Evidence, limitations, and upstream source links.

## Editorial Rules

- Write in the natural technical-blog voice already used by the Hermes and Ponytail analysis articles.
- Do not copy the HTML report verbatim. Compress repeated cards into connected prose and tables.
- Keep material claims tied to upstream documentation, source paths, releases, or issues.
- Distinguish project claims from the article author's inference.
- Avoid presenting snapshot metrics or open issue state as permanently current.
- Explain jargon near first use; retain only glossary terms that materially help the article.
- Keep security recommendations concrete and proportional. Do not imply that configuration alone replaces OS, network, credential, and review boundaries.

## Files

- Create `src/content/articles/oh-my-pi-deep-review.mdx`.
- Create `docs/notes/article-factory/oh-my-pi-deep-review.md` as the evidence and editorial packet.
- Update `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and `docs/INDEX.md` for the curated evidence note.
- Create `docs/superpowers/plans/2026-07-12-oh-my-pi-deep-review-article.md` before implementation.

No new image, component, route, schema, or client-side JavaScript is required.

## Verification

The implementation should pass:

```bash
npm run validate
git diff --check
graphify update .
```

The generated article route should also be inspected to confirm that headings, tables, code blocks, and outbound links render correctly on desktop and a narrow viewport.

## Acceptance Criteria

- The article has valid frontmatter and publishes through the existing `articles` collection.
- It reads as a coherent technical blog post rather than a converted report or raw HTML dump.
- The central verdict, architecture analysis, major trust boundaries, secure baseline, pilot plan, and adoption criteria remain intact.
- Time-sensitive facts are dated and source links are preserved.
- The evidence packet records the supplied source, transformation decisions, limitations, and the main upstream references.
- Documentation indexes remain synchronized.
- Repository validation, rendered-route review, and Graphify refresh complete successfully.
