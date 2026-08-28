import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, relative } from 'node:path';
import matter from 'gray-matter';

if (process.env.BEYONDWIN_CONTENT_VALIDATOR_TSX !== '1') {
  const tsxLoaderPath = fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', tsxLoaderPath, process.argv[1], ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, BEYONDWIN_CONTENT_VALIDATOR_TSX: '1' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const { parseSourceRecord } = await import('@beyondwin/content');
const { sourceCollections } = await import('@beyondwin/content/schemas');

const root = process.cwd();
const contentRoot = join(root, 'src', 'content');

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
    if (error.code !== 'ENOENT') throw error;
  }

  return files;
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

function schemaErrors(filePath, error) {
  if (!Array.isArray(error?.issues)) return [`${filePath}: ${error instanceof Error ? error.message : String(error)}`];
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? ` ${issue.path.join('.')}` : '';
    return `${filePath}:${path} ${issue.message}`;
  });
}

const errors = [];

for (const collection of sourceCollections) {
  const directory = join(contentRoot, collection);
  const files = await collectMdxFiles(directory);

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf8');
    const parsed = matter(raw);
    const id = relative(directory, filePath).replace(/\.mdx$/, '');

    if (id.includes('/')) {
      errors.push(`${filePath}: nested content IDs are not supported by the public route contract`);
    } else {
      try {
        parseSourceRecord({ ...parsed.data, collection, id, body: parsed.content });
      } catch (error) {
        errors.push(...schemaErrors(filePath, error));
      }
    }
    errors.push(...validateQuoteLength(filePath, parsed.content));
  }
}

if (errors.length > 0) {
  console.error('Content validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Content validation passed.');
