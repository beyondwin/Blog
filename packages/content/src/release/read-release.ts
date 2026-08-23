import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import {
  parsePublicRecord,
  type PublicRecord,
} from '@beyondwin/contracts';
import { z } from 'zod';
import sharp from 'sharp';
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
  boundaryHits: PublicBoundaryHit[];
}

export interface PublicBoundaryHit {
  path: string;
  kind: 'forbidden-key' | 'private-locator' | 'serialized-private-field' | 'embedding-payload';
  marker: string;
}

export async function resolveOwnedReleasesRoot(releasesRoot: string): Promise<string> {
  const root = resolve(releasesRoot);
  const state = await lstat(root);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error('public-releases root must be a real directory, not a symbolic link');
  }
  await realpath(root);
  return root;
}

async function readOwnedRegularFile(path: string, label: string): Promise<Buffer> {
  let file;
  try {
    file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`${label} must not be a symbolic link`);
    }
    throw error;
  }
  try {
    const state = await file.stat();
    if (!state.isFile() || state.nlink !== 1) {
      throw new Error(`${label} must be one regular owned file`);
    }
    return await file.readFile();
  } finally {
    await file.close();
  }
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

// Match precise locators and serialized payload shapes, not ordinary technical
// prose such as "embedding systems".
const forbiddenPrivateKey = /^(?:embedding|embeddings|jobPrompt|rawPrompt|jobPayload|privatePath|sourcePath|rawSource|sourceBytes)$/i;
const serializedPrivateField = /["'](?:jobPrompt|rawPrompt|jobPayload|privatePath|sourcePath|rawSource|sourceBytes)["']\s*:/i;
const serializedEmbeddingPayload = /["']embeddings?["']\s*:\s*\[\s*[+\-.\d]/i;
const assignedPrivateField = /\b(?:jobPrompt|rawPrompt|jobPayload|privatePath|sourcePath|rawSource|sourceBytes)\s*=/i;
const privateLocator = /\/Users\/|[A-Za-z]:\\Users\\|memory[\\/]thoughts[\\/]/i;

export function findPublicBoundaryHits(value: unknown, path = 'manifest'): PublicBoundaryHit[] {
  const hits: PublicBoundaryHit[] = [];
  function visit(child: unknown, childPath: string): void {
    if (Array.isArray(child)) {
      child.forEach((item, index) => visit(item, `${childPath}[${index}]`));
      return;
    }
    if (typeof child === 'string') {
      if (privateLocator.test(child)) {
        hits.push({ path: childPath, kind: 'private-locator', marker: 'private filesystem locator' });
      }
      if (serializedPrivateField.test(child) || assignedPrivateField.test(child)) {
        hits.push({ path: childPath, kind: 'serialized-private-field', marker: 'serialized private payload field' });
      }
      if (serializedEmbeddingPayload.test(child)) {
        hits.push({ path: childPath, kind: 'embedding-payload', marker: 'serialized embedding vector' });
      }
      return;
    }
    if (!child || typeof child !== 'object') return;
    for (const [key, item] of Object.entries(child as Record<string, unknown>)) {
      const itemPath = `${childPath}.${key}`;
      if (forbiddenPrivateKey.test(key)) {
        hits.push({ path: itemPath, kind: 'forbidden-key', marker: key });
      }
      visit(item, itemPath);
    }
  }
  visit(value, path);
  return hits;
}

function assertBoundarySafe(value: unknown): void {
  const hits = findPublicBoundaryHits(value);
  if (hits.length > 0) {
    const first = hits[0]!;
    throw new Error(`${first.path}: private boundary hit (${first.kind}: ${first.marker}); total=${hits.length}`);
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

type PublicImageFormat = 'avif' | 'webp' | 'png' | 'jpg' | 'jpeg';

function sameImageFormat(actual: string, expected: PublicImageFormat): boolean {
  const normalize = (format: string) => format === 'jpg' ? 'jpeg' : format;
  return normalize(actual) === normalize(expected);
}

function candidateDimensions(candidates: Array<{ width: number; height: number }>): string {
  return candidates
    .map(({ width, height }) => `${width}x${height}`)
    .sort()
    .join(',');
}

function assertMediaCandidateInvariants(assetKey: string, asset: ReleaseMediaAsset): void {
  const expectedPrefix = `/assets/content/${asset.collection}/${asset.recordId}/`;
  const candidateGroups = [
    ...asset.sources.map((source) => source.candidates),
    asset.fallback.candidates,
  ];
  for (const candidates of candidateGroups) {
    const dimensions = candidates.map(({ width, height }) => `${width}x${height}`);
    if (new Set(dimensions).size !== dimensions.length) {
      throw new Error(`${assetKey}: duplicate dimensions in responsive media source set`);
    }
    for (const candidate of candidates) {
      if (!candidate.src.startsWith(expectedPrefix)) {
        throw new Error(`${assetKey}: candidate path escapes its public media record directory`);
      }
    }
  }
  if (!asset.fallback.src.startsWith(expectedPrefix)) {
    throw new Error(`${assetKey}: fallback path escapes its public media record directory`);
  }
  const modernPaths = new Set<string>();
  for (const source of asset.sources) {
    for (const candidate of source.candidates) {
      if (modernPaths.has(candidate.src)) {
        throw new Error(`${assetKey}: duplicate candidate path across modern source sets: ${candidate.src}`);
      }
      modernPaths.add(candidate.src);
    }
  }
  const fallbackPaths = new Set<string>();
  for (const candidate of asset.fallback.candidates) {
    if (fallbackPaths.has(candidate.src)) {
      throw new Error(`${assetKey}: duplicate candidate path in fallback source set: ${candidate.src}`);
    }
    if (modernPaths.has(candidate.src)) {
      throw new Error(`${assetKey}: duplicate candidate path across modern and fallback source sets: ${candidate.src}`);
    }
    fallbackPaths.add(candidate.src);
  }
  const dimensionSets = [
    ...asset.sources.map((source) => candidateDimensions(source.candidates)),
    candidateDimensions(asset.fallback.candidates),
  ];
  if (new Set(dimensionSets).size !== 1) {
    throw new Error(`${assetKey}: responsive media source-set dimension parity mismatch`);
  }
}

async function verifyCandidate(
  releasePath: string,
  candidate: { src: string; checksum: string; width: number; height: number },
  expectedFormat: PublicImageFormat,
): Promise<void> {
  const pathFormat = extname(candidate.src).slice(1).toLowerCase();
  if (!sameImageFormat(pathFormat, expectedFormat)) {
    throw new Error(`${candidate.src}: path extension does not match ${expectedFormat} source type`);
  }
  const bytes = await readOwnedRegularFile(releaseFilePath(releasePath, candidate.src), candidate.src);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== candidate.checksum) throw new Error(`${candidate.src}: release asset checksum mismatch`);
  const metadata = await sharp(bytes).metadata();
  const actualFormat = metadata.format === 'heif' && metadata.compression === 'av1'
    ? 'avif'
    : metadata.format;
  if (!actualFormat || !sameImageFormat(actualFormat, expectedFormat)) {
    throw new Error(`${candidate.src}: actual media format ${actualFormat ?? 'unknown'} does not match ${expectedFormat}`);
  }
  if (metadata.width !== candidate.width || metadata.height !== candidate.height) {
    throw new Error(
      `${candidate.src}: actual media dimensions ${metadata.width ?? '?'}x${metadata.height ?? '?'} do not match ${candidate.width}x${candidate.height}`,
    );
  }
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
  const root = await resolveOwnedReleasesRoot(releasesRoot);
  const realRoot = await realpath(root);
  const releasePath = resolve(root, parsedPointer.path);
  if (!releasePath.startsWith(`${root}${sep}`)) throw new Error('active release path escapes public-releases');
  const releaseState = await lstat(releasePath);
  if (releaseState.isSymbolicLink()) throw new Error('active release path must not be a symbolic link');
  if (!releaseState.isDirectory()) throw new Error('active release path is not a directory');
  const realReleasePath = await realpath(releasePath);
  if (!realReleasePath.startsWith(`${realRoot}${sep}`)) throw new Error('active release real path escapes public-releases containment');

  const manifest = parseReleaseManifest(JSON.parse(
    (await readOwnedRegularFile(join(realReleasePath, 'manifest.json'), 'release manifest')).toString('utf8'),
  ));
  const boundaryHits = findPublicBoundaryHits(manifest);
  if (manifest.releaseId !== parsedPointer.releaseId) {
    throw new Error('release ID mismatch between active pointer and manifest');
  }
  const expectedFiles = new Set(['manifest.json']);
  const assetPathOwners = new Map<string, string>();
  for (const [assetKey, asset] of Object.entries(manifest.assets)) {
    assertMediaCandidateInvariants(assetKey, asset);
    expectedFiles.add(asset.fallback.src.slice(1));
    for (const path of [
      asset.fallback.src,
      ...asset.fallback.candidates.map((candidate) => candidate.src),
      ...asset.sources.flatMap((source) => source.candidates.map((candidate) => candidate.src)),
    ]) {
      const owner = assetPathOwners.get(path);
      if (owner && owner !== assetKey) {
        throw new Error(`${path}: duplicate candidate path shared by ${owner} and ${assetKey}`);
      }
      assetPathOwners.set(path, assetKey);
    }
    for (const candidate of asset.fallback.candidates) expectedFiles.add(candidate.src.slice(1));
    for (const source of asset.sources) {
      for (const candidate of source.candidates) expectedFiles.add(candidate.src.slice(1));
    }
  }
  const actualFiles = await releaseFiles(realReleasePath);
  const unexpectedFiles = [...actualFiles].filter((path) => !expectedFiles.has(path));
  const missingFiles = [...expectedFiles].filter((path) => !actualFiles.has(path));
  if (unexpectedFiles.length > 0 || missingFiles.length > 0) {
    throw new Error(`unmanifested or missing release files: unexpected=${unexpectedFiles.join(',')} missing=${missingFiles.join(',')}`);
  }

  for (const asset of Object.values(manifest.assets)) {
    await verifyCandidate(realReleasePath, {
      src: asset.fallback.src,
      checksum: asset.fallback.checksum,
      width: asset.width,
      height: asset.height,
    }, asset.fallback.format);
    for (const candidate of asset.fallback.candidates) {
      await verifyCandidate(realReleasePath, candidate, asset.fallback.format);
    }
    for (const source of asset.sources) {
      const expectedFormat = source.type === 'image/avif' ? 'avif' : 'webp';
      for (const candidate of source.candidates) {
        await verifyCandidate(realReleasePath, candidate, expectedFormat);
      }
    }
  }
  return { pointer: parsedPointer, releasePath, manifest, boundaryHits };
}

export async function readActiveRelease(releasesRoot: string): Promise<ActivePublicRelease> {
  const root = await resolveOwnedReleasesRoot(releasesRoot);
  const pointer = activeReleasePointerSchema.parse(JSON.parse(
    (await readOwnedRegularFile(join(root, 'active.json'), 'active release pointer')).toString('utf8'),
  ));
  return verifyReleaseDirectory(root, pointer);
}
