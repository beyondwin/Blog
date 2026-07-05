import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function quoted(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function inlineArray(values = []) {
  return `[${values.map((value) => String(value)).join(', ')}]`;
}

function renderSource(source) {
  const lines = [
    '  - kind: ' + source.kind,
    '    path: ' + source.path,
    '    title: ' + quoted(source.title),
  ];

  if (source.date) {
    lines.push('    date: ' + source.date);
  }

  if (source.url) {
    lines.push('    url: ' + quoted(source.url));
  }

  return lines.join('\n');
}

function yamlFrontmatter(thought) {
  return [
    'schema_version: ' + thought.schema_version,
    'slug: ' + thought.slug,
    'claim_ko: ' + quoted(thought.claim_ko),
    'claim_en: ' + quoted(thought.claim_en),
    'memory_type: ' + thought.memory_type,
    'origin: ' + thought.origin,
    'confidentiality: ' + thought.confidentiality,
    'surfaces: ' + inlineArray(thought.surfaces),
    'topics: ' + inlineArray(thought.topics),
    'theses: ' + inlineArray(thought.theses),
    'sources:',
    ...(thought.sources ?? []).map(renderSource),
    'review:',
    '  status: ' + thought.review.status,
    '  reviewed_at: ' + thought.review.reviewed_at,
  ].join('\n');
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
