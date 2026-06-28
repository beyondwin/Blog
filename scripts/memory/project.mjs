import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDirectoryPath,
  getProjectionExclusionReason,
  parseJsonLines,
  readThoughtFile,
  slugify,
  validateEdgeRecord,
  validateThoughtRecordAsync,
} from './schema.mjs';

const EXCLUDED_REASONS = [
  'private',
  'notAccepted',
  'notPublicSurface',
  'missingSource',
  'invalidSource',
  'unsupportedSchema',
];

async function collectFiles(directory, extension) {
  const files = [];

  try {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectFiles(fullPath, extension));
      } else if (extname(entry.name) === extension) {
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

async function readJsonLinesIfExists(filePath) {
  try {
    return parseJsonLines(await readFile(filePath, 'utf8'), filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function createExcludedCounts() {
  return Object.fromEntries(EXCLUDED_REASONS.map((reason) => [reason, 0]));
}

function incrementExcluded(excluded, reason) {
  excluded[reason] = (excluded[reason] || 0) + 1;
}

function sourceId(source) {
  return slugify(source.id || source.path || source.url || source.title);
}

function normalizeDateValue(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function normalizeSourceRecord(source) {
  return {
    ...source,
    ...(source.date ? { date: normalizeDateValue(source.date) } : {}),
  };
}

function hasSourceValidationError(errors) {
  return errors.some((error) => error.includes('source.') || error.includes('source must'));
}

function stablePosition(index, total) {
  const angle = total <= 1 ? 0 : (Math.PI * 2 * index) / total;
  const radius = 38;

  return {
    x: Math.round((50 + Math.cos(angle) * radius) * 100) / 100,
    y: Math.round((50 + Math.sin(angle) * radius) * 100) / 100,
  };
}

function buildSourceRegistry(sources) {
  const registry = new Map();

  for (const source of sources) {
    if (source && typeof source === 'object') {
      registry.set(sourceId(source), normalizeSourceRecord(source));
    }
  }

  return registry;
}

export async function collectMemoryInputs({ root = process.cwd() } = {}) {
  const thoughtFiles = await collectFiles(join(root, 'memory/thoughts'), '.md');
  const thoughts = [];

  for (const filePath of thoughtFiles) {
    thoughts.push(await readThoughtFile(filePath));
  }

  const edges = await readJsonLinesIfExists(join(root, 'memory/edges.jsonl'));
  const sources = await readJsonLinesIfExists(join(root, 'memory/sources.jsonl'));

  return { thoughts, edges, sources };
}

export async function buildPublicMemory(inputs, options = {}) {
  const { root = process.cwd(), generatedAt = new Date().toISOString() } = options;
  const excluded = createExcludedCounts();
  const publicThoughts = [];

  for (const thought of inputs.thoughts) {
    const reason = getProjectionExclusionReason(thought);
    if (reason) {
      incrementExcluded(excluded, reason);
      continue;
    }

    const validationErrors = await validateThoughtRecordAsync(thought, { root });
    if (validationErrors.length > 0) {
      if (hasSourceValidationError(validationErrors)) {
        incrementExcluded(excluded, 'invalidSource');
      }

      throw new Error(validationErrors.join('\n'));
    }

    publicThoughts.push(thought);
  }

  const publicSlugs = new Set(publicThoughts.map((thought) => thought.slug));
  const sourceRegistry = buildSourceRegistry(inputs.sources || []);
  const topicCounts = new Map();
  const sourceCounts = new Map();
  const sourceRecords = new Map();

  for (const thought of publicThoughts) {
    for (const topic of thought.topics || []) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }

    for (const source of thought.sources || []) {
      const id = sourceId(source);
      const registryRecord = sourceRegistry.get(id) || {};
      sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
      sourceRecords.set(id, normalizeSourceRecord({ ...registryRecord, ...source, id }));
    }
  }

  const topics = Array.from(topicCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([topic, count], index, allTopics) => ({
      id: `topic:${slugify(topic)}`,
      slug: slugify(topic),
      label: topic,
      count,
      position: stablePosition(index, allTopics.length),
    }));

  const sources = Array.from(sourceRecords.values())
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((source) => ({
      ...source,
      count: sourceCounts.get(source.id) || 0,
    }));

  const thoughtEdges = [];
  for (const edge of inputs.edges || []) {
    const endpointErrors = validateEdgeRecord(edge, publicSlugs);
    if (endpointErrors.length === 0) {
      thoughtEdges.push(edge);
    }
  }

  const topicEdges = publicThoughts.flatMap((thought) => {
    return (thought.topics || []).map((topic) => ({
      from: thought.slug,
      to: `topic:${slugify(topic)}`,
      type: 'topic-tag',
      confidence: 1,
    }));
  });

  const thoughts = publicThoughts.map((thought, index) => ({
    slug: thought.slug,
    claimKo: thought.claim_ko,
    claimEn: thought.claim_en,
    memoryType: thought.memory_type,
    origin: thought.origin,
    topics: thought.topics || [],
    theses: thought.theses || [],
    sources: (thought.sources || []).map((source) => sourceId(source)),
    body: thought.body || '',
    position: stablePosition(index, publicThoughts.length),
  }));

  const edges = [...thoughtEdges, ...topicEdges];

  return {
    schemaVersion: 1,
    generatedAt,
    counts: {
      thoughts: thoughts.length,
      topics: topics.length,
      edges: edges.length,
      sources: sources.length,
    },
    thoughts,
    topics,
    sources,
    edges,
    excluded,
  };
}

export async function writePublicMemory(projection, outputPath) {
  await mkdir(ensureDirectoryPath(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(projection, null, 2)}\n`);
}

async function main() {
  const root = process.cwd();
  const validateOnly = process.argv.includes('--validate');
  const inputs = await collectMemoryInputs({ root });
  const projection = await buildPublicMemory(inputs, { root });

  if (!validateOnly) {
    await writePublicMemory(projection, join(root, 'src/data/memory.public.json'));
  }

  console.log([
    'Memory projection valid.',
    `thoughts=${projection.counts.thoughts}`,
    `topics=${projection.counts.topics}`,
    `edges=${projection.counts.edges}`,
    `sources=${projection.counts.sources}`,
    `excluded=${JSON.stringify(projection.excluded)}`,
  ].join(' '));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
