import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  parsePublicRecord,
  type PublicRecord,
} from '@beyondwin/contracts';
import { z } from 'zod';
import type { ReleaseMediaAsset } from '../media/build-responsive-media';

const releaseIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const canonicalAssetHrefSchema = z.string().regex(
  /^\/assets\/content\/(?:analysis|articles|ideas|reviews|travel)\/[a-z0-9][a-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+\.(?:jpg|jpeg|png|webp|avif)$/,
);
const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const externalOrContentUrlSchema = z.string().refine((value) => {
  if (/^\/(?:analysis|articles|ideas|reviews|travel)\/[a-z0-9][a-z0-9-]*\/$/.test(value)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
});

const candidateSchema = z.object({
  src: canonicalAssetHrefSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  checksum: checksumSchema,
}).strict();

const responsiveSourcesSchema = z.array(z.object({
  type: z.enum(['image/avif', 'image/webp']),
  candidates: z.array(candidateSchema).min(1),
}).strict()).length(2).superRefine((sources, context) => {
  const types = new Set(sources.map((source) => source.type));
  if (!types.has('image/avif') || !types.has('image/webp')) {
    context.addIssue({ code: 'custom', message: 'responsive media requires one AVIF and one WebP source' });
  }
});

const releaseMediaAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  collection: z.enum(['analysis', 'articles', 'ideas', 'reviews', 'travel']),
  recordId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.enum(['book-cover', 'photo', 'diagram', 'screenshot', 'illustration']),
  alt: z.string().trim().min(1),
  caption: z.string().trim().min(1).optional(),
  credit: z.string().trim().min(1),
  provenanceUrl: externalOrContentUrlSchema,
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rightsNote: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceChecksum: checksumSchema,
  sources: responsiveSourcesSchema,
  fallback: z.object({
    src: canonicalAssetHrefSchema,
    format: z.enum(['jpg', 'jpeg', 'png', 'webp']),
    checksum: checksumSchema,
    candidates: z.array(candidateSchema).min(1),
  }).strict(),
}).strict();

const manifestEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  rendererVersion: z.string().regex(/^mdx-3\.1\.1-sharp-0\.35\.3-v\d+$/),
  releaseId: releaseIdSchema,
  records: z.record(z.string(), z.unknown()),
  assets: z.record(z.string(), releaseMediaAssetSchema),
}).strict();

export const activeReleasePointerSchema = z.object({
  releaseId: releaseIdSchema,
  path: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((pointer, context) => {
  if (pointer.path !== pointer.releaseId) {
    context.addIssue({ code: 'custom', path: ['path'], message: 'path must equal releaseId' });
  }
});

export interface ActiveReleasePointer {
  releaseId: string;
  path: string;
}

export interface PublicReleaseManifest {
  schemaVersion: 1;
  rendererVersion: string;
  releaseId: string;
  records: Record<string, PublicRecord>;
  assets: Record<string, ReleaseMediaAsset>;
}

export interface ActivePublicRelease {
  pointer: ActiveReleasePointer;
  releasePath: string;
  manifest: PublicReleaseManifest;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

function exactPublicRecord(input: unknown, key: string): PublicRecord {
  const parsed = parsePublicRecord(input);
  if (canonicalJson(input) !== canonicalJson(parsed)) {
    throw new Error(`${key}: public record contains non-allowlisted fields`);
  }
  return parsed;
}

function assertBoundarySafe(value: unknown, path = 'manifest'): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertBoundarySafe(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /\/Users\/|memory\/thoughts\/|\\memory\\thoughts\\/i.test(value)) {
      throw new Error(`${path}: private path in public release`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:embedding|embeddings|jobPrompt|rawPrompt|jobPayload|privatePath|sourcePath|rawSource|sourceBytes)$/i.test(key)) {
      throw new Error(`${path}.${key}: private field in public release`);
    }
    assertBoundarySafe(child, `${path}.${key}`);
  }
}

export function parseReleaseManifest(input: unknown): PublicReleaseManifest {
  const envelope = manifestEnvelopeSchema.parse(input);
  const records: Record<string, PublicRecord> = {};
  for (const [key, inputRecord] of Object.entries(envelope.records)) {
    const record = exactPublicRecord(inputRecord, key);
    if (key !== `${record.collection}/${record.id}`) {
      throw new Error(`${key}: manifest record key does not match the public record`);
    }
    records[key] = record;
  }
  for (const [key, asset] of Object.entries(envelope.assets)) {
    if (key !== `${asset.collection}/${asset.recordId}/${asset.id}`) {
      throw new Error(`${key}: manifest asset key does not match the public asset`);
    }
  }
  const manifest: PublicReleaseManifest = { ...envelope, records };
  const linkedAssets = new Set<string>();
  for (const [recordKey, record] of Object.entries(records)) {
    for (const media of record.media) {
      const assetKey = `${recordKey}/${media.id}`;
      const asset = manifest.assets[assetKey];
      if (!asset) throw new Error(`${assetKey}: public media is missing its responsive asset`);
      linkedAssets.add(assetKey);
      const expected = {
        id: media.id,
        kind: media.kind,
        alt: media.alt,
        ...(media.caption ? { caption: media.caption } : {}),
        credit: media.credit,
        verifiedAt: media.verifiedAt,
        rightsNote: media.rightsNote,
        width: media.width,
        height: media.height,
        sourceChecksum: media.checksum,
        fallback: {
          src: media.src,
          format: media.format,
          checksum: media.checksum,
        },
      };
      const actual = {
        id: asset.id,
        kind: asset.kind,
        alt: asset.alt,
        ...(asset.caption ? { caption: asset.caption } : {}),
        credit: asset.credit,
        verifiedAt: asset.verifiedAt,
        rightsNote: asset.rightsNote,
        width: asset.width,
        height: asset.height,
        sourceChecksum: asset.sourceChecksum,
        fallback: {
          src: asset.fallback.src,
          format: asset.fallback.format,
          checksum: asset.fallback.checksum,
        },
      };
      if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${assetKey}: responsive asset does not match its public media source checksum or allowlist`);
      }
    }
  }
  for (const assetKey of Object.keys(manifest.assets)) {
    if (!linkedAssets.has(assetKey)) throw new Error(`${assetKey}: responsive asset has no public media record`);
  }
  assertBoundarySafe(manifest);
  return manifest;
}

function releaseFilePath(releasePath: string, href: string): string {
  const resolved = resolve(releasePath, `.${href}`);
  if (!resolved.startsWith(`${resolve(releasePath)}${sep}`)) {
    throw new Error(`public asset escapes release directory: ${href}`);
  }
  return resolved;
}

async function verifyCandidate(releasePath: string, candidate: { src: string; checksum: string }): Promise<void> {
  const bytes = await readFile(releaseFilePath(releasePath, candidate.src));
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== candidate.checksum) throw new Error(`${candidate.src}: release asset checksum mismatch`);
}

async function releaseFiles(releasePath: string, directory = releasePath): Promise<Set<string>> {
  const files = new Set<string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const child of await releaseFiles(releasePath, path)) files.add(child);
    } else if (entry.isFile()) {
      files.add(relative(releasePath, path).split(sep).join('/'));
    } else {
      throw new Error(`${path}: unexpected symlink or special release file`);
    }
  }
  return files;
}

export async function verifyReleaseDirectory(
  releasesRoot: string,
  pointer: ActiveReleasePointer,
): Promise<ActivePublicRelease> {
  const parsedPointer = activeReleasePointerSchema.parse(pointer);
  const root = resolve(releasesRoot);
  const releasePath = resolve(root, parsedPointer.path);
  if (!releasePath.startsWith(`${root}${sep}`)) throw new Error('active release path escapes public-releases');
  if (!(await stat(releasePath)).isDirectory()) throw new Error('active release path is not a directory');

  const manifest = parseReleaseManifest(JSON.parse(await readFile(join(releasePath, 'manifest.json'), 'utf8')));
  if (manifest.releaseId !== parsedPointer.releaseId) {
    throw new Error('release ID mismatch between active pointer and manifest');
  }
  const expectedFiles = new Set(['manifest.json']);
  for (const asset of Object.values(manifest.assets)) {
    expectedFiles.add(asset.fallback.src.slice(1));
    for (const candidate of asset.fallback.candidates) expectedFiles.add(candidate.src.slice(1));
    for (const source of asset.sources) {
      for (const candidate of source.candidates) expectedFiles.add(candidate.src.slice(1));
    }
  }
  const actualFiles = await releaseFiles(releasePath);
  const unexpectedFiles = [...actualFiles].filter((path) => !expectedFiles.has(path));
  const missingFiles = [...expectedFiles].filter((path) => !actualFiles.has(path));
  if (unexpectedFiles.length > 0 || missingFiles.length > 0) {
    throw new Error(`unmanifested or missing release files: unexpected=${unexpectedFiles.join(',')} missing=${missingFiles.join(',')}`);
  }

  for (const asset of Object.values(manifest.assets)) {
    await verifyCandidate(releasePath, { src: asset.fallback.src, checksum: asset.fallback.checksum });
    for (const candidate of asset.fallback.candidates) await verifyCandidate(releasePath, candidate);
    for (const source of asset.sources) {
      for (const candidate of source.candidates) await verifyCandidate(releasePath, candidate);
    }
  }
  return { pointer: parsedPointer, releasePath, manifest };
}

export async function readActiveRelease(releasesRoot: string): Promise<ActivePublicRelease> {
  const pointer = activeReleasePointerSchema.parse(JSON.parse(
    await readFile(join(releasesRoot, 'active.json'), 'utf8'),
  ));
  return verifyReleaseDirectory(releasesRoot, pointer);
}
