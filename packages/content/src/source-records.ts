import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import {
  parsePublicRecord,
  publicMediaSchema,
  type PublicRecord,
} from '@beyondwin/contracts';
import { parse as parseYaml } from 'yaml';
import {
  readAllowlistedDirectory,
  readAllowlistedRegularFile,
  readAllowlistedTextFile,
} from './allowlisted-source-file';
import {
  publicMemoryProjectionSchema,
  sourceCollections,
  sourceMediaManifestSchema,
  sourceRecordSchema,
  verifiableSourceInputFormatSchema,
  type PublicMemoryProjection,
  type SourceRecord,
  type VerifiableSourceInputFormat,
} from './schemas';

interface MatterResult {
  data: Record<string, unknown>;
  content: string;
}

const matter = createRequire(import.meta.url)('gray-matter') as (source: string) => MatterResult;

export function parseSourceRecord(input: unknown): SourceRecord {
  if (!input || typeof input !== 'object') {
    return sourceRecordSchema.parse(input);
  }

  const candidate = input as Record<string, unknown>;
  const collection = candidate.collection;
  const id = candidate.id;
  const href = typeof collection === 'string' && typeof id === 'string'
    ? `/${collection}/${id}/`
    : undefined;

  return sourceRecordSchema.parse({ ...candidate, href });
}

async function contentFiles(repositoryRoot: string, relativeDirectory: string): Promise<string[]> {
  const entries = await readAllowlistedDirectory(repositoryRoot, relativeDirectory);
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`${relativePath}: src/content must not contain symbolic links`);
    }
    if (entry.isDirectory()) {
      files.push(...await contentFiles(repositoryRoot, relativePath));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      files.push(relativePath);
    } else if (!entry.isFile()) {
      throw new Error(`${relativePath}: src/content must contain only directories and regular files`);
    }
  }

  return files.sort();
}

export async function loadSourceRecords(root: string): Promise<SourceRecord[]> {
  const records: SourceRecord[] = [];

  for (const collection of sourceCollections) {
    const collectionDirectory = `src/content/${collection}`;
    for (const relativePath of await contentFiles(root, collectionDirectory)) {
      const filename = relativePath.slice(collectionDirectory.length + 1);
      if (filename.includes('/')) {
        throw new Error(`${filename}: nested content IDs are not supported by the public route contract`);
      }
      const source = await readAllowlistedTextFile(root, relativePath);
      const parsed = matter(source);
      const id = filename.replace(/\.mdx?$/, '');
      records.push(parseSourceRecord({
        ...parsed.data,
        collection,
        id,
        body: parsed.content,
      }));
    }
  }

  return records;
}

function publicSourceHref(source: PublicMemoryProjection['sources'][number]): string | null {
  if (source.url) return source.url;
  const match = source.path?.match(/^src\/content\/(analysis|articles|ideas|reviews|travel|thoughts)\/([a-z0-9][a-z0-9-]*)\.mdx?$/);
  return match ? `/${match[1]}/${match[2]}/` : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function memoryBodyHtml(body: string): string {
  return body
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

export async function loadPublicMemoryRecords(root: string): Promise<Array<Extract<PublicRecord, { collection: 'memory' }>>> {
  const source = await readAllowlistedTextFile(root, 'src/data/memory.public.json');
  const projection = publicMemoryProjectionSchema.parse(JSON.parse(source));
  const generatedAt = projection.generatedAt ?? '1970-01-01T00:00:00.000Z';
  const thoughts = new Map(projection.thoughts.map((thought) => [thought.slug, thought]));
  const sources = new Map(projection.sources.map((item) => [item.id, item]));

  return projection.thoughts.map((thought) => {
    const safeSources = thought.sources.flatMap((sourceId) => {
      const memorySource = sources.get(sourceId);
      if (!memorySource) return [];
      const href = publicSourceHref(memorySource);
      return href ? [{ title: memorySource.title, href }] : [];
    });
    const seenCompanions = new Set<string>();
    const companions = projection.edges.flatMap((edge) => {
      const companionSlug = edge.from === thought.slug
        ? edge.to
        : edge.to === thought.slug
          ? edge.from
          : null;
      if (!companionSlug || companionSlug === thought.slug || seenCompanions.has(companionSlug)) return [];
      const companion = thoughts.get(companionSlug);
      if (!companion) return [];
      seenCompanions.add(companionSlug);
      return [{
        slug: companion.slug,
        claimKo: companion.claimKo,
        href: `/memory/${companion.slug}/`,
      }];
    });

    return parsePublicRecord({
      collection: 'memory',
      id: thought.slug,
      href: `/memory/${thought.slug}/`,
      title: thought.claimKo,
      description: thought.claimEn ?? thought.body,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      tags: [...thought.topics],
      media: [],
      relationships: [],
      memoryLinks: [],
      bodyHtml: memoryBodyHtml(thought.body),
      claimKo: thought.claimKo,
      claimEn: thought.claimEn,
      body: thought.body,
      memoryType: thought.memoryType,
      origin: thought.origin,
      topics: [...thought.topics],
      theses: [...thought.theses],
      sources: safeSources,
      companions,
    }) as Extract<PublicRecord, { collection: 'memory' }>;
  });
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('invalid PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('invalid JPEG');
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) break;
    if (startOfFrame.has(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += length + 2;
  }

  throw new Error('JPEG dimensions not found');
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('invalid WebP');
  }
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
    };
  }
  throw new Error(`unsupported WebP chunk ${kind}`);
}

function sourceImageDimensions(buffer: Buffer, format: VerifiableSourceInputFormat): { width: number; height: number } {
  if (format === 'png') return readPngDimensions(buffer);
  if (format === 'jpg' || format === 'jpeg') return readJpegDimensions(buffer);
  if (format === 'webp') return readWebpDimensions(buffer);
  throw new Error(`unsupported source media format: ${format satisfies never}`);
}

type SourceCollection = (typeof sourceCollections)[number];
const resolvedSourceMediaSchema = publicMediaSchema.extend({ format: verifiableSourceInputFormatSchema });
export type ResolvedSourceMedia = ReturnType<typeof resolvedSourceMediaSchema.parse>;

export async function resolveSourceMedia(
  root: string,
  collection: SourceCollection,
  slug: string,
  mediaId: string,
): Promise<ResolvedSourceMedia> {
  if (!sourceCollections.includes(collection) || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('unsupported public collection or record id');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(mediaId)) throw new Error('invalid public media id');

  const mediaDirectory = `src/assets/content/${collection}/${slug}`;
  const manifestPath = `${mediaDirectory}/media.yml`;
  const manifest = sourceMediaManifestSchema.parse(parseYaml(
    await readAllowlistedTextFile(root, manifestPath),
  ));
  const item = manifest.items.find((candidate) => candidate.id === mediaId);
  if (!item) throw new Error(`${manifestPath}: unknown media id ${mediaId}`);

  const asset = await readAllowlistedRegularFile(root, `${mediaDirectory}/${item.file}`);
  const format = extname(item.file).slice(1) as VerifiableSourceInputFormat;
  const actualDimensions = sourceImageDimensions(asset, format);
  const width = item.width ?? actualDimensions.width;
  const height = item.height ?? actualDimensions.height;
  if (width !== actualDimensions.width || height !== actualDimensions.height) {
    throw new Error(`${manifestPath}: media item ${mediaId} dimensions do not match the asset`);
  }
  const checksum = `sha256:${createHash('sha256').update(asset).digest('hex')}`;
  if (checksum !== item.checksum) throw new Error(`${manifestPath}: media item ${mediaId} checksum does not match the asset`);

  return resolvedSourceMediaSchema.parse({
    id: item.id,
    kind: item.kind,
    src: `/assets/content/${collection}/${slug}/${item.file}`,
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
    verifiedAt: item.verifiedAt,
    rightsNote: item.rightsNote,
    width,
    height,
    format,
    checksum,
  });
}
