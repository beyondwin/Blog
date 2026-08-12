import { lstat, mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const emptyMediaManifest = 'version: 1\nitems: []\n';

const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

const kindConfig = {
  article: {
    collection: 'articles',
    extra: 'recordKind: "technical-note"\nevidenceState: "personal"',
  },
  review: {
    collection: 'reviews',
    extra: 'itemType: "book"',
  },
  scene: {
    collection: 'travel',
    extra: ({ location }) => `location: ${yamlString(location)}\nprivacyReviewed: false`,
  },
  idea: {
    collection: 'ideas',
    extra: 'maturity: "sketch"',
  },
};

function yamlString(value) {
  return JSON.stringify(value);
}

export function validateContentSlug(slug) {
  if (typeof slug !== 'string' || !slugPattern.test(slug)) {
    throw new Error('slug must match /^[a-z0-9][a-z0-9-]*$/');
  }
  return slug;
}

export function validateContentDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must use YYYY-MM-DD');
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('date must be a valid calendar date');
  }

  return date;
}

function validateIsbn13(isbn) {
  if (isbn === undefined || isbn === '') return undefined;
  if (typeof isbn !== 'string' || !/^97[89]\d{10}$/.test(isbn)) {
    throw new Error('ISBN must be a 13-digit ISBN-13 value');
  }

  const digits = [...isbn].map(Number);
  const sum = digits.slice(0, 12).reduce(
    (total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  const checkDigit = (10 - (sum % 10)) % 10;
  if (digits[12] !== checkDigit) {
    throw new Error('ISBN checksum is invalid');
  }

  return isbn;
}

function today() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object') throw new Error('content input is required');

  const config = kindConfig[input.kind];
  if (!config) throw new Error(`kind must be one of: ${Object.keys(kindConfig).join(', ')}`);

  const slug = validateContentSlug(input.slug);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('title is required');

  const requestedDate = typeof input.date === 'string' ? input.date.trim() : input.date;
  const date = validateContentDate(requestedDate || today());
  const isbn = validateIsbn13(input.isbn);
  const location = typeof input.location === 'string' ? input.location.trim() : '';
  if (input.kind === 'scene' && !location) throw new Error('location is required for scene');

  return {
    kind: input.kind,
    collection: config.collection,
    slug,
    title,
    date,
    isbn,
    location,
    extra: typeof config.extra === 'function' ? config.extra({ location }) : config.extra,
  };
}

function buildContentMarkdown(input) {
  const reviewFields = input.kind === 'review'
    ? `\nitemTitle: ${yamlString(input.title)}${input.isbn ? `\nisbn13: ${yamlString(input.isbn)}` : ''}`
    : '';

  return `---
title: ${yamlString(input.title)}
description: ${yamlString(`${input.title} draft`)}
createdAt: "${input.date}"
updatedAt: "${input.date}"
tags: []
status: "review"
draft: true
${input.extra}${reviewFields}
---

TODO: Write this ${input.kind}.
`;
}

async function ensureDirectory(directory, root, createdDirectories) {
  const rootPath = resolve(root);
  const targetPath = resolve(directory);
  const pathFromRoot = relative(rootPath, targetPath);
  if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
    if (pathFromRoot === '') return;
    throw new Error(`refusing to create directory outside root: ${targetPath}`);
  }

  let current = rootPath;
  for (const segment of pathFromRoot.split('/')) {
    current = join(current, segment);
    try {
      await mkdir(current);
      createdDirectories.push(current);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await lstat(current);
      if (existing.isSymbolicLink()) throw new Error(`${relative(rootPath, current)} is a symbolic link`);
      if (!existing.isDirectory()) throw new Error(`${relative(rootPath, current)} already exists and is not a directory`);
    }
  }
}

async function rollback(createdFiles, createdDirectories) {
  for (const file of [...createdFiles].reverse()) {
    try {
      await unlink(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  for (const directory of [...createdDirectories].reverse()) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error;
    }
  }
}

export async function writeFilesExclusively(files, options = {}) {
  if (options.dryRun) return;

  const root = resolve(options.root ?? process.cwd());
  const createdFiles = [];
  const createdDirectories = [];

  try {
    for (const file of files) {
      const absolutePath = resolve(root, file.path);
      const pathFromRoot = relative(root, absolutePath);
      if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
        throw new Error(`refusing to write outside root: ${file.path}`);
      }
      await ensureDirectory(dirname(absolutePath), root, createdDirectories);
      await writeFile(absolutePath, file.content, { flag: 'wx' });
      createdFiles.push(absolutePath);
    }
  } catch (error) {
    try {
      await rollback(createdFiles, createdDirectories);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'content creation failed and rollback was incomplete');
    }

    if (error?.code === 'EEXIST') {
      throw new Error(`${relative(root, error.path)} already exists`, { cause: error });
    }
    throw error;
  }
}

export async function createContentEntry(input, options = {}) {
  const normalized = normalizeInput(input);
  const contentPath = `src/content/${normalized.collection}/${normalized.slug}.mdx`;
  const manifestPath = `src/assets/content/${normalized.collection}/${normalized.slug}/media.yml`;
  const files = [
    { path: contentPath, content: buildContentMarkdown(normalized) },
    { path: manifestPath, content: emptyMediaManifest },
  ];

  await writeFilesExclusively(files, options);

  return {
    kind: normalized.kind,
    slug: normalized.slug,
    collection: normalized.collection,
    contentPath,
    manifestPath,
    files,
  };
}

function parseArgs(argv) {
  const args = { kind: '', slug: '', title: '', isbn: '', date: '', location: '', dryRun: false };
  const valueFlags = new Map([
    ['--slug', 'slug'],
    ['--title', 'title'],
    ['--isbn', 'isbn'],
    ['--date', 'date'],
    ['--location', 'location'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (!value && arg !== '--date') throw new Error(`${arg} requires a value`);
      args[valueFlags.get(arg)] = value;
      index += 1;
    } else if (!arg.startsWith('--') && !args.kind) {
      args.kind = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!args.kind || !args.slug || !args.title) {
    throw new Error('Usage: npm run content:new -- <article|review|scene|idea> --slug <slug> --title <title> [--isbn <isbn13>] [--date <YYYY-MM-DD>] [--location <location>] [--dry-run]');
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await createContentEntry(args, { dryRun: args.dryRun });

  console.log(`Content draft: ${result.contentPath}`);
  console.log(`Media manifest: ${result.manifestPath}`);

  if (args.dryRun) {
    for (const file of result.files) {
      console.log(`\n--- ${file.path} ---\n${file.content}`);
    }
  }
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
