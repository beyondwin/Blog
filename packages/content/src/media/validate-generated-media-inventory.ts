import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';
import {
  readAllowlistedDirectory,
  readAllowlistedRegularFile,
  readAllowlistedTextFile,
} from '../allowlisted-source-file';
import {
  generatedMediaDecisionManifestSchema,
  generatedMediaRightsNote,
  sourceCollections,
  sourceMediaManifestSchema,
  type GeneratedMediaDecisionManifest,
  type SourceMediaManifest,
} from '../schemas';
import {
  assertGeneratedMediaRegistrySelections,
  GENERATED_MEDIA_APPROVAL_REGISTRY_PATH,
  generatedMediaContactSheetPath,
  parseGeneratedMediaApprovalRegistry,
  type GeneratedMediaApprovalRegistry,
} from './generated-media-approval-registry.mjs';

const evidenceRoot = 'docs/notes/project/assets/form-and-thought-generated';
const assetRoot = 'src/assets/content';
const canonicalId = /^[a-z0-9][a-z0-9-]*$/;

type MediaItem = SourceMediaManifest['items'][number];
type ApprovedAsset = GeneratedMediaDecisionManifest['assets'][number];

interface SourceEntry {
  collection: (typeof sourceCollections)[number];
  recordId: string;
  manifestPath: string;
  item: MediaItem;
  sourcePath: string;
}

interface ApprovedEntry {
  asset: ApprovedAsset;
  decision: GeneratedMediaDecisionManifest;
  decisionPath: string;
  decisionChecksum: string;
}

export interface ApprovedGeneratedMediaSelection {
  collection: SourceEntry['collection'];
  recordId: string;
  mediaId: string;
}

function checksum(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function claimKey(decisionPath: string, candidateId: string): string {
  return `${decisionPath}\0${candidateId}`;
}

async function optionalDirectory(root: string, path: string) {
  try {
    return await readAllowlistedDirectory(root, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function loadRequiredRegistry(root: string): Promise<GeneratedMediaApprovalRegistry> {
  let source: string;
  try {
    source = await readAllowlistedTextFile(root, GENERATED_MEDIA_APPROVAL_REGISTRY_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${GENERATED_MEDIA_APPROVAL_REGISTRY_PATH}: generated media approval registry is missing`);
    }
    throw error;
  }
  return parseGeneratedMediaApprovalRegistry(source, GENERATED_MEDIA_APPROVAL_REGISTRY_PATH);
}

async function discoverApproved(
  root: string,
  registry: GeneratedMediaApprovalRegistry,
): Promise<Map<string, ApprovedEntry>> {
  const approved = new Map<string, ApprovedEntry>();
  const registeredByPath = new Map(registry.batches.map((batch) => [batch.decisionManifest, batch]));

  for (const registered of registry.batches) {
    let decisionBytes: Buffer;
    try {
      decisionBytes = await readAllowlistedRegularFile(root, registered.decisionManifest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`required generated approval batch ${registered.batchId}: decision manifest is missing`);
      }
      throw error;
    }
    const decisionChecksum = checksum(decisionBytes);
    if (decisionChecksum !== registered.decisionManifestChecksum) {
      throw new Error(`required generated approval batch ${registered.batchId}: decision manifest checksum changed`);
    }
    const decision = generatedMediaDecisionManifestSchema.parse(parseYaml(decisionBytes.toString('utf8')));
    if (decision.batchId !== registered.batchId) {
      throw new Error(`required generated approval batch ${registered.batchId}: decision batchId does not match the registry`);
    }
    if (decision.approval.state !== 'approved') {
      throw new Error(`required generated approval batch ${registered.batchId}: approval must be approved`);
    }
    if (decision.approvedContactSheet.path !== generatedMediaContactSheetPath(
      registered.decisionManifest,
      registered.batchId,
    )) {
      throw new Error(`required generated approval batch ${registered.batchId}: approved contact sheet path does not match the registered decision path`);
    }
    assertGeneratedMediaRegistrySelections(registered, decision.assets);
    for (const asset of decision.assets) {
      const key = claimKey(registered.decisionManifest, asset.candidateId);
      approved.set(key, {
        asset,
        decision,
        decisionPath: registered.decisionManifest,
        decisionChecksum,
      });
    }
  }

  const evidenceEntries = await optionalDirectory(root, evidenceRoot);
  const unsafeEvidenceEntry = evidenceEntries.find((entry) => entry.isSymbolicLink());
  if (unsafeEvidenceEntry) throw new Error(`${evidenceRoot}/${unsafeEvidenceEntry.name}: generated evidence must not be a symbolic link`);
  const batches = evidenceEntries
    .filter((entry) => entry.isDirectory() && entry.name !== 'articles' && canonicalId.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const batch of batches) {
    const decisionPath = `${evidenceRoot}/${batch.name}/decision-manifest.yml`;
    if (!registeredByPath.has(decisionPath)) {
      throw new Error(`unregistered generated approval batch ${batch.name}: ${decisionPath}`);
    }
    let decisionBytes: Buffer;
    try {
      decisionBytes = await readAllowlistedRegularFile(root, decisionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`${decisionPath}: canonical generated decision manifest is missing`);
      }
      throw error;
    }
    if (checksum(decisionBytes) !== registeredByPath.get(decisionPath)?.decisionManifestChecksum) {
      throw new Error(`required generated approval batch ${batch.name}: decision manifest checksum changed`);
    }
  }

  const articleEvidenceEntries = await optionalDirectory(root, `${evidenceRoot}/articles`);
  const unsafeArticleEvidence = articleEvidenceEntries.find((entry) => entry.isSymbolicLink());
  if (unsafeArticleEvidence) {
    throw new Error(`${evidenceRoot}/articles/${unsafeArticleEvidence.name}: generated evidence must not be a symbolic link`);
  }
  const articleDecisions = articleEvidenceEntries
    .filter((entry) => entry.isFile() && /^decision-manifest-[a-z0-9][a-z0-9-]*\.yml$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const decision of articleDecisions) {
    const decisionPath = `${evidenceRoot}/articles/${decision.name}`;
    const batchId = decision.name.slice('decision-manifest-'.length, -'.yml'.length);
    if (!registeredByPath.has(decisionPath)) {
      throw new Error(`unregistered generated approval batch ${batchId}: ${decisionPath}`);
    }
    const decisionBytes = await readAllowlistedRegularFile(root, decisionPath);
    if (checksum(decisionBytes) !== registeredByPath.get(decisionPath)?.decisionManifestChecksum) {
      throw new Error(`required generated approval batch ${batchId}: decision manifest checksum changed`);
    }
  }
  return approved;
}

async function discoverSourceEntries(root: string): Promise<SourceEntry[]> {
  const entries: SourceEntry[] = [];
  for (const collection of sourceCollections) {
    const collectionEntries = await optionalDirectory(root, `${assetRoot}/${collection}`);
    const unsafeRecord = collectionEntries.find((entry) => entry.isSymbolicLink());
    if (unsafeRecord) throw new Error(`${assetRoot}/${collection}/${unsafeRecord.name}: media record must not be a symbolic link`);
    const records = collectionEntries
      .filter((entry) => entry.isDirectory() && canonicalId.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const record of records) {
      const manifestPath = `${assetRoot}/${collection}/${record.name}/media.yml`;
      let source: string;
      try {
        source = await readAllowlistedTextFile(root, manifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const manifest = sourceMediaManifestSchema.parse(parseYaml(source));
      for (const item of manifest.items) {
        entries.push({
          collection,
          recordId: record.name,
          manifestPath,
          item,
          sourcePath: `${assetRoot}/${collection}/${record.name}/${item.file}`,
        });
      }
    }
  }
  return entries;
}

function assertExactSource(entry: SourceEntry, approved: ApprovedEntry): void {
  const { asset } = approved;
  const label = `approved generated asset ${asset.collection}/${asset.recordId}/${asset.mediaId}`;
  if (entry.item.sourceKind !== 'repository-generated' || !entry.item.generation) {
    throw new Error(`${label}: source media must remain repository-generated with generation binding`);
  }
  const exact = {
    collection: entry.collection,
    recordId: entry.recordId,
    mediaId: entry.item.id,
    file: entry.item.file,
    sourcePath: entry.sourcePath,
    checksum: entry.item.checksum,
    width: entry.item.width,
    height: entry.item.height,
  };
  for (const field of ['collection', 'recordId', 'mediaId', 'file', 'sourcePath', 'checksum', 'width', 'height'] as const) {
    if (asset[field] !== exact[field]) throw new Error(`${label}: ${field} does not match the approved inventory`);
  }
  if (entry.item.sourcePath !== approved.decisionPath) {
    throw new Error(`${label}: source decision path does not match the approved inventory`);
  }
  if (entry.item.rightsNote !== generatedMediaRightsNote(approved.decision.rightsReview)) {
    throw new Error(`${label}: rightsNote does not match the approved decision`);
  }
  const generation = entry.item.generation;
  if (generation.candidateId !== asset.candidateId) {
    throw new Error(`${label}: generated candidate does not match the approved decision`);
  }
  if (generation.decisionManifestChecksum !== approved.decisionChecksum) {
    throw new Error(`${label}: decision manifest checksum changed`);
  }
  for (const field of ['provider', 'generator', 'model', 'modelVersion', 'promptVersion'] as const) {
    if (generation[field] !== approved.decision.generator[field]) {
      throw new Error(`${label}: generation ${field} does not match the approved decision`);
    }
  }
}

async function assertSourceFile(root: string, approved: ApprovedEntry): Promise<void> {
  const { asset } = approved;
  const label = `approved generated asset ${asset.collection}/${asset.recordId}/${asset.mediaId}`;
  let bytes: Buffer;
  try {
    bytes = await readAllowlistedRegularFile(root, asset.sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${label}: source file is missing`);
    throw error;
  }
  if (checksum(bytes) !== asset.checksum) throw new Error(`${label}: source file checksum does not match the approved inventory`);
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    throw new Error(`${label}: source file dimensions do not match the approved inventory`);
  }
}

export async function validateGeneratedMediaInventory(root: string): Promise<ApprovedGeneratedMediaSelection[]> {
  const registry = await loadRequiredRegistry(root);
  const approved = await discoverApproved(root, registry);
  const sources = await discoverSourceEntries(root);
  const expectedByIdentity = new Map<string, ApprovedEntry>();
  const approvedPaths = new Map<string, ApprovedEntry>();
  for (const entry of approved.values()) {
    const identity = `${entry.asset.collection}/${entry.asset.recordId}/${entry.asset.mediaId}`;
    if (expectedByIdentity.has(identity)) throw new Error(`${identity}: selected by more than one approved generated decision`);
    expectedByIdentity.set(identity, entry);
    if (approvedPaths.has(entry.asset.sourcePath)) throw new Error(`${entry.asset.sourcePath}: selected by more than one approved generated decision`);
    approvedPaths.set(entry.asset.sourcePath, entry);
  }

  const claims = new Map<string, SourceEntry[]>();
  for (const source of sources) {
    const identity = `${source.collection}/${source.recordId}/${source.item.id}`;
    const expected = expectedByIdentity.get(identity);
    if (expected) assertExactSource(source, expected);

    const pathOwner = approvedPaths.get(source.sourcePath);
    if (pathOwner && expected !== pathOwner) {
      const kind = source.item.sourceKind === 'repository-generated' ? 'generated media' : 'ordinary media';
      throw new Error(`${kind} ${identity} reuses approved generated source path ${source.sourcePath}`);
    }

    if (source.item.generation && source.item.sourcePath) {
      const key = claimKey(source.item.sourcePath, source.item.generation.candidateId);
      const candidates = claims.get(key) ?? [];
      candidates.push(source);
      claims.set(key, candidates);
      if (!approved.has(key)) {
        throw new Error(`${identity}: generated candidate ${source.item.generation.candidateId} is not in an approved decision inventory`);
      }
    }
  }

  for (const [key, entry] of approved) {
    const identity = `${entry.asset.collection}/${entry.asset.recordId}/${entry.asset.mediaId}`;
    const source = sources.find((candidate) => (
      candidate.collection === entry.asset.collection
      && candidate.recordId === entry.asset.recordId
      && candidate.item.id === entry.asset.mediaId
    ));
    if (!source) throw new Error(`approved generated asset ${identity}: source media record is missing`);
    const claimed = claims.get(key) ?? [];
    if (claimed.length > 1) {
      throw new Error(`${entry.decisionPath}: generated candidate ${entry.asset.candidateId} is claimed more than once`);
    }
    if (claimed.length !== 1 || claimed[0] !== source) {
      throw new Error(`approved generated asset ${identity}: generation binding is missing`);
    }
    await assertSourceFile(root, entry);
  }
  return [...expectedByIdentity.values()]
    .map(({ asset }) => ({ collection: asset.collection, recordId: asset.recordId, mediaId: asset.mediaId }))
    .sort((left, right) => (
      `${left.collection}/${left.recordId}/${left.mediaId}`
        .localeCompare(`${right.collection}/${right.recordId}/${right.mediaId}`)
    ));
}
