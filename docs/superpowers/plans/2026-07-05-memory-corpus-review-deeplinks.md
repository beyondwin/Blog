# Memory Corpus Review And Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe local memory candidate review/promote workflow and make article memory links open exact URL-addressable `/memory/` nodes and filters.

**Architecture:** Keep the existing private-first static projection pipeline. Add a small `scripts/memory/review.mjs` CLI for local queue reporting and explicit promotion, then add render-safe deep-link helpers in `src/lib/memoryData.ts` and URL state handling in `src/pages/memory.astro`.

**Tech Stack:** Astro, TypeScript, plain browser JavaScript, Node.js ESM scripts, YAML, gray-matter, Vitest, static `src/data/memory.public.json`.

## Global Constraints

- Public routes read only `src/data/memory.public.json`; they never import or parse `memory/**`.
- Candidate review is explicit and local; generated seed candidates are never published automatically.
- Keep the static Astro deployment model.
- Do not add login, account state, web editing UI, RAG, LLM calls, embeddings, database-backed memory, admin analytics, or automatic edge inference.
- Keep `schema_version: 1` and the existing public export gate: `confidentiality: public`, `surfaces: [memory-public]`, `review.status: accepted`, and at least one safe source.
- Review queue JSONL and generated review reports remain ignored local artifacts.
- URL state is progressive enhancement; the page must remain usable without JavaScript.
- Run `npm run validate`, `git diff --check`, and `graphify update .` after code changes.

---

## File Structure

- Create `scripts/memory/review.mjs`
  - Reads `memory/review/seed-candidates.jsonl`.
  - Reads existing `memory/thoughts/*.md`.
  - Summarizes queue state.
  - Renders `memory/review/queue.md`.
  - Promotes one selected candidate into `memory/thoughts/<slug>.md`.
  - Provides a CLI with `report` and `promote` subcommands.
- Create `scripts/memory.review.test.mjs`
  - Covers helper functions and CLI behavior.
- Modify `.gitignore`
  - Ignore generated `memory/review/*.md` reports.
- Modify `package.json`
  - Add `memory:review`.
- Modify `src/lib/memoryData.ts`
  - Add deep-link helper interfaces/functions.
  - Extend `ArticleMemoryLink` with `nodeId` and `memoryHref`.
- Modify `src/lib/memoryData.test.mjs`
  - Cover deep-link helpers and article-memory href fields.
- Modify `src/layouts/ArticleLayout.astro`
  - Render memory items as links to exact memory nodes.
- Modify `src/pages/memory.astro`
  - Initialize state from URL.
  - Update URL on selected node and filter changes.
  - Clear URL on reset.
- Modify `docs/notes/project/publishing-workflows.md`
  - Document the memory review/promote workflow.
- Modify `docs/notes/project/architecture-reference.md`
  - Document `memory:review` and URL-addressable memory.
- Modify `docs/implementation/memory-second-brain.md`
  - Update the implementation reference.

---

### Task 1: Memory Review Queue Helpers And Tests

**Files:**
- Create: `scripts/memory.review.test.mjs`
- Create: `scripts/memory/review.mjs`

**Interfaces:**
- Consumes:
  - `parseJsonLines(text: string, filePath: string): object[]` from `scripts/memory/schema.mjs`
  - `readThoughtFile(filePath: string): Promise<object>` from `scripts/memory/schema.mjs`
  - `validateThoughtRecordAsync(thought: object, options: object): Promise<string[]>` from `scripts/memory/schema.mjs`
  - `slugify(value: string): string` from `scripts/memory/schema.mjs`
- Produces:
  - `loadReviewCandidates({ root, inputPath }?: { root?: string; inputPath?: string }): Promise<object[]>`
  - `loadExistingThoughts({ root }?: { root?: string }): Promise<object[]>`
  - `summarizeReviewQueue(candidates: object[], existingThoughts: object[]): object`
  - `renderReviewQueueMarkdown(summary: object): string`
  - `candidateToPublicThought(candidate: object, options: { reviewedAt: string }): object`
  - `candidateToThoughtMarkdown(thought: object): string`
  - `promoteReviewCandidate(options: { root?: string; slug: string; reviewedAt: string; dryRun?: boolean }): Promise<{ outputPath: string; markdown: string; wrote: boolean }>`

- [ ] **Step 1: Add failing helper tests**

Create `scripts/memory.review.test.mjs` with this content:

```js
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  candidateToPublicThought,
  candidateToThoughtMarkdown,
  loadExistingThoughts,
  loadReviewCandidates,
  promoteReviewCandidate,
  renderReviewQueueMarkdown,
  summarizeReviewQueue,
} from './memory/review.mjs';

const execFileAsync = promisify(execFile);
const reviewScriptPath = fileURLToPath(new URL('./memory/review.mjs', import.meta.url));

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'memory-review-'));
  await mkdir(join(root, 'memory/review'), { recursive: true });
  await mkdir(join(root, 'memory/thoughts'), { recursive: true });
  await mkdir(join(root, 'src/content/articles'), { recursive: true });
  await writeFile(join(root, 'src/content/articles/lazycodex.mdx'), '---\ntitle: LazyCodex\n---\n');
  return root;
}

const candidate = {
  schema_version: 1,
  slug: 'agent-harnesses-are-operating-systems',
  claim_ko: '코딩 에이전트 하네스는 작업 순서를 강제한다.',
  claim_en: 'Coding-agent harnesses enforce work order.',
  memory_type: 'semantic',
  origin: 'kws',
  confidentiality: 'private',
  surfaces: [],
  topics: ['ai-workflow', 'agent-workflows'],
  theses: ['ai-workflow-quality'],
  sources: [
    {
      kind: 'article',
      path: 'src/content/articles/lazycodex.mdx',
      title: 'LazyCodex',
      date: '2026-06-24',
    },
  ],
  review: { status: 'candidate' },
  seed: {
    source: 'astro-content',
    summary: 'LazyCodex is useful as an operating layer around agent work.',
  },
};

describe('memory review queue', () => {
  it('loads review candidates from JSONL', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);

    const candidates = await loadReviewCandidates({ root });

    expect(candidates).toEqual([candidate]);
  });

  it('loads existing thought slugs from markdown files', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/thoughts/existing.md'), `---
schema_version: 1
slug: existing
claim_ko: "기존 생각"
claim_en: "Existing thought"
memory_type: semantic
origin: kws
confidentiality: public
surfaces: [memory-public]
topics: [ai-workflow]
sources:
  - kind: article
    path: src/content/articles/lazycodex.mdx
    title: "LazyCodex"
review:
  status: accepted
---

Body.
`);

    const thoughts = await loadExistingThoughts({ root });

    expect(thoughts.map((thought) => thought.slug)).toEqual(['existing']);
  });

  it('summarizes queue counts and duplicate slugs', async () => {
    const summary = summarizeReviewQueue([candidate], [{ slug: candidate.slug }]);

    expect(summary.total).toBe(1);
    expect(summary.available).toBe(0);
    expect(summary.duplicates).toEqual([candidate.slug]);
    expect(summary.byTopic).toEqual([
      ['agent-workflows', 1],
      ['ai-workflow', 1],
    ]);
    expect(summary.bySourceKind).toEqual([['article', 1]]);
  });

  it('renders a deterministic markdown report', () => {
    const summary = summarizeReviewQueue([candidate], []);
    const markdown = renderReviewQueueMarkdown(summary);

    expect(markdown).toContain('# Memory Review Queue');
    expect(markdown).toContain('Total candidates: 1');
    expect(markdown).toContain('agent-harnesses-are-operating-systems');
    expect(markdown).toContain('npm run memory:review -- promote agent-harnesses-are-operating-systems --reviewed-at 2026-07-05');
  });

  it('converts one candidate into an accepted public thought', () => {
    const thought = candidateToPublicThought(candidate, { reviewedAt: '2026-07-05' });

    expect(thought).toMatchObject({
      slug: 'agent-harnesses-are-operating-systems',
      confidentiality: 'public',
      surfaces: ['memory-public', 'article-ready'],
      review: { status: 'accepted', reviewed_at: '2026-07-05' },
    });
  });

  it('renders promoted thought markdown with quoted claims and source fields', () => {
    const thought = candidateToPublicThought(candidate, { reviewedAt: '2026-07-05' });
    const markdown = candidateToThoughtMarkdown(thought);

    expect(markdown).toContain('slug: agent-harnesses-are-operating-systems');
    expect(markdown).toContain('claim_ko: "코딩 에이전트 하네스는 작업 순서를 강제한다."');
    expect(markdown).toContain('surfaces: [memory-public, article-ready]');
    expect(markdown).toContain('reviewed_at: 2026-07-05');
    expect(markdown).toContain('LazyCodex is useful as an operating layer around agent work.');
  });

  it('promotes a selected candidate into memory/thoughts', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);

    const result = await promoteReviewCandidate({
      root,
      slug: candidate.slug,
      reviewedAt: '2026-07-05',
    });

    expect(result.wrote).toBe(true);
    expect(result.outputPath).toBe(join(root, 'memory/thoughts/agent-harnesses-are-operating-systems.md'));
    expect(await readFile(result.outputPath, 'utf8')).toContain('confidentiality: public');
  });

  it('dry-runs promotion without writing a thought file', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);

    const result = await promoteReviewCandidate({
      root,
      slug: candidate.slug,
      reviewedAt: '2026-07-05',
      dryRun: true,
    });

    expect(result.wrote).toBe(false);
    expect(result.markdown).toContain('reviewed_at: 2026-07-05');
    await expect(readFile(result.outputPath, 'utf8')).rejects.toThrow();
  });

  it('refuses duplicate slugs before writing', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);
    await writeFile(join(root, 'memory/thoughts/agent-harnesses-are-operating-systems.md'), `---
schema_version: 1
slug: agent-harnesses-are-operating-systems
claim_ko: "기존 생각"
claim_en: "Existing thought"
memory_type: semantic
origin: kws
confidentiality: public
surfaces: [memory-public]
topics: [ai-workflow]
sources:
  - kind: article
    path: src/content/articles/lazycodex.mdx
    title: "LazyCodex"
review:
  status: accepted
---

Body.
`);

    await expect(promoteReviewCandidate({
      root,
      slug: candidate.slug,
      reviewedAt: '2026-07-05',
    })).rejects.toThrow('already exists');
  });

  it('refuses invalid reviewed dates', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);

    await expect(promoteReviewCandidate({
      root,
      slug: candidate.slug,
      reviewedAt: 'July 5',
    })).rejects.toThrow('reviewed-at must use YYYY-MM-DD');
  });

  it('runs report and dry-run promote from the CLI', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'memory/review/seed-candidates.jsonl'), `${JSON.stringify(candidate)}\n`);

    const report = await execFileAsync(process.execPath, [reviewScriptPath, 'report'], { cwd: root });
    expect(report.stdout).toContain('Wrote memory review report');

    const dryRun = await execFileAsync(process.execPath, [
      reviewScriptPath,
      'promote',
      candidate.slug,
      '--reviewed-at',
      '2026-07-05',
      '--dry-run',
    ], { cwd: root });
    expect(dryRun.stdout).toContain('confidentiality: public');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- scripts/memory.review.test.mjs
```

Expected: FAIL because `scripts/memory/review.mjs` does not exist.

- [ ] **Step 3: Implement review helpers and CLI**

Create `scripts/memory/review.mjs` with this content:

```js
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  ensureDirectoryPath,
  parseJsonLines,
  readThoughtFile,
  slugify,
  validateThoughtRecordAsync,
} from './schema.mjs';

const DEFAULT_QUEUE_PATH = 'memory/review/seed-candidates.jsonl';
const DEFAULT_REPORT_PATH = 'memory/review/queue.md';
const REVIEWED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function collectMarkdownFiles(directory) {
  const files = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectMarkdownFiles(fullPath));
      } else if (extname(entry.name) === '.md') {
        files.push(fullPath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function ensureInside(root, targetPath, allowedDirectory) {
  const normalizedTarget = normalize(targetPath);
  const normalizedAllowed = normalize(join(root, allowedDirectory));
  const rel = relative(normalizedAllowed, normalizedTarget);

  if (rel.startsWith('..') || rel === '' || rel.includes('\0')) {
    throw new Error(`output path must stay inside ${allowedDirectory}`);
  }
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedEntries(counts) {
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function shellQuote(value) {
  return String(value).replace(/'/g, "'\\''");
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

function yamlFrontmatter(data) {
  return YAML.stringify(data, {
    collectionStyle: 'flow',
    lineWidth: 0,
    singleQuote: false,
  }).trimEnd();
}

export async function loadReviewCandidates({ root = process.cwd(), inputPath = DEFAULT_QUEUE_PATH } = {}) {
  const fullPath = join(root, inputPath);

  try {
    return parseJsonLines(await readFile(fullPath, 'utf8'), fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`memory review queue not found at ${inputPath}; run npm run memory:seed first`);
    }

    throw error;
  }
}

export async function loadExistingThoughts({ root = process.cwd() } = {}) {
  const files = await collectMarkdownFiles(join(root, 'memory/thoughts'));
  const thoughts = [];

  for (const file of files) {
    thoughts.push(await readThoughtFile(file));
  }

  return thoughts;
}

export function summarizeReviewQueue(candidates, existingThoughts) {
  const existingSlugs = new Set(existingThoughts.map((thought) => thought.slug).filter(Boolean));
  const byTopic = new Map();
  const bySourceKind = new Map();
  const duplicates = [];
  const rows = candidates.map((candidate) => {
    for (const topic of candidate.topics ?? []) {
      increment(byTopic, topic);
    }

    for (const source of candidate.sources ?? []) {
      increment(bySourceKind, source.kind ?? 'unknown');
    }

    const duplicate = existingSlugs.has(candidate.slug);
    if (duplicate) {
      duplicates.push(candidate.slug);
    }

    return {
      slug: candidate.slug,
      claimKo: candidate.claim_ko,
      claimEn: candidate.claim_en,
      topics: candidate.topics ?? [],
      sourceKinds: (candidate.sources ?? []).map((source) => source.kind ?? 'unknown'),
      sourceTitles: (candidate.sources ?? []).map((source) => source.title ?? source.path ?? source.url ?? 'Untitled source'),
      seedSource: candidate.seed?.source ?? 'unknown',
      summary: candidate.seed?.summary ?? '',
      duplicate,
    };
  });

  return {
    total: candidates.length,
    available: rows.filter((row) => !row.duplicate).length,
    duplicates,
    byTopic: sortedEntries(byTopic),
    bySourceKind: sortedEntries(bySourceKind),
    rows,
  };
}

export function renderReviewQueueMarkdown(summary) {
  const lines = [
    '# Memory Review Queue',
    '',
    `Total candidates: ${summary.total}`,
    `Available candidates: ${summary.available}`,
    `Duplicate slugs: ${summary.duplicates.length}`,
    '',
    '## Topics',
    '',
  ];

  if (summary.byTopic.length === 0) {
    lines.push('- No topic candidates.');
  } else {
    for (const [topic, count] of summary.byTopic) {
      lines.push(`- ${topic}: ${count}`);
    }
  }

  lines.push('', '## Source Kinds', '');
  if (summary.bySourceKind.length === 0) {
    lines.push('- No source-kind candidates.');
  } else {
    for (const [kind, count] of summary.bySourceKind) {
      lines.push(`- ${kind}: ${count}`);
    }
  }

  lines.push('', '## Candidates', '');
  lines.push('| Slug | Status | Topics | Source | Promotion command |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const row of summary.rows) {
    const command = row.duplicate
      ? 'Already promoted'
      : `npm run memory:review -- promote ${shellQuote(row.slug)} --reviewed-at 2026-07-05`;
    lines.push([
      markdownEscape(row.slug),
      row.duplicate ? 'duplicate' : 'available',
      markdownEscape(row.topics.join(', ')),
      markdownEscape(row.sourceTitles.join(', ')),
      markdownEscape(command),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function candidateToPublicThought(candidate, { reviewedAt }) {
  if (!REVIEWED_AT_PATTERN.test(reviewedAt)) {
    throw new Error('reviewed-at must use YYYY-MM-DD');
  }

  return {
    schema_version: candidate.schema_version,
    slug: candidate.slug,
    claim_ko: candidate.claim_ko,
    claim_en: candidate.claim_en,
    memory_type: candidate.memory_type,
    origin: candidate.origin,
    confidentiality: 'public',
    surfaces: ['memory-public', 'article-ready'],
    topics: candidate.topics ?? [],
    theses: candidate.theses ?? [],
    sources: candidate.sources ?? [],
    review: {
      status: 'accepted',
      reviewed_at: reviewedAt,
    },
    body: candidate.seed?.summary || `Promoted from ${candidate.sources?.[0]?.title ?? candidate.claim_ko}.`,
  };
}

export function candidateToThoughtMarkdown(thought) {
  const { body, ...frontmatter } = thought;
  return `---\n${yamlFrontmatter(frontmatter)}\n---\n\n${String(body ?? '').trim()}\n`;
}

export async function promoteReviewCandidate({
  root = process.cwd(),
  slug,
  reviewedAt,
  dryRun = false,
} = {}) {
  if (!slug) {
    throw new Error('candidate slug is required');
  }

  const candidates = await loadReviewCandidates({ root });
  const candidate = candidates.find((item) => item.slug === slug);
  if (!candidate) {
    throw new Error(`candidate not found: ${slug}`);
  }

  const existingThoughts = await loadExistingThoughts({ root });
  if (existingThoughts.some((thought) => thought.slug === slug)) {
    throw new Error(`memory thought already exists for slug: ${slug}`);
  }

  const safeSlug = slugify(slug);
  if (safeSlug !== slug) {
    throw new Error(`candidate slug must already be normalized: ${slug}`);
  }

  const thought = candidateToPublicThought(candidate, { reviewedAt });
  const validationErrors = await validateThoughtRecordAsync(thought, { root });
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('\n'));
  }

  const outputPath = join(root, 'memory/thoughts', `${slug}.md`);
  ensureInside(root, outputPath, 'memory/thoughts');
  const markdown = candidateToThoughtMarkdown(thought);

  if (!dryRun) {
    await mkdir(ensureDirectoryPath(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, { flag: 'wx' });
  }

  return { outputPath, markdown, wrote: !dryRun };
}

async function writeReport({ root = process.cwd(), outputPath = DEFAULT_REPORT_PATH } = {}) {
  const candidates = await loadReviewCandidates({ root });
  const existingThoughts = await loadExistingThoughts({ root });
  const summary = summarizeReviewQueue(candidates, existingThoughts);
  const markdown = renderReviewQueueMarkdown(summary);
  const fullOutputPath = join(root, outputPath);
  await mkdir(ensureDirectoryPath(fullOutputPath), { recursive: true });
  await writeFile(fullOutputPath, markdown);
  return { outputPath: fullOutputPath, summary };
}

function readCliArgs(argv) {
  const [command, slug, ...rest] = argv;
  const options = { command, slug, reviewedAt: '', dryRun: false };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--reviewed-at') {
      options.reviewedAt = rest[index + 1] ?? '';
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  const root = process.cwd();
  const options = readCliArgs(process.argv.slice(2));

  if (!options.command || options.command === 'report') {
    const report = await writeReport({ root });
    console.log(`Wrote memory review report to ${report.outputPath}`);
    console.log(`Memory review candidates: total=${report.summary.total} available=${report.summary.available} duplicates=${report.summary.duplicates.length}`);
    return;
  }

  if (options.command === 'promote') {
    const result = await promoteReviewCandidate({
      root,
      slug: options.slug,
      reviewedAt: options.reviewedAt,
      dryRun: options.dryRun,
    });

    if (result.wrote) {
      console.log(`Promoted memory candidate to ${result.outputPath}`);
    } else {
      console.log(result.markdown);
    }
    return;
  }

  throw new Error(`unknown memory review command: ${options.command}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- scripts/memory.review.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/memory/review.mjs scripts/memory.review.test.mjs
git commit -m "feat: add memory review queue helpers"
```

---

### Task 2: Review Queue Command Wiring And Docs

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `docs/notes/project/publishing-workflows.md`
- Modify: `docs/notes/project/architecture-reference.md`
- Modify: `docs/implementation/memory-second-brain.md`

**Interfaces:**
- Consumes:
  - `scripts/memory/review.mjs` CLI from Task 1.
- Produces:
  - `npm run memory:review -- report`
  - `npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD`

- [ ] **Step 1: Add the package script**

Modify the `scripts` object in `package.json` so the memory section includes:

```json
"memory:seed": "node scripts/memory/seed.mjs",
"memory:review": "node scripts/memory/review.mjs",
"memory:project": "node scripts/memory/project.mjs",
"memory:validate": "node scripts/memory/project.mjs --validate"
```

- [ ] **Step 2: Ignore generated review markdown reports**

Add this line under the existing memory review ignores in `.gitignore`:

```gitignore
memory/review/*.md
```

Keep `memory/review/.gitkeep` tracked.

- [ ] **Step 3: Document the workflow in publishing workflows**

In `docs/notes/project/publishing-workflows.md`, replace the current `How to Project Public Memory` section with a section that includes this command sequence:

```md
## How to Review And Project Public Memory

`/memory`는 private source를 직접 읽지 않는다. 공개 페이지는 [src/data/memory.public.json](../../../src/data/memory.public.json)만 읽는다.

1. 후보를 생성한다.

   ```bash
   npm run memory:seed
   ```

2. 후보를 읽기 쉬운 local report로 만든다.

   ```bash
   npm run memory:review -- report
   ```

   이 명령은 `memory/review/queue.md`를 만든다. 이 파일과 JSONL queue는 local review artifact이며 commit하지 않는다.

3. 공개해도 되는 후보 하나를 명시적으로 승격한다.

   ```bash
   npm run memory:review -- promote <slug> --reviewed-at 2026-07-05
   ```

   이 명령은 `memory/thoughts/<slug>.md`를 만든다. 승격된 thought는 `confidentiality: public`, `surfaces: [memory-public, article-ready]`, `review.status: accepted`를 가진다.

4. 공개 projection을 생성한다.

   ```bash
   npm run memory:project
   ```

5. JSON을 쓰지 않고 검증만 하려면 실행한다.

   ```bash
   npm run memory:validate
   ```

6. 전체 gate를 통과시킨다.

   ```bash
   npm run validate
   ```

주의:

- `memory/review/*.jsonl`과 `memory/review/*.md`는 local review artifact다.
- 승격 명령은 duplicate slug, 안전하지 않은 source path, 존재하지 않는 source path를 거부한다.
- public route는 `memory/**`를 직접 읽지 않는다.
```

- [ ] **Step 4: Document the architecture reference**

In `docs/notes/project/architecture-reference.md`, update the `Script Reference` table by inserting:

```md
| `npm run memory:review -- report` | `node scripts/memory/review.mjs report` | generated memory candidates를 읽기 쉬운 local review report로 만든다. |
| `npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD` | `node scripts/memory/review.mjs promote` | 선택한 candidate를 검증된 public thought markdown으로 승격한다. |
```

Also update the `Memory Data Loader` section to mention:

```md
- `createMemoryNodeHref(nodeId)`: graph node id를 `/memory/?node=...` 링크로 만든다.
- `createMemoryFilterHref(filters)`: topic/source/lens/search filter를 `/memory/` query string으로 만든다.
- `parseMemoryDeepLinkParams(params, model)`: URLSearchParams에서 현재 graph model에 존재하는 filter만 복원한다.
```

- [ ] **Step 5: Update the implementation reference**

In `docs/implementation/memory-second-brain.md`, add a `Review Workflow` subsection after `Seed Workflow`:

````md
## Review Workflow

Run:

```bash
npm run memory:review -- report
```

This reads `memory/review/seed-candidates.jsonl` and writes the ignored local
report `memory/review/queue.md`.

Promote one reviewed candidate:

```bash
npm run memory:review -- promote <slug> --reviewed-at YYYY-MM-DD
```

Promotion writes `memory/thoughts/<slug>.md`, validates source paths, and refuses
duplicate slugs. The command is explicit because seed candidates remain private
until reviewed.
````

- [ ] **Step 6: Verify command wiring**

Run:

```bash
npm run memory:seed
npm run memory:review -- report
npm test -- scripts/memory.review.test.mjs
git status --ignored --short memory/review | sed -n '1,20p'
```

Expected:

```text
Wrote 46 memory seed candidates ...
Wrote memory review report ...
Test Files  1 passed
!! memory/review/queue.md
!! memory/review/seed-candidates.jsonl
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json docs/notes/project/publishing-workflows.md docs/notes/project/architecture-reference.md docs/implementation/memory-second-brain.md
git commit -m "docs: document memory review workflow"
```

---

### Task 3: Deep Link Helpers And Article Memory Link Model

**Files:**
- Modify: `src/lib/memoryData.ts`
- Modify: `src/lib/memoryData.test.mjs`

**Interfaces:**
- Consumes:
  - `MemoryGraphModel`
  - `MemoryGraphFilterState`
  - `findArticleMemoryLinks(memory, articlePath, tags)`
- Produces:
  - `interface MemoryDeepLinkState extends MemoryGraphFilterState { selectedNodeId?: string }`
  - `function createMemoryNodeHref(nodeId: string): string`
  - `function createMemoryFilterHref(filters: MemoryDeepLinkState): string`
  - `function parseMemoryDeepLinkParams(params: URLSearchParams, model: MemoryGraphModel): MemoryDeepLinkState`
  - `ArticleMemoryLink.nodeId`
  - `ArticleMemoryLink.memoryHref`

- [ ] **Step 1: Add failing tests for deep-link helpers**

In `src/lib/memoryData.test.mjs`, add these imports:

```js
  createMemoryFilterHref,
  createMemoryNodeHref,
  parseMemoryDeepLinkParams,
```

Append these tests to the existing `describe('memory data helpers', () => { ... })` block:

```js
  it('creates stable memory node and filter hrefs', () => {
    expect(createMemoryNodeHref('thought:routing-problem')).toBe('/memory/?node=thought%3Arouting-problem');
    expect(createMemoryFilterHref({
      activeLens: 'sources',
      selectedNodeId: 'source:article-source',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
      query: 'routing',
    })).toBe('/memory/?node=source%3Aarticle-source&q=routing&lens=sources&topic=topic%3Aai-workflow&source=source%3Aarticle-source&type=semantic&edge=supports');
  });

  it('parses memory deep-link params and ignores unknown ids', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const params = new URLSearchParams([
      ['node', 'thought:routing-problem'],
      ['q', 'routing'],
      ['lens', 'sources'],
      ['topic', 'topic:ai-workflow'],
      ['topic', 'topic:missing'],
      ['source', 'source:article-source'],
      ['type', 'semantic'],
      ['type', 'missing'],
      ['edge', 'supports'],
      ['edge', 'missing'],
    ]);

    expect(parseMemoryDeepLinkParams(params, graph)).toEqual({
      selectedNodeId: 'thought:routing-problem',
      query: 'routing',
      activeLens: 'sources',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    });
  });

  it('adds node ids and memory hrefs to article memory links', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      [],
    );

    expect(result.linked[0]).toMatchObject({
      slug: 'routing-problem',
      nodeId: 'thought:routing-problem',
      memoryHref: '/memory/?node=thought%3Arouting-problem',
    });
  });
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: FAIL because the deep-link helpers are not exported.

- [ ] **Step 3: Add helper types and functions**

In `src/lib/memoryData.ts`, add this type after `MemoryGraphFilterState`:

```ts
export interface MemoryDeepLinkState extends MemoryGraphFilterState {
  selectedNodeId?: string;
}
```

Then add these helpers after `filterMemoryGraphModel`:

```ts
function appendParams(params: URLSearchParams, key: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    if (value) {
      params.append(key, value);
    }
  }
}

export function createMemoryFilterHref(filters: MemoryDeepLinkState): string {
  const params = new URLSearchParams();

  if (filters.selectedNodeId) {
    params.set('node', filters.selectedNodeId);
  }

  if (filters.query?.trim()) {
    params.set('q', filters.query.trim());
  }

  if (filters.activeLens && filters.activeLens !== 'all') {
    params.set('lens', filters.activeLens);
  }

  appendParams(params, 'topic', filters.activeTopicIds);
  appendParams(params, 'source', filters.activeSourceIds);
  appendParams(params, 'type', filters.activeMemoryTypes);
  appendParams(params, 'edge', filters.activeEdgeTypes);

  const query = params.toString();
  return query ? `/memory/?${query}` : '/memory/';
}

export function createMemoryNodeHref(nodeId: string): string {
  return createMemoryFilterHref({ selectedNodeId: nodeId });
}

function allowedParamValues(values: string[], allowed: Set<string>): string[] {
  return values.filter((value) => allowed.has(value));
}

export function parseMemoryDeepLinkParams(
  params: URLSearchParams,
  model: MemoryGraphModel,
): MemoryDeepLinkState {
  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const lensIds = new Set(model.facets.lenses.map((lens) => lens.id));
  const topicIds = new Set(model.facets.topics.map((topic) => topic.id));
  const sourceIds = new Set(model.facets.sources.map((source) => source.id));
  const memoryTypes = new Set(model.facets.memoryTypes.map((type) => type.id));
  const edgeTypes = new Set(model.facets.edgeTypes.map((type) => type.id));
  const selectedNodeId = params.get('node') ?? undefined;
  const activeLens = params.get('lens') ?? undefined;
  const query = params.get('q')?.trim() ?? '';
  const state: MemoryDeepLinkState = {};

  if (selectedNodeId && nodeIds.has(selectedNodeId)) {
    state.selectedNodeId = selectedNodeId;
  }

  if (query) {
    state.query = query;
  }

  if (activeLens && lensIds.has(activeLens)) {
    state.activeLens = activeLens;
  }

  const activeTopicIds = allowedParamValues(params.getAll('topic'), topicIds);
  const activeSourceIds = allowedParamValues(params.getAll('source'), sourceIds);
  const activeMemoryTypes = allowedParamValues(params.getAll('type'), memoryTypes);
  const activeEdgeTypes = allowedParamValues(params.getAll('edge'), edgeTypes);

  if (activeTopicIds.length > 0) {
    state.activeTopicIds = activeTopicIds;
  }
  if (activeSourceIds.length > 0) {
    state.activeSourceIds = activeSourceIds;
  }
  if (activeMemoryTypes.length > 0) {
    state.activeMemoryTypes = activeMemoryTypes;
  }
  if (activeEdgeTypes.length > 0) {
    state.activeEdgeTypes = activeEdgeTypes;
  }

  return state;
}
```

- [ ] **Step 4: Extend `ArticleMemoryLink`**

Find the `ArticleMemoryLink` interface in `src/lib/memoryData.ts` and add:

```ts
  nodeId: string;
  memoryHref: string;
```

In the mapper that creates article memory links, add:

```ts
    const nodeId = prefixedThoughtId(thought.slug);
```

Then include these fields in the returned object:

```ts
      nodeId,
      memoryHref: createMemoryNodeHref(nodeId),
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/lib/memoryData.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memoryData.ts src/lib/memoryData.test.mjs
git commit -m "feat: add memory deep link helpers"
```

---

### Task 4: Article Memory Cards Link To Exact Nodes

**Files:**
- Modify: `src/layouts/ArticleLayout.astro`
- Test: `npm run build`

**Interfaces:**
- Consumes:
  - `ArticleMemoryLinks` with `nodeId` and `memoryHref` from Task 3.
- Produces:
  - Article memory item anchors that open exact `/memory/?node=...` URLs.

- [ ] **Step 1: Compute the header href**

In `src/layouts/ArticleLayout.astro`, after `hasRelatedMemory`, add:

```ts
const memoryHref = relatedMemory?.linked[0]?.memoryHref ?? relatedMemory?.related[0]?.memoryHref ?? '/memory/';
```

- [ ] **Step 2: Update the memory header link**

Replace:

```astro
<a href="/memory/">Memory 열기</a>
```

with:

```astro
<a href={memoryHref}>Memory 열기</a>
```

- [ ] **Step 3: Render linked memory cards as anchors**

In both the `relatedMemory.linked.map` and `relatedMemory.related.map` blocks, replace:

```astro
<article class="article-memory__item">
```

with:

```astro
<a class="article-memory__item" href={thought.memoryHref}>
```

Then replace each matching closing tag:

```astro
</article>
```

with:

```astro
</a>
```

- [ ] **Step 4: Verify Astro build**

Run:

```bash
npm run build
```

Expected: Astro check and build pass. Confirm the generated article pages include memory links.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/ArticleLayout.astro
git commit -m "feat: link article memory cards to nodes"
```

---

### Task 5: Memory Workbench URL State

**Files:**
- Modify: `src/pages/memory.astro`
- Test: `npm run build`

**Interfaces:**
- Consumes:
  - Embedded `memoryPayload.graph.nodes`
  - Embedded `memoryPayload.graph.facets`
  - Existing browser state fields: `query`, `activeLens`, `activeTopicIds`, `activeSourceIds`, `activeMemoryTypes`, `activeEdgeTypes`, `selectedNodeId`
- Produces:
  - URL-initialized graph state.
  - URL updates after filter/selection changes.
  - Reset clears query params.

- [ ] **Step 1: Add client-side URL parsing helpers**

Inside the inline script in `src/pages/memory.astro`, after `const edgeById = new Map(...)`, add:

```js
      const validNodeIds = new Set(payload.graph.nodes.map((node) => node.id));
      const validLensIds = new Set((payload.graph.facets?.lenses ?? []).map((lens) => lens.id));
      const validTopicIds = new Set((payload.graph.facets?.topics ?? []).map((topic) => topic.id));
      const validSourceIds = new Set((payload.graph.facets?.sources ?? []).map((source) => source.id));
      const validMemoryTypes = new Set((payload.graph.facets?.memoryTypes ?? []).map((type) => type.id));
      const validEdgeTypes = new Set((payload.graph.facets?.edgeTypes ?? []).map((type) => type.id));

      function allowedValues(params, key, allowed) {
        return params.getAll(key).filter((value) => allowed.has(value));
      }

      function readUrlState() {
        if (!window.location) {
          return {};
        }

        const params = new URLSearchParams(window.location.search);
        const selectedNodeId = params.get('node') ?? '';
        const activeLens = params.get('lens') ?? '';
        const urlState = {};

        if (selectedNodeId && validNodeIds.has(selectedNodeId)) {
          urlState.selectedNodeId = selectedNodeId;
        }

        const query = (params.get('q') ?? '').trim();
        if (query) {
          urlState.query = query;
        }

        if (activeLens && validLensIds.has(activeLens)) {
          urlState.activeLens = activeLens;
        }

        urlState.activeTopicIds = allowedValues(params, 'topic', validTopicIds);
        urlState.activeSourceIds = allowedValues(params, 'source', validSourceIds);
        urlState.activeMemoryTypes = allowedValues(params, 'type', validMemoryTypes);
        urlState.activeEdgeTypes = allowedValues(params, 'edge', validEdgeTypes);

        return urlState;
      }

      function writeUrlState() {
        if (!window.history || !window.location) {
          return;
        }

        const params = new URLSearchParams();
        if (state.selectedNodeId) {
          params.set('node', state.selectedNodeId);
        }
        if (state.query) {
          params.set('q', state.query);
        }
        if (state.activeLens && state.activeLens !== 'all') {
          params.set('lens', state.activeLens);
        }
        state.activeTopicIds.forEach((value) => params.append('topic', value));
        state.activeSourceIds.forEach((value) => params.append('source', value));
        state.activeMemoryTypes.forEach((value) => params.append('type', value));
        state.activeEdgeTypes.forEach((value) => params.append('edge', value));

        const nextUrl = params.toString()
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState(null, '', nextUrl);
      }
```

- [ ] **Step 2: Initialize state from URL**

Immediately after the existing `const state = { ... };` object is declared, add:

```js
      const urlState = readUrlState();
      if (urlState.query !== undefined) {
        state.query = urlState.query;
      }
      if (urlState.activeLens) {
        state.activeLens = urlState.activeLens;
      }
      if (urlState.selectedNodeId) {
        state.selectedNodeId = urlState.selectedNodeId;
      }
      for (const value of urlState.activeTopicIds ?? []) {
        state.activeTopicIds.add(value);
      }
      for (const value of urlState.activeSourceIds ?? []) {
        state.activeSourceIds.add(value);
      }
      for (const value of urlState.activeMemoryTypes ?? []) {
        state.activeMemoryTypes.add(value);
      }
      for (const value of urlState.activeEdgeTypes ?? []) {
        state.activeEdgeTypes.add(value);
      }
      if (search && state.query) {
        search.value = state.query;
      }
```

If the current script queries DOM elements after the state block, move only the `if (search && state.query)` line to after `const search = root.querySelector('[data-memory-search]');`.

- [ ] **Step 3: Update URL after state changes**

At the end of the existing `render()` function, after UI visibility and detail updates, add:

```js
        writeUrlState();
```

If `render()` currently runs before event handlers are attached, this is fine. It will normalize unknown URL params away.

- [ ] **Step 4: Ensure reset clears URL state**

Find the reset handler that clears sets and state. Ensure it sets:

```js
          state.query = '';
          state.activeLens = 'all';
          state.selectedNodeId = payload.graph.selectedFallback;
          state.activeTopicIds.clear();
          state.activeSourceIds.clear();
          state.activeMemoryTypes.clear();
          state.activeEdgeTypes.clear();
```

Then calls `render()`.

- [ ] **Step 5: Verify build and URL smoke manually**

Run:

```bash
npm run build
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:4321/memory/?node=thought%3Aagent-harnesses-are-operating-systems
http://127.0.0.1:4321/memory/?topic=topic%3Aai-workflow
```

Expected:

- The selected node drawer shows the requested thought for the node URL.
- The topic chip is active for the topic URL.
- Clicking Reset changes the URL back to `/memory/`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/memory.astro
git commit -m "feat: persist memory workbench URL state"
```

---

### Task 6: End-To-End Verification And Closeout

**Files:**
- Verify only unless previous tasks expose a docs typo.

**Interfaces:**
- Consumes:
  - All prior tasks.
- Produces:
  - Passing full validation.
  - Fresh graphify command evidence after code changes.

- [ ] **Step 1: Run focused memory tests**

Run:

```bash
npm test -- scripts/memory.review.test.mjs src/lib/memoryData.test.mjs
```

Expected: both test files pass.

- [ ] **Step 2: Run queue smoke**

Run:

```bash
npm run memory:seed
npm run memory:review -- report
```

Expected:

```text
Wrote 46 memory seed candidates ...
Wrote memory review report ...
```

- [ ] **Step 3: Confirm local review outputs are ignored**

Run:

```bash
git status --ignored --short memory/review | sed -n '1,20p'
```

Expected:

```text
!! memory/review/queue.md
!! memory/review/seed-candidates.jsonl
```

- [ ] **Step 4: Run full validation**

Run:

```bash
npm run validate
```

Expected: content validation, article quality, memory validation, Vitest, Astro check, and Astro build pass.

- [ ] **Step 5: Refresh graphify after code changes**

Run:

```bash
graphify update .
```

Expected: graph update completes. `graphify-out/` remains ignored.

- [ ] **Step 6: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Commit final docs fixes if any**

If Step 4 or Step 6 required doc wording fixes, commit them:

```bash
git add docs/notes/project/publishing-workflows.md docs/notes/project/architecture-reference.md docs/implementation/memory-second-brain.md
git commit -m "docs: clarify memory review and deep links"
```

If no files changed, skip this commit.

## Self-Review

- Spec coverage: Tasks 1-2 cover the review queue, report, promotion, ignored artifacts, package wiring, and docs. Tasks 3-5 cover deep-link helpers, article card links, and `/memory/` URL state. Task 6 covers validation, graphify freshness, and ignored local outputs.
- Placeholder scan: The plan contains concrete file paths, commands, expected outputs, interfaces, and code blocks. It does not use unresolved placeholders.
- Type consistency: `MemoryDeepLinkState`, `createMemoryNodeHref`, `createMemoryFilterHref`, `parseMemoryDeepLinkParams`, `nodeId`, and `memoryHref` are introduced before consumers use them.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-memory-corpus-review-deeplinks.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
