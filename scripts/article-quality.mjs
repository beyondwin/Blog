import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const requiredHeadings = [
  '## 먼저 알아야 할 개념',
  '## 실제 구조',
  '## 핵심 기능',
  '## 좋은 점',
  '## 조심해야 할 점',
  '## 언제 쓰면 좋은가',
  '## 주니어 개발자가 배울 점',
  '## 내 결론',
  '## 확인한 자료',
];

const placeholderMarkers = [`TB${'D'}`, `TO${'DO'}`, `FIX${'ME'}`, `??${'?'}`];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectMdxFiles(directory) {
  const files = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        files.push(...await collectMdxFiles(fullPath));
      } else if (['.md', '.mdx'].includes(extname(entry.name))) {
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

function hasSourceGroundedTag(data) {
  return Array.isArray(data.tags) && data.tags.includes('source-grounded');
}

function duplicateHeadings(content) {
  const seen = new Set();
  const duplicates = new Set();

  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('## ')) {
      continue;
    }

    const heading = line.trim();

    if (seen.has(heading)) {
      duplicates.add(heading);
    }

    seen.add(heading);
  }

  return [...duplicates];
}

function firstParagraph(content) {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith('#') && !block.startsWith('---'));
}

export function validateArticleMarkdown(filePath, markdown) {
  const errors = [];
  const parsed = matter(markdown);

  if (!hasSourceGroundedTag(parsed.data)) {
    return errors;
  }

  for (const heading of requiredHeadings) {
    if (!parsed.content.includes(`\n${heading}\n`) && !parsed.content.startsWith(`${heading}\n`)) {
      errors.push(`${filePath}: source-grounded article must include heading "${heading}"`);
    }
  }

  for (const marker of placeholderMarkers) {
    if (new RegExp(`\\b${escapeRegExp(marker)}\\b`).test(parsed.content)) {
      errors.push(`${filePath}: source-grounded article contains placeholder marker "${marker}"`);
    }
  }

  for (const heading of duplicateHeadings(parsed.content)) {
    errors.push(`${filePath}: duplicate heading "${heading}"`);
  }

  const intro = firstParagraph(parsed.content);

  if (!intro || intro.length < 40) {
    errors.push(`${filePath}: source-grounded article needs a thesis paragraph before the first heading`);
  }

  const sourceSection = parsed.content.split('## 확인한 자료')[1] ?? '';
  const sourceLinks = sourceSection.match(/https?:\/\//g) ?? [];

  if (sourceLinks.length === 0) {
    errors.push(`${filePath}: source-grounded article must list at least one source URL`);
  }

  return errors;
}

export async function validateArticleDirectory(root = process.cwd()) {
  const articleRoot = join(root, 'src', 'content', 'articles');
  const files = await collectMdxFiles(articleRoot);
  const errors = [];

  for (const absolutePath of files) {
    const markdown = await readFile(absolutePath, 'utf8');
    const filePath = relative(root, absolutePath);
    errors.push(...validateArticleMarkdown(filePath, markdown));
  }

  return errors;
}

async function main() {
  const errors = await validateArticleDirectory();

  if (errors.length > 0) {
    console.error('Article quality validation failed:');

    for (const error of errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  console.log('Article quality validation passed.');
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
