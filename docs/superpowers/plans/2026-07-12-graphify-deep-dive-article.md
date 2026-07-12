# Graphify Deep-Dive Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently validate, extend, and rewrite the supplied Graphify audit as a native, source-grounded Korean article while preserving the original HTML and its evidence trail.

**Architecture:** This is a content-only change. The immutable source capture lives under `docs/raw/graphify/`, the public reading surface is one Astro MDX article, and an indexed article-factory note records provenance, claim boundaries, and source inventory.

**Tech Stack:** Astro content collections, MDX, YAML docs catalog, existing content/article/memory/Vitest/Astro validation, Graphify generated navigation.

## Global Constraints

- Preserve `/Users/kws/Downloads/graphify_deep_dive_ko.html` byte-for-byte as `docs/raw/graphify/graphify_deep_dive_ko.html`.
- Publish one article at `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`.
- Do not add Astro components, custom routes, client JavaScript, global CSS, or dependencies.
- Keep 2026-07-11 metrics, package versions, and repository observations explicitly dated.
- Distinguish repository HEAD, PyPI release behavior, project benchmark claims, and independently reproduced results.
- Keep the required source-grounded headings enforced by `scripts/article-quality.mjs`.
- Generated `graphify-out/` files are not committed.
- Validate claims against a fresh clone of the official repository and primary sources; do not use the supplied HTML as the sole authority.
- Add only new blind spots that are source-backed, reproducibly observed, or explicitly labeled as engineering inference.

---

### Task 1: Independently Validate The Supplied Report

**Files:**
- Inspect: fresh clone of `https://github.com/Graphify-Labs/graphify.git` outside the Blog repository
- Inspect: primary documentation, package metadata, tests, CI, security policy, and referenced issues
- Record in: `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md`

**Interfaces:**
- Consumes: supplied HTML claims and current official Graphify sources
- Produces: dated verification notes, corrections, and a source-backed blind-spot ledger for later tasks

- [ ] **Step 1: Clone and identify the current source state**

Create a fresh temporary clone, record `git rev-parse HEAD`, tags, `pyproject.toml` version, release metadata, and the source files responsible for graph construction, query, path, update, benchmark, export, install, and security controls.

Expected: every implementation claim retained from the report is mapped to a current source path or marked stale/unverified.

- [ ] **Step 2: Inspect tests, CI, package metadata, and issue evidence**

Review official tests and workflow files for claimed behavior. Verify package name, dependencies, optional extras, supported Python versions, release/version drift, security policy freshness, and the status of issues cited in the source report.

Expected: the evidence packet separates current fact, dated fact, project claim, reproduced observation, and inference.

- [ ] **Step 3: Run safe local probes**

Use an isolated Python environment to run the smallest code-only indexing fixture needed to test deterministic output, node/edge identity, query seed quality, path direction semantics, deletion/update behavior, unsupported or dynamic call gaps, and generated artifact contents. Do not enable model-backed document/media extraction.

Expected: probe commands, versions, fixture shape, and observed results are recorded so the article does not imply broader coverage than was tested.

- [ ] **Step 4: Audit blind spots beyond the supplied report**

Trace branch/commit freshness, worktrees, symlinks, submodules, generated and vendored code, monorepo symbol collisions, graph sharing authorization, secrets and source leakage, schema compatibility, interrupted/concurrent updates, dynamic language features, installer persistence, and benchmark leakage/judge coupling.

Expected: each public blind spot has a primary source, reproducible observation, or an explicit `engineering inference` label; unsupported speculation is omitted.

---

### Task 2: Preserve Source And Create Evidence Packet

**Files:**
- Create: `docs/raw/graphify/graphify_deep_dive_ko.html`
- Create: `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md`

**Interfaces:**
- Consumes: `/Users/kws/Downloads/graphify_deep_dive_ko.html`
- Produces: immutable provenance capture and an internal claim ledger used while editing the public article

- [ ] **Step 1: Preserve the supplied source without transformation**

Run:

```bash
mkdir -p docs/raw/graphify
cp /Users/kws/Downloads/graphify_deep_dive_ko.html docs/raw/graphify/graphify_deep_dive_ko.html
cmp /Users/kws/Downloads/graphify_deep_dive_ko.html docs/raw/graphify/graphify_deep_dive_ko.html
```

Expected: `cmp` exits 0 with no output.

- [ ] **Step 2: Write the evidence packet**

Create `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md` with these exact sections and responsibilities:

```markdown
# Graphify Code Knowledge Graph Deep-Dive Research Packet

## Publication target
- Public article path and supplied raw source path.
- Snapshot date: 2026-07-11.

## Source inventory
- S1-S24 links retained from the supplied report, grouped into official repository/docs, package metadata, issues, benchmark material, and adjacent-tool primary documentation.

## Claim ledger
- Mechanism claims verified from repository code or official architecture docs.
- Controlled-experiment observations reproduced by the supplied report author.
- Project-reported benchmark claims that were not independently reproducible.
- Reviewer judgments that must remain labeled as judgments.

## Experiment boundaries
- PyPI version used, fixture scope, self-index scope, and unverified memory benchmark harness.

## Editorial decisions
- Standalone styling and scripts omitted.
- Repeated report qualifications compressed without deleting limitations.
- Version and popularity figures kept snapshot-dated.

## Quality gate notes
- Required article headings, source links, validation, route preview, and Graphify refresh.
```

Expected: the packet makes it possible to trace each material public claim back to the supplied report and its linked source class.

- [ ] **Step 3: Verify the source capture and packet**

Run:

```bash
cmp /Users/kws/Downloads/graphify_deep_dive_ko.html docs/raw/graphify/graphify_deep_dive_ko.html
rg -n "^## (Publication target|Source inventory|Claim ledger|Experiment boundaries|Editorial decisions|Quality gate notes)$" docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md
git diff --check
```

Expected: `cmp` exits 0, `rg` prints six section headings, and `git diff --check` exits 0.

---

### Task 3: Publish The Native MDX Article

**Files:**
- Create: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`

**Interfaces:**
- Consumes: validated raw source and evidence packet from Tasks 1-2
- Produces: Astro article route `/articles/graphify-code-knowledge-graph-deep-dive/`

- [ ] **Step 1: Add valid article frontmatter**

Start the article with:

```yaml
---
title: "Graphify는 코드 이해를 정말 더 빠르게 만드는가?"
description: "Graphify의 코드 지식 그래프 원리와 질의 방식, 통제 실험, 벤치마크 한계, 보안·운영 사각지대와 현실적인 도입법을 코드와 근거로 검토한다."
createdAt: "2026-07-12"
updatedAt: "2026-07-12"
tags: ["Graphify", "knowledge-graph", "code-search", "AI-agent", "source-grounded"]
status: "published"
---
```

Expected: frontmatter satisfies the `articles` collection schema and activates the source-grounded quality rules.

- [ ] **Step 2: Write the thesis and summary table**

Before the first `##` heading, state that Graphify is valuable as an explainable structural navigation layer but should not be treated as semantic understanding or runtime truth. Add a compact table covering purpose, code extraction cost, query behavior, benchmark confidence, and recommended role.

Expected: the first prose paragraph is longer than 40 characters and gives the reader the verdict immediately.

- [ ] **Step 3: Adapt the report into the required article structure**

Use these top-level headings exactly once:

```markdown
## 먼저 알아야 할 개념
## 실제 구조
## 핵심 기능
## 좋은 점
## 조심해야 할 점
## 언제 쓰면 좋은가
## 주니어 개발자가 배울 점
## 내 결론
## 확인한 자료
```

Place the report material as follows:

- `먼저 알아야 할 개념`: nodes, edges, extracted versus inferred relations, static structure versus runtime truth.
- `실제 구조`: detect, tree-sitter extract, build, cluster, analyze, report, export; local code mode versus optional semantic media processing.
- `핵심 기능`: `query`, `path`, source locations, controlled experiments A-D, and the distinction between undirected traversal and directional causality.
- `좋은 점`: local AST extraction, source explainability, onboarding/navigation value, determinism improvements, and low code-only extraction cost.
- `조심해야 할 점`: lexical seed noise, construct-dependent call resolution, benchmark reproducibility, graph artifact sensitivity/size, prompt injection, package/version drift, stale update risks, branch/worktree provenance, generated and vendored code, authorization and graph sharing, artifact schema compatibility, interrupted/concurrent updates, installer persistence, and benchmark leakage when supported by evidence.
- `언제 쓰면 좋은가`: tool comparison, hybrid resolver/search/trace design, staged adoption, and measurable acceptance thresholds.
- `주니어 개발자가 배울 점`: graph mental model, evidence hierarchy, static versus runtime evidence, and benchmark reading discipline.
- `내 결론`: the dated verdict and conservative adoption recommendation.
- `확인한 자료`: retain direct source links for every source class used by the final prose.

Expected: the article keeps the report's evidence and limitations while reading as continuous technical-blog prose rather than a formal audit microsite.

- [ ] **Step 4: Run focused article validation**

Run:

```bash
node scripts/article-quality.mjs
node scripts/validate-content.mjs
```

Expected: both commands exit 0 and print successful validation messages.

---

### Task 4: Register The Evidence Packet

**Files:**
- Modify: `docs/_index/catalog.yml`
- Modify: `docs/INDEX.md`

**Interfaces:**
- Consumes: evidence packet from Task 1
- Produces: curated-library discovery through the YAML source of truth and human-readable docs index

- [ ] **Step 1: Add the catalog entry**

Insert the following entry within the `skills/agent-workflows` group in `docs/_index/catalog.yml`:

```yaml
- title: Graphify Code Knowledge Graph Deep-Dive Research Packet
  path: docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md
  topic: skills/agent-workflows
  type: research-note
  language: ko
  status: organized
  summary: Internal evidence packet for the published Graphify deep-dive article, including the supplied HTML report, code-audit claims, controlled experiments, benchmark caveats, and editorial boundaries.
  source: src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx
  updated: 2026-07-12
```

Expected: the existing topic remains unchanged because `skills/agent-workflows` already covers agent tooling research.

- [ ] **Step 2: Add the visible docs index row**

Insert this row in the matching topic group in `docs/INDEX.md`:

```markdown
| Graphify Code Knowledge Graph Deep-Dive Research Packet | skills/agent-workflows | research-note | ko | organized | [docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md](notes/article-factory/graphify-code-knowledge-graph-deep-dive.md) |
```

Expected: the YAML catalog and Markdown index point to the same file with matching metadata.

- [ ] **Step 3: Verify index consistency and formatting**

Run:

```bash
rg -n "Graphify Code Knowledge Graph Deep-Dive Research Packet" docs/_index/catalog.yml docs/INDEX.md
git diff --check
```

Expected: `rg` prints one match in each index and `git diff --check` exits 0.

---

### Task 5: Run Full Verification And Commit

**Files:**
- Verify: `docs/raw/graphify/graphify_deep_dive_ko.html`
- Verify: `docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md`
- Verify: `src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx`
- Verify: `docs/_index/catalog.yml`
- Verify: `docs/INDEX.md`
- Verify: `docs/superpowers/specs/2026-07-12-graphify-deep-dive-article-design.md`
- Verify: `docs/superpowers/plans/2026-07-12-graphify-deep-dive-article.md`

**Interfaces:**
- Consumes: all implementation outputs
- Produces: validated build, checked article route, refreshed ignored Graphify navigation, and final Git commit

- [ ] **Step 1: Run the canonical validation gate**

Run:

```bash
npm run validate
git diff --check
```

Expected: content validation, article quality, memory projection, Vitest, Astro check, and Astro build all pass; the diff has no whitespace errors.

- [ ] **Step 2: Verify the built route and key content**

Run:

```bash
test -f dist/articles/graphify-code-knowledge-graph-deep-dive/index.html
rg -n "Graphify는 코드 이해를 정말 더 빠르게 만드는가|확인한 자료|Graphify README" dist/articles/graphify-code-knowledge-graph-deep-dive/index.html
```

Expected: the built page exists and all three strings are present.

- [ ] **Step 3: Preview the route locally**

Run a foreground server:

```bash
npm run dev -- --host 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/articles/graphify-code-knowledge-graph-deep-dive/` and verify desktop and mobile layouts: title, summary table, headings, code blocks, outbound links, and footer render without horizontal overflow.

Expected: the article is readable in both viewport classes and no content section is missing.

- [ ] **Step 4: Refresh Graphify navigation**

Run:

```bash
graphify update .
```

Expected: Graphify completes successfully. If it refuses because the rebuilt graph has fewer nodes, run `graphify update . --force`; do not stage `graphify-out/`.

- [ ] **Step 5: Inspect and commit the approved scope**

Run:

```bash
git status --short
git diff --check
git add docs/raw/graphify/graphify_deep_dive_ko.html \
  docs/notes/article-factory/graphify-code-knowledge-graph-deep-dive.md \
  src/content/articles/graphify-code-knowledge-graph-deep-dive.mdx \
  docs/_index/catalog.yml docs/INDEX.md
git add -f docs/superpowers/plans/2026-07-12-graphify-deep-dive-article.md
git diff --cached --check
git commit -m "docs: publish graphify deep dive"
```

Expected: the commit succeeds and contains only the approved article, source capture, evidence packet, index updates, and implementation plan. The already committed design remains referenced but is not recommitted.
