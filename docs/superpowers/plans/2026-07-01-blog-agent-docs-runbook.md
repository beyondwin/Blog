# Blog Agent Docs Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact agent runbook that routes coding agents through the Blog repo's documentation, edit surfaces, boundaries, and verification gates.

**Architecture:** Keep the existing human-facing Diataxis docs unchanged in shape. Add `docs/notes/project/agent-runbook.md` as an execution-oriented task map, then wire it into the existing project docs hub and archive index metadata.

**Tech Stack:** Markdown, YAML, Astro content docs, npm validation scripts, Graphify navigation policy.

## Global Constraints

- Do not rewrite the full `docs/notes/project/` set.
- Do not restructure `README.md`, `PRODUCT.md`, `DESIGN.md`, or `SYNC.md`.
- Do not add new documentation automation scripts.
- Do not generate `docs/wiki/`.
- Do not change the Astro site UI.
- Do not change content schemas, routes, or validation logic.
- Keep `graphify-out/` as generated navigation, not authored source material.
- Add the new curated project note to the existing `project` topic.
- Final implementation verification must include `npm run validate` and `git diff --check`.

---

## File Structure

- Create `docs/notes/project/agent-runbook.md`.
  - Responsibility: agent-facing task routing, read order, edit-surface map, validation matrix, public/private boundaries, index sync rules, Graphify rules, and common failure modes.
- Modify `README.md`.
  - Responsibility: shared repo entry point; add one concise link to the agent runbook in the documentation section.
- Modify `docs/notes/project/README.md`.
  - Responsibility: human-facing project docs hub; add the runbook to the document map and clarify its execution-oriented role.
- Modify `docs/_index/catalog.yml`.
  - Responsibility: source of truth for `docs/INDEX.md`; add one metadata entry for the new runbook under `project`.
- Modify `docs/_index/topics.yml`.
  - Responsibility: topic registry; update only the existing `project` description so it includes agent task routing.
- Modify `docs/INDEX.md`.
  - Responsibility: human-readable docs catalog; add one row for the new runbook.

---

### Task 1: Create Agent Runbook

**Files:**
- Create: `docs/notes/project/agent-runbook.md`

**Interfaces:**
- Consumes: existing contracts from `README.md`, `SYNC.md`, `DESIGN.md`, `docs/README.md`, `docs/_index/README.md`, `docs/notes/project/publishing-workflows.md`, `docs/notes/project/architecture-reference.md`, and `docs/implementation/memory-second-brain.md`.
- Produces: `docs/notes/project/agent-runbook.md`, which Task 2 and Task 3 link and catalog.

- [ ] **Step 1: Verify source context before writing**

Run:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' SYNC.md
sed -n '1,220p' DESIGN.md
sed -n '1,220p' docs/README.md
sed -n '1,220p' docs/_index/README.md
sed -n '1,260p' docs/notes/project/publishing-workflows.md
sed -n '1,280p' docs/notes/project/architecture-reference.md
sed -n '1,220p' docs/implementation/memory-second-brain.md
```

Expected: each command exits 0 and confirms the current route, content, memory, archive docs, and validation contracts.

- [ ] **Step 2: Create the runbook document**

Create `docs/notes/project/agent-runbook.md` with this complete structure and concrete content:

```md
# Agent Runbook

This runbook is for coding agents working in `beyondwin`. It routes tasks to the
right source documents, edit surfaces, boundaries, and verification commands.

Use the human-facing project docs for explanation:

- [Project docs hub](README.md)
- [Getting started](getting-started.md)
- [Publishing workflows](publishing-workflows.md)
- [Architecture reference](architecture-reference.md)
- [Design and content rationale](design-and-content-rationale.md)

## Read Order

Read the smallest useful set for the task.

| Task | Read first | Then confirm |
| --- | --- | --- |
| Architecture or codebase question | `graphify-out/GRAPH_REPORT.md`, then `docs/notes/project/architecture-reference.md` | Relevant `src/` or `scripts/` files |
| Ordinary article | `docs/notes/project/publishing-workflows.md` | `src/content.config.ts` |
| Source-grounded article | `docs/notes/project/publishing-workflows.md`, relevant `docs/notes/article-factory/` packet | Rendered article route |
| Review, idea, or travel note | `docs/notes/project/publishing-workflows.md`, `docs/notes/project/architecture-reference.md` | Matching collection schema in `src/content.config.ts` |
| Queue analysis | `SYNC.md`, `docs/notes/project/publishing-workflows.md` | `scripts/queue.mjs` and `queue.md` |
| Public memory projection | `docs/notes/project/architecture-reference.md`, `docs/implementation/memory-second-brain.md` | `scripts/memory/schema.mjs`, `scripts/memory/project.mjs`, `src/lib/memoryData.ts` |
| Archive docs note | `docs/README.md`, `docs/_index/README.md` | `docs/_index/catalog.yml`, `docs/_index/topics.yml`, `docs/INDEX.md` |
| New content lane | `docs/notes/project/architecture-reference.md`, `DESIGN.md` | Existing pages, layouts, validation scripts, and navigation |
| Route, layout, or style change | `DESIGN.md`, `docs/notes/project/architecture-reference.md` | Target `src/pages`, `src/layouts`, `src/components`, or CSS files |

## Task Map

| Task family | Purpose | Editable surface | Risky surface | Verification |
| --- | --- | --- | --- | --- |
| Ordinary article | Add a technical essay or development note | `src/content/articles/*.mdx` | Routes, layouts, schema, unrelated articles | `npm run validate`; preview the generated article route, such as `/articles/my-note/`, when user asks for rendered review |
| Source-grounded article | Publish a source-backed analysis article with evidence | `src/content/articles/*.mdx`, `docs/notes/article-factory/*.md` | Long copied source text, missing evidence, unrelated packets | `npm run validate`; inspect rendered article route |
| Review | Add a book, article, tool, course, or media review | `src/content/reviews/*.mdx` | Review layout and imported review contracts unless requested | `npm run validate`; preview the generated review route, such as `/reviews/my-review/`, for substantial prose |
| Idea | Add a seed, sketch, or proposal | `src/content/ideas/*.mdx` | Schema defaults without explicit `maturity` | `npm run validate` |
| Travel note | Add a travel or place record | `src/content/travel/*.mdx` | Collection routing and unrelated travel entries | `npm run validate` |
| Queue analysis | Turn a queued URL into an analysis entry | `queue.md`, `src/content/analysis/*.mdx` | Fabricated source claims, paywalled source guesses, missing `output:` metadata | `npm run validate`; confirm `queue.md` metadata |
| Public memory projection | Promote accepted public thoughts to `/memory` | `memory/thoughts/*.md`, `memory/edges.jsonl`, `memory/sources.jsonl`, `src/data/memory.public.json` | Direct imports from `memory/**` in public routes, private thoughts, unsafe source paths | `npm run memory:validate`; `npm run validate` before closeout |
| Archive docs note | Add or move a curated internal document | `docs/notes/**`, `docs/raw/**` when provenance matters, `docs/_index/*.yml`, `docs/INDEX.md` | `docs/wiki/`, `graphify-out/`, uncataloged durable notes | `npm run validate` when practical; confirm index paths exist |
| New content lane | Add a new public collection and route surface | `src/content.config.ts`, `src/pages`, `src/layouts`, `src/lib/content.ts`, validation scripts, project docs | Treating a lane as a folder-only change | `npm run validate`; preview listing and detail routes |
| Route, layout, or style change | Change visible site behavior or reading experience | `src/pages`, `src/layouts`, `src/components`, `src/styles/global.css` | One-note palettes, nested cards, broken mobile text, missing focus states | `npm run validate`; browser check affected routes |

## Validation Matrix

| Change type | Minimum verification | Extra verification |
| --- | --- | --- |
| Docs-only project note | `git diff --check` | `npm run validate` before final closeout |
| Archive docs note or index change | `git diff --check`, path check for catalog entries | `npm run validate` |
| Ordinary content | `npm run validate` | Route preview when text quality or layout matters |
| Source-grounded article | `npm run validate` | Rendered route review and evidence packet check |
| Memory projection | `npm run memory:validate`, `npm run validate` | Preview `/memory/` when UI or projection output changes |
| Route, layout, style, or component | `npm run validate` | Browser check on desktop and mobile-sized viewport |
| New content lane | `npm run validate` | Listing route and detail route preview |

## Public And Private Boundaries

- `/memory` reads `src/data/memory.public.json`; it must not import or parse `memory/**` directly.
- New thoughts should start private unless the user explicitly wants public memory.
- Public memory export requires `confidentiality: public`, `surfaces: [memory-public]`, `review.status: accepted`, and at least one safe source.
- `docs/raw/` preserves source wording and provenance; curated explanations belong in a stable topic folder under `docs/notes/`.
- `docs/wiki/` and `graphify-out/` are generated navigation layers, not source of truth.
- Source-grounded articles need evidence packets or equivalent source notes; do not rely on memory for source-specific claims.
- Direct quotes must stay short enough for `scripts/validate-content.mjs` blockquote checks.

## Index Sync Rules

When adding, moving, or deleting a durable curated note under `docs/notes/`:

1. Update `docs/_index/catalog.yml`.
2. Update `docs/_index/topics.yml` only when the topic category changes or its description becomes inaccurate.
3. Update `docs/INDEX.md` so humans can find the note.
4. Confirm every catalog path points to an existing file.

Do not catalog generated `docs/wiki/` pages or `graphify-out/` files as primary sources.

## Graphify Rules

- Before architecture or codebase answers, read `graphify-out/GRAPH_REPORT.md`.
- If a generated wiki exists under `graphify-out/wiki/`, use it for navigation before broad raw-file reads.
- For cross-module relationship questions, prefer `graphify query`, `graphify path`, or `graphify explain` after checking the report.
- Verify important claims against `src/`, `scripts/`, `docs/raw/`, or `docs/notes/`.
- After modifying code files, run `graphify update .`.
- Documentation-only changes do not require a graph refresh unless the task explicitly updates navigation artifacts.

## Common Failure Modes

- Adding an MDX file without running `npm run validate`.
- Publishing a `source-grounded` article without source evidence or the required article-quality headings.
- Letting `/memory` read private `memory/**` files directly.
- Adding a curated docs note without updating `catalog.yml`, `topics.yml` when needed, and `docs/INDEX.md`.
- Treating `graphify-out/` as source material instead of generated navigation.
- Changing a content lane without updating schema, routes, helpers, validation, navigation, and docs together.
- Editing broad root docs when a small task-specific docs link would be enough.
```

- [ ] **Step 3: Verify the runbook has the required sections**

Run:

```bash
for heading in "Read Order" "Task Map" "Validation Matrix" "Public And Private Boundaries" "Index Sync Rules" "Graphify Rules" "Common Failure Modes"; do
  rg -n "^## ${heading}$" docs/notes/project/agent-runbook.md
done
```

Expected: each heading prints exactly one matching line.

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add docs/notes/project/agent-runbook.md
git commit -m "docs: add agent runbook"
```

Expected: commit succeeds with only `docs/notes/project/agent-runbook.md` staged.

---

### Task 2: Wire Runbook Into Project Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/notes/project/README.md`

**Interfaces:**
- Consumes: `docs/notes/project/agent-runbook.md` from Task 1.
- Produces: human and shared entry points that route agents to the new runbook.

- [ ] **Step 1: Add the README link**

In `README.md`, under `## 문서`, add this bullet after the project docs intro and before `시작하기`:

```md
- [Agent Runbook](docs/notes/project/agent-runbook.md): 에이전트가 작업별 read order, 수정 표면, 검증 기준, public/private boundary를 빠르게 확인하는 실행 지도.
```

Keep the existing human-facing bullets unchanged except for their relative order after this new bullet.

- [ ] **Step 2: Add the project hub row**

In `docs/notes/project/README.md`, add this row to the `문서 지도` table after `콘텐츠 운영` and before `아키텍처 레퍼런스`:

```md
| [Agent Runbook](agent-runbook.md) | Agent task map | 에이전트가 작업 유형별 read order, 수정 표면, 위험 경계, 검증 명령을 빠르게 확인해야 할 때 |
```

- [ ] **Step 3: Add one sentence clarifying responsibility**

In `docs/notes/project/README.md`, immediately after the document map table, add:

```md
`Agent Runbook`은 개념 설명을 반복하지 않고, 작업 전에 어떤 원문을 읽고 어디를 수정하며 어떤 명령으로 검증할지 라우팅한다.
```

- [ ] **Step 4: Verify links resolve**

Run:

```bash
test -f docs/notes/project/agent-runbook.md
rg -n "Agent Runbook" README.md docs/notes/project/README.md
```

Expected: `test` exits 0, and `rg` prints one match from `README.md` plus at least two matches from `docs/notes/project/README.md`.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add README.md docs/notes/project/README.md
git commit -m "docs: link agent runbook from project docs"
```

Expected: commit succeeds with only `README.md` and `docs/notes/project/README.md` staged.

---

### Task 3: Sync Archive Docs Index

**Files:**
- Modify: `docs/_index/catalog.yml`
- Modify: `docs/_index/topics.yml`
- Modify: `docs/INDEX.md`

**Interfaces:**
- Consumes: `docs/notes/project/agent-runbook.md` from Task 1.
- Produces: archive metadata that keeps the new curated project note discoverable.

- [ ] **Step 1: Add catalog entry**

In `docs/_index/catalog.yml`, add this entry in the `project` group after `콘텐츠 운영` and before `아키텍처 레퍼런스`:

```yaml
- title: Agent Runbook
  path: docs/notes/project/agent-runbook.md
  topic: project
  type: workflow
  language: ko
  status: organized
  summary: 에이전트가 beyondwin 작업 유형별 read order, 수정 표면, 위험 경계, 검증 명령, public/private boundary를 빠르게 확인하는 실행 지도.
  source: docs/superpowers/specs/2026-07-01-blog-agent-docs-runbook-design.md
  updated: 2026-07-01
```

- [ ] **Step 2: Update project topic description**

In `docs/_index/topics.yml`, replace the existing `project` description with:

```yaml
  description: beyondwin Astro site, content model, publishing workflow, validation gate, memory projection, design rationale, agent task routing을 다루는 프로젝트 문서.
```

- [ ] **Step 3: Add human index row**

In `docs/INDEX.md`, add this row in the `project` group after `콘텐츠 운영` and before `아키텍처 레퍼런스`:

```md
| Agent Runbook | project | workflow | ko | organized | [docs/notes/project/agent-runbook.md](notes/project/agent-runbook.md) |
```

- [ ] **Step 4: Verify index paths**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const yaml = require('yaml');
const catalog = yaml.parse(fs.readFileSync('docs/_index/catalog.yml', 'utf8'));
const entry = catalog.find((item) => item.path === 'docs/notes/project/agent-runbook.md');
if (!entry) throw new Error('missing catalog entry');
if (!fs.existsSync(entry.path)) throw new Error(`missing path: ${entry.path}`);
if (entry.topic !== 'project') throw new Error(`wrong topic: ${entry.topic}`);
if (entry.type !== 'workflow') throw new Error(`wrong type: ${entry.type}`);
console.log('agent runbook catalog entry ok');
NODE
```

Expected:

```text
agent runbook catalog entry ok
```

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add docs/_index/catalog.yml docs/_index/topics.yml docs/INDEX.md
git commit -m "docs: index agent runbook"
```

Expected: commit succeeds with only the three index files staged.

---

### Task 4: Verify Documentation Implementation

**Files:**
- Verify: `docs/notes/project/agent-runbook.md`
- Verify: `README.md`
- Verify: `docs/notes/project/README.md`
- Verify: `docs/_index/catalog.yml`
- Verify: `docs/_index/topics.yml`
- Verify: `docs/INDEX.md`

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: final verification evidence for closeout.

- [ ] **Step 1: Scan for unresolved plan markers**

Run:

```bash
node - <<'NODE'
const { execFileSync } = require('child_process');
const patterns = [
  'T' + 'BD',
  'TO' + 'DO',
  'FIX' + 'ME',
  'place' + 'holder',
  'fill' + ' in',
  'implement' + ' later',
  'Add' + ' appropriate',
  'Write tests' + ' for the above',
  'Similar' + ' to Task',
];
const files = [
  'docs/notes/project/agent-runbook.md',
  'README.md',
  'docs/notes/project/README.md',
  'docs/_index/catalog.yml',
  'docs/_index/topics.yml',
  'docs/INDEX.md',
];
let found = false;
for (const pattern of patterns) {
  try {
    const output = execFileSync('rg', ['-n', pattern, ...files], { encoding: 'utf8' });
    if (output.trim()) {
      found = true;
      process.stdout.write(output);
    }
  } catch (error) {
    if (error.status !== 1) throw error;
  }
}
if (found) process.exit(1);
console.log('no unresolved draft markers');
NODE
```

Expected:

```text
no unresolved draft markers
```

- [ ] **Step 2: Check markdown and whitespace diff**

Run:

```bash
git diff --check
```

Expected: command exits 0 with no output.

- [ ] **Step 3: Run full repo validation**

Run:

```bash
npm run validate
```

Expected: command exits 0. The output includes `Content validation passed.`, `Article quality validation passed.`, `Memory projection valid.`, Vitest passing tests, and a successful Astro build.

- [ ] **Step 4: Confirm graph refresh is not required**

Run:

```bash
git diff --name-only HEAD~3..HEAD
```

Expected: the changed files are documentation and index metadata only. Do not run `graphify update .` unless code files under `src/`, `scripts/`, or other graphable code paths were changed during execution.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: no output after all task commits.
