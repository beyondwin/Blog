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
  origin: 'author',
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
origin: author
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
origin: author
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
