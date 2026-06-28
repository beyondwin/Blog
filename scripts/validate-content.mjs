import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const contentRoot = join(root, 'src', 'content');

const requiredFields = {
  analysis: [
    'title',
    'description',
    'createdAt',
    'updatedAt',
    'tags',
    'status',
    'sourceUrl',
    'sourceTitle',
    'comment',
    'format',
  ],
  articles: ['title', 'description', 'createdAt', 'updatedAt', 'tags', 'status'],
  ideas: ['title', 'description', 'createdAt', 'updatedAt', 'tags', 'status', 'maturity'],
  reviews: [
    'title',
    'description',
    'createdAt',
    'updatedAt',
    'tags',
    'status',
    'itemType',
    'itemTitle',
  ],
  travel: ['title', 'description', 'createdAt', 'updatedAt', 'tags', 'status', 'location'],
};

const allowedFormats = new Set(['research-report', 'essay', 'visual-page']);
const allowedMaturities = new Set(['seed', 'sketch', 'proposal']);
const allowedStatuses = new Set(['review', 'published', 'archived']);

async function collectMdxFiles(directory) {
  const files = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        files.push(...await collectMdxFiles(fullPath));
      } else if (extname(entry.name) === '.mdx') {
        files.push(fullPath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

function validateRequiredFields(collection, filePath, data) {
  const errors = [];

  for (const field of requiredFields[collection]) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`${filePath}: missing required frontmatter field "${field}"`);
    }
  }

  return errors;
}

function validateAnalysis(filePath, data) {
  const errors = [];

  errors.push(...validateSourceUrl(filePath, data));

  if (data.format && !allowedFormats.has(data.format)) {
    errors.push(`${filePath}: format must be research-report, essay, or visual-page`);
  }

  return errors;
}

function validateSourceUrl(filePath, data) {
  const errors = [];

  for (const field of ['sourceUrl', 'coverImage']) {
    if (!data[field]) {
      continue;
    }

    try {
      new URL(data[field]);
    } catch {
      errors.push(`${filePath}: ${field} must be a valid URL`);
    }
  }

  return errors;
}

function validateIdeas(filePath, data) {
  const errors = [];

  if (data.maturity && !allowedMaturities.has(data.maturity)) {
    errors.push(`${filePath}: maturity must be seed, sketch, or proposal`);
  }

  return errors;
}

function validateShared(filePath, data) {
  const errors = [];

  if (data.status && !allowedStatuses.has(data.status)) {
    errors.push(`${filePath}: status must be review, published, or archived`);
  }

  if (!Array.isArray(data.tags)) {
    errors.push(`${filePath}: tags must be an array`);
  }

  return errors;
}

function validateQuoteLength(filePath, content) {
  const errors = [];
  const quoteLines = content.split(/\r?\n/).filter((line) => line.trim().startsWith('>'));

  quoteLines.forEach((line, index) => {
    const words = line
      .replace(/^>\s?/, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length > 25) {
      errors.push(`${filePath}: blockquote ${index + 1} has ${words.length} words; keep direct quotes at or below 25 words`);
    }
  });

  return errors;
}

const errors = [];

for (const collection of Object.keys(requiredFields)) {
  const directory = join(contentRoot, collection);
  const files = await collectMdxFiles(directory);

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf8');
    const parsed = matter(raw);
    errors.push(...validateRequiredFields(collection, filePath, parsed.data));
    errors.push(...validateShared(filePath, parsed.data));
    errors.push(...validateQuoteLength(filePath, parsed.content));

    if (collection === 'analysis') {
      errors.push(...validateAnalysis(filePath, parsed.data));
    }

    if (collection === 'reviews') {
      errors.push(...validateSourceUrl(filePath, parsed.data));
    }

    if (collection === 'ideas') {
      errors.push(...validateIdeas(filePath, parsed.data));
    }
  }
}

if (errors.length > 0) {
  console.error('Content validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Content validation passed.');
