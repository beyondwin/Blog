# oh-my-pi Deep Review Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a high-quality Korean `oh-my-pi` review that verifies the supplied report against the live upstream repository and surfaces code-derived blind spots not stated directly in project documentation.

**Architecture:** The public deliverable is one MDX article in the existing `articles` collection. A curated research packet records the supplied HTML, exact upstream commit, commands, inspected source paths, evidence strength, issue state, and editorial inferences; archive indexes expose that packet as a durable internal note.

**Tech Stack:** Git, Bun/TypeScript upstream repository, Astro content collections, MDX, YAML documentation indexes, Node repository validation, Graphify

## Global Constraints

- Treat `/Users/kws/Downloads/oh-my-pi-deep-review-ko.html` as an input hypothesis, not final truth.
- Clone `https://github.com/can1357/oh-my-pi.git` and record the exact inspected commit and date.
- Verify important claims against source code, tests, CI, package metadata, official documentation, releases, and current issue state.
- Label volatile metrics and issue state with their observation date.
- Separate verified fact, upstream claim, issue report, and editorial inference.
- Add code-derived blind spots that are absent or understated in public docs.
- Do not run privileged installers, publish steps, credentialed integrations, or destructive upstream commands.
- Remove the standalone HTML shell, CSS, JavaScript, and report-like repetition.
- Add no new image, component, route, schema, dependency, or browser-side script.
- Keep `docs/_index/catalog.yml`, `docs/_index/topics.yml`, and `docs/INDEX.md` synchronized.

---

### Task 1: Verify the upstream project and build an evidence ledger

**Files:**
- Create: `docs/notes/article-factory/oh-my-pi-deep-review.md`

- [ ] Clone the upstream repository into a fresh temporary directory and record `git rev-parse HEAD`, `git log -1`, repository size, package versions, and workspace layout.
- [ ] Inspect README, root and coding-agent manifests, development guide, AGENTS rules, CI, approval mode, secrets, extension loading, MCP, session, memory, collaboration, auth broker, installer, security policy, contribution rules, and roboomp.
- [ ] Trace implementation paths for approval decisions, subagent spawning, extension loading, MCP process/OAuth handling, secret masking, tool filtering/discovery, browser state, session persistence, collaboration capability links, RPC parsing, telemetry/update checks, and installer integrity.
- [ ] Read related tests to distinguish documented intent from enforced behavior.
- [ ] Check the live state of cited issues `#5192`, `#4820`, `#5194`, `#5189`, and `#5181`, plus releases and security policy.
- [ ] Run low-risk upstream verification selected from declared lint/typecheck/test commands; document commands, result, duration, and anything skipped.
- [ ] Record blind spots under explicit headings: trust-boundary composition, policy bypass/semantic gaps, persistence and data retention, supply-chain/update channel, failure containment, concurrency/resource limits, cost/reviewer amplification, and documentation-to-code drift.

The packet must use these exact top-level sections:

```markdown
# oh-my-pi Deep Review Research Packet
## Intake
## Upstream Snapshot
## Source Inventory
## Verification Commands
## Evidence Ledger
## Code-Derived Blind Spots
## Editorial Transformation
## Limitations
## Quality Gate Notes
```

### Task 2: Synchronize the archive indexes

**Files:**
- Modify: `docs/_index/catalog.yml`
- Modify: `docs/_index/topics.yml`
- Modify: `docs/INDEX.md`

- [ ] Add catalog id `oh-my-pi-deep-review`, title `oh-my-pi Deep Review Research Packet`, topic `skills/agent-workflows`, type `research-note`, language `ko`, status `organized`, and source `src/content/articles/oh-my-pi-deep-review.mdx`.
- [ ] Add the packet path to the existing `skills/agent-workflows` topic document list.
- [ ] Add the matching human-readable table row to `docs/INDEX.md`.
- [ ] Run `rg -n "oh-my-pi-deep-review"` across all four files and `git diff --check`.

### Task 3: Write the verified public article

**Files:**
- Create: `src/content/articles/oh-my-pi-deep-review.mdx`

- [ ] Add valid published frontmatter dated `2026-07-12`, tagged `AI`, `agent`, `developer-tools`, `security`, and `source-grounded`.
- [ ] Open with a compact verdict table and explain OMP as a privileged agent harness, not a model.
- [ ] Explain the verified architecture and the strongest engineering decisions using inspected source paths.
- [ ] Consolidate documented and code-derived risks into: approvals/headless execution; extensions/MCP/credentials; persistence/secrets/browser/collab; untrusted input/model drift; release/native/runtime operations; and reviewer/cost amplification.
- [ ] For every major risk, state the concrete impact, evidence category, and mitigation without presenting configuration as a complete sandbox.
- [ ] Add a personal secure baseline, team architecture, staged four-week pilot, measurable evaluation criteria, decision checklist, and final verdict.
- [ ] Add an evidence and limitations section with the inspected upstream commit, observation date, principal official links, verification boundary, and explicitly untested surfaces.
- [ ] Run `node scripts/validate-content.mjs` and `npm run article:quality`.

### Task 4: Validate rendering and commit

**Files:**
- Verify: `dist/articles/oh-my-pi-deep-review/index.html`
- Refresh: ignored `graphify-out/`
- Stage: article, packet, three indexes, and this plan

- [ ] Run `npm run validate` and require all content, article quality, memory, test, and Astro build gates to pass.
- [ ] Confirm built HTML contains the title, code-derived blind spots, secure baseline, pilot, exact commit, and upstream links.
- [ ] Inspect `/articles/oh-my-pi-deep-review/` at desktop and narrow viewport widths for headings, tables, code wrapping, links, and absence of raw standalone UI.
- [ ] Run `graphify update .`, `git diff --check`, and confirm generated graph output remains ignored.
- [ ] Review the final diff for unsupported claims, accidental snapshot/current-state mixing, repetition, and AI-report tone.
- [ ] Force-add this ignored plan, stage authored files only, run `git diff --cached --check`, and commit as `docs: publish oh-my-pi deep review`.
