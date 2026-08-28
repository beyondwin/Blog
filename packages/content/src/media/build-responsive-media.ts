import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  generatedMediaEvidenceReceiptSchema,
  type GeneratedMediaEvidenceReceipt,
  type PublicMedia,
} from '@beyondwin/contracts';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';
import {
  readAllowlistedRegularFile,
  readAllowlistedTextFile,
} from '../allowlisted-source-file';
import {
  generatedMediaDecisionManifestSchema,
  sourceMediaManifestSchema,
  type SourceMediaManifest,
  type VerifiableSourceInputFormat,
} from '../schemas';
import { resolveSourceMedia } from '../source-records';

type SourceCollection = 'analysis' | 'articles' | 'ideas' | 'reviews' | 'travel' | 'thoughts';
export type ResponsiveMediaRole = 'figure' | 'intrinsic';

export interface ReleaseMediaCandidate {
  src: string;
  width: number;
  height: number;
  checksum: string;
}

export interface ReleaseMediaSource {
  type: 'image/avif' | 'image/webp';
  candidates: ReleaseMediaCandidate[];
}

export interface ReleaseMediaAsset {
  id: string;
  collection: SourceCollection;
  recordId: string;
  kind: PublicMedia['kind'];
  alt: string;
  caption?: string;
  credit: string;
  provenanceUrl: string;
  verifiedAt: string;
  rightsNote: string;
  width: number;
  height: number;
  sourceChecksum: string;
  generationEvidence?: GeneratedMediaEvidenceReceipt;
  sources: ReleaseMediaSource[];
  fallback: {
    src: string;
    format: VerifiableSourceInputFormat;
    checksum: string;
    candidates: ReleaseMediaCandidate[];
  };
}

export interface SourceMediaBuildInput {
  publicMedia: PublicMedia;
  collection: SourceCollection;
  recordId: string;
  role: ResponsiveMediaRole;
  provenanceUrl: string;
  repositoryRoot: string;
  sourceRelativePath: string;
  generationEvidence?: GeneratedMediaEvidenceReceipt;
}

function checksum(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

async function loadGeneratedMediaEvidence(
  root: string,
  collection: SourceCollection,
  recordId: string,
  mediaDirectory: string,
  item: SourceMediaManifest['items'][number],
  publicMedia: PublicMedia,
): Promise<GeneratedMediaEvidenceReceipt | undefined> {
  if (!item.generation) return undefined;
  if (!item.sourcePath) throw new Error(`${collection}/${recordId}/${item.id}: generated media decision manifest is missing`);

  const decisionBytes = await readAllowlistedRegularFile(root, item.sourcePath);
  const decisionChecksum = checksum(decisionBytes);
  if (decisionChecksum !== item.generation.decisionManifestChecksum) {
    throw new Error(`${collection}/${recordId}/${item.id}: generated media decision manifest checksum changed`);
  }
  const decision = generatedMediaDecisionManifestSchema.parse(parseYaml(decisionBytes.toString('utf8')));
  if (decision.approval.state !== 'approved') {
    throw new Error(`${collection}/${recordId}/${item.id}: generated media approval must be approved`);
  }
  if (decision.rightsReview.state !== 'approved' || decision.rightsReview.decision !== 'approve-repository-publication') {
    throw new Error(`${collection}/${recordId}/${item.id}: generated media rights review must be approved for repository publication`);
  }

  for (const field of ['provider', 'generator', 'model', 'modelVersion', 'promptVersion'] as const) {
    if (decision.generator[field] !== item.generation[field]) {
      throw new Error(`${collection}/${recordId}/${item.id}: generated media ${field} does not match the decision manifest`);
    }
  }
  if (!decision.approval.selectedCandidateIds.includes(item.generation.candidateId)) {
    throw new Error(`${collection}/${recordId}/${item.id}: generated media candidate is not in the approved selection`);
  }
  const approved = decision.assets.find((asset) => asset.candidateId === item.generation?.candidateId);
  if (!approved) throw new Error(`${collection}/${recordId}/${item.id}: generated media candidate has no approved asset`);
  const expected = {
    collection,
    recordId,
    mediaId: item.id,
    file: item.file,
    sourcePath: `${mediaDirectory}/${item.file}`,
    checksum: publicMedia.checksum,
    width: publicMedia.width,
    height: publicMedia.height,
  };
  for (const field of ['collection', 'recordId', 'mediaId', 'file', 'sourcePath', 'checksum', 'width', 'height'] as const) {
    if (approved[field] !== expected[field]) {
      throw new Error(`${collection}/${recordId}/${item.id}: generated media ${field} does not match the approved asset`);
    }
  }

  const contactSheetBytes = await readAllowlistedRegularFile(root, decision.approvedContactSheet.path);
  if (checksum(contactSheetBytes) !== decision.approvedContactSheet.checksum) {
    throw new Error(`${collection}/${recordId}/${item.id}: approved contact sheet checksum changed`);
  }
  return generatedMediaEvidenceReceiptSchema.parse({
    decisionManifest: item.sourcePath,
    decisionManifestChecksum: decisionChecksum,
    candidateId: item.generation.candidateId,
  });
}

function publicAssetPath(releaseRoot: string, href: string): string {
  if (!href.startsWith('/assets/content/')) throw new Error(`invalid public asset href: ${href}`);
  return join(releaseRoot, ...href.slice(1).split('/'));
}

function variantHref(sourceHref: string, suffix: string, format: string): string {
  const extension = extname(sourceHref);
  return `${sourceHref.slice(0, -extension.length)}-${suffix}.${format}`;
}

export function responsiveWidths(role: ResponsiveMediaRole, intrinsicWidth: number): number[] {
  if (role === 'intrinsic') return [intrinsicWidth];
  return [...new Set([720, 1080, 1600, intrinsicWidth]
    .filter((width) => width <= intrinsicWidth))]
    .sort((left, right) => left - right);
}

async function writeGeneratedCandidate(
  releaseRoot: string,
  sourceBytes: Buffer,
  href: string,
  width: number,
  format: 'avif' | 'webp' | VerifiableSourceInputFormat,
): Promise<ReleaseMediaCandidate> {
  let pipeline = sharp(sourceBytes).resize({ width, withoutEnlargement: true });
  if (format === 'avif') pipeline = pipeline.avif({ quality: 62, effort: 5 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality: 78, effort: 5 });
  else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
  else pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });

  const generated = await pipeline.toBuffer({ resolveWithObject: true });
  const path = publicAssetPath(releaseRoot, href);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, generated.data);
  return {
    src: href,
    width: generated.info.width,
    height: generated.info.height,
    checksum: checksum(generated.data),
  };
}

export async function loadSourceMediaBuildInput(
  root: string,
  collection: SourceCollection,
  recordId: string,
  mediaId: string,
  role: ResponsiveMediaRole,
): Promise<SourceMediaBuildInput> {
  const publicMedia = await resolveSourceMedia(root, collection, recordId, mediaId);
  const mediaDirectory = `src/assets/content/${collection}/${recordId}`;
  const manifest = sourceMediaManifestSchema.parse(parseYaml(
    await readAllowlistedTextFile(root, `${mediaDirectory}/media.yml`),
  ));
  const item = manifest.items.find((candidate) => candidate.id === mediaId);
  if (!item) throw new Error(`unknown public media ${collection}/${recordId}/${mediaId}`);
  const generationEvidence = await loadGeneratedMediaEvidence(
    root,
    collection,
    recordId,
    mediaDirectory,
    item,
    publicMedia,
  );

  return {
    publicMedia,
    collection,
    recordId,
    role,
    provenanceUrl: item.sourceUrl ?? `/${collection}/${recordId}/`,
    repositoryRoot: root,
    sourceRelativePath: `${mediaDirectory}/${item.file}`,
    ...(generationEvidence ? { generationEvidence } : {}),
  };
}

export function publicMediaHashInput(input: SourceMediaBuildInput): object {
  return {
    ...input.publicMedia,
    provenanceUrl: input.provenanceUrl,
    role: input.role,
    ...(input.generationEvidence ? { generationEvidence: input.generationEvidence } : {}),
  };
}

export async function buildResponsiveMedia(
  input: SourceMediaBuildInput,
  releaseRoot: string,
): Promise<ReleaseMediaAsset> {
  const sourceBytes = await readAllowlistedRegularFile(input.repositoryRoot, input.sourceRelativePath);
  if (checksum(sourceBytes) !== input.publicMedia.checksum) {
    throw new Error(`${input.collection}/${input.recordId}/${input.publicMedia.id}: source checksum changed`);
  }

  const fallbackPath = publicAssetPath(releaseRoot, input.publicMedia.src);
  await mkdir(dirname(fallbackPath), { recursive: true });
  await writeFile(fallbackPath, sourceBytes);

  const widths = responsiveWidths(input.role, input.publicMedia.width);
  const modernSources: ReleaseMediaSource[] = [];
  for (const format of ['avif', 'webp'] as const) {
    const candidates: ReleaseMediaCandidate[] = [];
    for (const width of widths) {
      candidates.push(await writeGeneratedCandidate(
        releaseRoot,
        sourceBytes,
        variantHref(input.publicMedia.src, `${width}w`, format),
        width,
        format,
      ));
    }
    modernSources.push({ type: `image/${format}`, candidates });
  }

  const fallbackCandidates: ReleaseMediaCandidate[] = [];
  for (const width of widths) {
    if (width === input.publicMedia.width) {
      fallbackCandidates.push({
        src: input.publicMedia.src,
        width: input.publicMedia.width,
        height: input.publicMedia.height,
        checksum: input.publicMedia.checksum,
      });
    } else {
      fallbackCandidates.push(await writeGeneratedCandidate(
        releaseRoot,
        sourceBytes,
        variantHref(input.publicMedia.src, `${width}w.source`, input.publicMedia.format),
        width,
        input.publicMedia.format,
      ));
    }
  }

  return {
    id: input.publicMedia.id,
    collection: input.collection,
    recordId: input.recordId,
    kind: input.publicMedia.kind,
    alt: input.publicMedia.alt,
    ...(input.publicMedia.caption ? { caption: input.publicMedia.caption } : {}),
    credit: input.publicMedia.credit,
    provenanceUrl: input.provenanceUrl,
    verifiedAt: input.publicMedia.verifiedAt,
    rightsNote: input.publicMedia.rightsNote,
    width: input.publicMedia.width,
    height: input.publicMedia.height,
    sourceChecksum: input.publicMedia.checksum,
    ...(input.generationEvidence ? { generationEvidence: input.generationEvidence } : {}),
    sources: modernSources,
    fallback: {
      src: input.publicMedia.src,
      format: input.publicMedia.format as VerifiableSourceInputFormat,
      checksum: input.publicMedia.checksum,
      candidates: fallbackCandidates,
    },
  };
}
