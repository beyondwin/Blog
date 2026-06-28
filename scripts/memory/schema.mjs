import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import matter from 'gray-matter';

export const SUPPORTED_SCHEMA_VERSION = 1;
export const ALLOWED_MEMORY_TYPES = new Set(['semantic', 'procedural', 'reflective', 'episodic']);
export const ALLOWED_ORIGINS = new Set(['kws', 'external', 'synthesized']);
export const ALLOWED_CONFIDENTIALITY = new Set(['private', 'public']);
export const ALLOWED_REVIEW_STATUSES = new Set(['candidate', 'accepted', 'needs_review', 'rejected']);
export const ALLOWED_EDGE_TYPES = new Set([
  'supports',
  'extends',
  'instantiates',
  'refines',
  'contradicts',
  'related',
  'topic-tag',
  'thesis-tag',
]);
export const PUBLIC_SURFACE = 'memory-public';

const REQUIRED_THOUGHT_FIELDS = [
  'schema_version',
  'slug',
  'claim_ko',
  'claim_en',
  'memory_type',
  'origin',
  'confidentiality',
  'surfaces',
  'topics',
  'sources',
];

function formatAllowedValues(values) {
  const items = Array.from(values);
  if (items.length <= 1) {
    return items.join('');
  }

  return `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`;
}

export function parseThoughtMarkdown(markdown, filePath) {
  const parsed = matter(markdown);

  return {
    ...parsed.data,
    body: parsed.content.trim(),
    filePath,
  };
}

export async function readThoughtFile(filePath) {
  const markdown = await readFile(filePath, 'utf8');
  return parseThoughtMarkdown(markdown, filePath);
}

export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '');
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

export function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeLocalPath(value) {
  if (!value || typeof value !== 'string' || isAbsolute(value) || value.includes('\0')) {
    return false;
  }

  const normalized = normalize(value);
  return !normalized.startsWith('..') && normalized !== '.';
}

async function localPathExists(root, sourcePath) {
  const fullPath = join(root, sourcePath);
  const relativePath = relative(root, fullPath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return false;
  }

  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function validateSource(source, options = {}) {
  const { root = process.cwd(), requireResolvedSources = true } = options;
  const errors = [];
  const label = source?.path || source?.url || source?.title || 'source';

  if (!source || typeof source !== 'object') {
    return ['source must be an object'];
  }

  if (!source.kind) {
    errors.push(`${label}: source.kind is required`);
  }

  if (!source.title) {
    errors.push(`${label}: source.title is required`);
  }

  if (!source.path && !source.url) {
    errors.push(`${label}: source must include path or url`);
  }

  if (source.path && !isSafeLocalPath(source.path)) {
    errors.push(`${label}: source.path must be a safe relative path`);
  }

  if (source.url && !isExternalUrl(source.url)) {
    errors.push(`${label}: source.url must be an http or https URL`);
  }

  if (requireResolvedSources && source.path && isSafeLocalPath(source.path)) {
    const exists = await localPathExists(root, source.path);
    if (!exists) {
      errors.push(`${label}: source.path does not exist`);
    }
  }

  return errors;
}

export async function validateThoughtRecordAsync(thought, options = {}) {
  const syncErrors = validateThoughtRecord(thought, { ...options, requireResolvedSources: false });
  const sourceErrors = [];

  if (Array.isArray(thought?.sources)) {
    for (const source of thought.sources) {
      sourceErrors.push(...await validateSource(source, options));
    }
  }

  return [...syncErrors, ...sourceErrors];
}

export function validateThoughtRecord(thought) {
  const errors = [];
  const slug = thought?.slug || 'thought';

  if (!thought || typeof thought !== 'object') {
    return ['thought must be an object'];
  }

  for (const field of REQUIRED_THOUGHT_FIELDS) {
    if (thought[field] === undefined || thought[field] === null || thought[field] === '') {
      errors.push(`${slug}: ${field} is required`);
    }
  }

  if (thought.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    errors.push(`${slug}: schema_version must be ${SUPPORTED_SCHEMA_VERSION}`);
  }

  if (thought.memory_type && !ALLOWED_MEMORY_TYPES.has(thought.memory_type)) {
    errors.push(`${slug}: memory_type must be ${formatAllowedValues(ALLOWED_MEMORY_TYPES)}`);
  }

  if (thought.origin && !ALLOWED_ORIGINS.has(thought.origin)) {
    errors.push(`${slug}: origin must be ${formatAllowedValues(ALLOWED_ORIGINS)}`);
  }

  if (thought.confidentiality && !ALLOWED_CONFIDENTIALITY.has(thought.confidentiality)) {
    errors.push(`${slug}: confidentiality must be private or public`);
  }

  if (!Array.isArray(thought.surfaces)) {
    errors.push(`${slug}: surfaces must be an array`);
  }

  if (!Array.isArray(thought.topics)) {
    errors.push(`${slug}: topics must be an array`);
  }

  if (!Array.isArray(thought.sources)) {
    errors.push(`${slug}: sources must be an array`);
  }

  if (!thought.review || typeof thought.review !== 'object') {
    errors.push(`${slug}: review is required`);
  } else if (!thought.review.status) {
    errors.push(`${slug}: review.status is required`);
  } else if (!ALLOWED_REVIEW_STATUSES.has(thought.review.status)) {
    errors.push(`${slug}: review.status must be ${formatAllowedValues(ALLOWED_REVIEW_STATUSES)}`);
  }

  return errors;
}

export function getProjectionExclusionReason(thought) {
  if (thought.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return 'unsupportedSchema';
  }

  if (thought.confidentiality !== 'public') {
    return 'private';
  }

  if (thought.review?.status !== 'accepted') {
    return 'notAccepted';
  }

  if (!Array.isArray(thought.surfaces) || !thought.surfaces.includes(PUBLIC_SURFACE)) {
    return 'notPublicSurface';
  }

  if (!Array.isArray(thought.sources) || thought.sources.length === 0) {
    return 'missingSource';
  }

  return null;
}

export function validateEdgeRecord(edge, knownThoughtSlugs = new Set()) {
  const errors = [];
  const label = `edge ${edge?.from || '?'} -> ${edge?.to || '?'}`;

  if (!edge || typeof edge !== 'object') {
    return ['edge must be an object'];
  }

  if (!edge.from) {
    errors.push(`${label}: from is required`);
  }

  if (!edge.to) {
    errors.push(`${label}: to is required`);
  }

  if (!ALLOWED_EDGE_TYPES.has(edge.type)) {
    errors.push(`${label}: type must be ${formatAllowedValues(ALLOWED_EDGE_TYPES)}`);
  }

  if (typeof edge.confidence !== 'number' || edge.confidence < 0 || edge.confidence > 1) {
    errors.push(`${label}: confidence must be a number from 0 to 1`);
  }

  if (edge.from && knownThoughtSlugs.size > 0 && !knownThoughtSlugs.has(edge.from)) {
    errors.push(`${label}: source thought does not exist`);
  }

  if (edge.to && knownThoughtSlugs.size > 0 && !knownThoughtSlugs.has(edge.to)) {
    errors.push(`${label}: target thought does not exist`);
  }

  return errors;
}

export function parseJsonLines(text, filePath) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: invalid JSONL: ${error.message}`);
      }
    });
}

export function ensureDirectoryPath(filePath) {
  return dirname(filePath);
}
