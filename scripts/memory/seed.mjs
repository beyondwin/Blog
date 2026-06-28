import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import YAML from 'yaml';
import { ensureDirectoryPath, slugify } from './schema.mjs';

const CONTENT_COLLECTIONS = ['analysis', 'articles', 'reviews'];
const CONTENT_SOURCE_KINDS = {
  analysis: 'analysis',
  articles: 'article',
  reviews: 'review',
};

async function readFileIfExists(filePath, fallback) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function collectMdxFiles(directory) {
  const files = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectMdxFiles(fullPath));
      } else if (extname(entry.name) === '.mdx' || extname(entry.name) === '.md') {
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

function uniqueSlug(baseSlug, usedSlugs) {
  const cleanBase = baseSlug || 'memory-thought';
  let candidate = cleanBase;
  let index = 2;

  while (usedSlugs.has(candidate)) {
    candidate = `${cleanBase}-${index}`;
    index += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

function slugBaseFromTitle(title, fallbackPath) {
  const titleSlug = slugify(title.replace(/설계 요약$/, '').replace(/상세 분석$/, '').trim());
  if (titleSlug.length > 2) {
    return titleSlug;
  }

  if (fallbackPath) {
    return slugify(basename(fallbackPath, extname(fallbackPath))) || titleSlug;
  }

  return titleSlug;
}

function candidateFromCatalogEntry(entry, usedSlugs) {
  const title = String(entry.title || '').trim();
  const path = String(entry.path || '').trim();
  const topic = String(entry.topic || 'inbox').trim();
  const type = String(entry.type || 'document').trim();
  const updated = entry.updated ? String(entry.updated) : undefined;
  const slugBase = slugBaseFromTitle(title, path);

  return {
    schema_version: 1,
    slug: uniqueSlug(slugBase, usedSlugs),
    claim_ko: title,
    claim_en: title,
    memory_type: 'semantic',
    origin: 'kws',
    confidentiality: 'private',
    surfaces: [],
    topics: [topic],
    theses: [],
    sources: [
      {
        kind: type,
        path,
        title,
        ...(updated ? { date: updated } : {}),
      },
    ],
    review: { status: 'candidate' },
    seed: {
      source: 'docs-catalog',
      summary: entry.summary || '',
    },
  };
}

function candidateFromContentFile(root, collection, filePath, parsed, usedSlugs) {
  const relativePath = relative(root, filePath);
  const title = String(parsed.data.title || '').trim();
  const description = String(parsed.data.description || '').trim();
  const updated = parsed.data.updatedAt ? String(parsed.data.updatedAt).slice(0, 10) : undefined;
  const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags : [];
  const slugBase = slugBaseFromTitle(title, filePath);

  return {
    schema_version: 1,
    slug: uniqueSlug(slugBase, usedSlugs),
    claim_ko: title,
    claim_en: title,
    memory_type: 'semantic',
    origin: 'kws',
    confidentiality: 'private',
    surfaces: [],
    topics: [...tags, collection],
    theses: [],
    sources: [
      {
        kind: CONTENT_SOURCE_KINDS[collection] || collection,
        path: relativePath,
        title,
        ...(updated ? { date: updated } : {}),
      },
    ],
    review: { status: 'candidate' },
    seed: {
      source: 'astro-content',
      collection,
      summary: description,
    },
  };
}

export async function buildSeedCandidates({ root = process.cwd() } = {}) {
  const usedSlugs = new Set();
  const candidates = [];
  const catalogPath = join(root, 'docs/_index/catalog.yml');
  const catalogText = await readFileIfExists(catalogPath, '[]\n');
  const catalog = YAML.parse(catalogText) || [];

  for (const entry of catalog) {
    if (entry?.title && entry?.path) {
      candidates.push(candidateFromCatalogEntry(entry, usedSlugs));
    }
  }

  for (const collection of CONTENT_COLLECTIONS) {
    const files = await collectMdxFiles(join(root, 'src/content', collection));

    for (const filePath of files) {
      const raw = await readFile(filePath, 'utf8');
      const parsed = matter(raw);
      if (parsed.data?.draft || parsed.data?.status !== 'published' || !parsed.data?.title) {
        continue;
      }

      candidates.push(candidateFromContentFile(root, collection, filePath, parsed, usedSlugs));
    }
  }

  return candidates;
}

export async function writeSeedCandidates(candidates, outputPath) {
  await mkdir(ensureDirectoryPath(outputPath), { recursive: true });
  const lines = candidates.map((candidate) => JSON.stringify(candidate)).join('\n');
  await writeFile(outputPath, lines ? `${lines}\n` : '');
}

async function main() {
  const root = process.cwd();
  const outputPath = join(root, 'memory/review/seed-candidates.jsonl');
  const candidates = await buildSeedCandidates({ root });
  await writeSeedCandidates(candidates, outputPath);
  console.log(`Wrote ${candidates.length} memory seed candidates to ${outputPath}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
