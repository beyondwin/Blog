import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { parse as parseYaml } from 'yaml';
import { parseMediaManifest } from '../src/lib/content/mediaManifest.mjs';
import {
  assertGeneratedMediaRegistrySelections,
  GENERATED_MEDIA_APPROVAL_REGISTRY_PATH,
  parseGeneratedMediaApprovalRegistry,
} from '../packages/content/src/media/generated-media-approval-registry.mjs';
import {
  assertRegisteredReviewCoverApproval,
  canonicalReviewCoverDecisionPath,
  parseReviewCoverApprovalRegistry,
  REVIEW_COVER_APPROVAL_REGISTRY_PATH,
  reviewCoverRedistributionDecisionSchema,
} from '../packages/content/src/media/review-cover-redistribution.mjs';

const contentExtensions = new Set(['.md', '.mdx']);
const rasterExtensions = new Set(['.jpg', '.jpeg', '.png']);
const mediaReferenceFields = ['coverMedia', 'featuredMedia', 'leadMedia'];
const requiredMediaFields = ['alt', 'credit', 'verifiedAt', 'rightsNote'];

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function scanTree(directory) {
  const files = [];
  const symlinks = [];

  async function walk(currentDirectory, checkRoot = false) {
    try {
      if (checkRoot) {
        const rootInfo = await lstat(currentDirectory);
        if (rootInfo.isSymbolicLink()) {
          symlinks.push(currentDirectory);
          return;
        }
        if (!rootInfo.isDirectory()) return;
      }

      const entries = await readdir(currentDirectory, { withFileTypes: true });
      entries.sort((left, right) => compare(left.name, right.name));

      for (const entry of entries) {
        const path = join(currentDirectory, entry.name);
        if (entry.isSymbolicLink()) {
          symlinks.push(path);
        } else if (entry.isDirectory()) {
          await walk(path);
        } else if (entry.isFile()) {
          files.push(path);
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  await walk(directory, true);
  return { files: files.sort(compare), symlinks: symlinks.sort(compare) };
}

function repoPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function contentSlug(root, path) {
  const relativePath = repoPath(join(root, 'src', 'content'), path);
  return relativePath.slice(0, -extname(relativePath).length);
}

function expectedManifestPath(root, contentPath) {
  return join(root, 'src', 'assets', 'content', contentSlug(root, contentPath), 'media.yml');
}

function hasRemoteImageHotlink(body) {
  const markdownImage = /!\[[^\]]*\]\(\s*<?https?:\/\//i;
  const htmlImage = /<img\b[^>]*\bsrc\s*=\s*(?:["']\s*)?https?:\/\//i;
  return markdownImage.test(body) || htmlImage.test(body);
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(signature)) return null;

  let dimensions = null;
  let hasIdat = false;
  let offset = 8;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return null;
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) return null;

    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    if (crc32(bytes.subarray(offset + 4, dataEnd)) !== expectedCrc) return null;

    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) return null;
      dimensions = { width: bytes.readUInt32BE(dataStart), height: bytes.readUInt32BE(dataStart + 4) };
    } else if (type === 'IHDR') {
      return null;
    } else if (type === 'IDAT') {
      hasIdat = true;
    } else if (type === 'IEND') {
      if (length !== 0 || !hasIdat || chunkEnd !== bytes.length) return null;
      return dimensions;
    }

    offset = chunkEnd;
  }

  return null;
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  let dimensions = null;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) return dimensions;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xda) {
      return dimensions && bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
        ? dimensions
        : null;
    }
    if (offset + 2 > bytes.length) return null;

    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7) return null;
      dimensions = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }

  return null;
}

function rasterDimensions(bytes, extension) {
  if (extension === '.png') return pngDimensions(bytes);
  if (extension === '.jpg' || extension === '.jpeg') return jpegDimensions(bytes);
  return null;
}

async function inspectRepositoryFile(root, path, allowedRoot) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return 'symlink';
    if (!info.isFile()) return 'missing';
    const resolved = await realpath(path);
    if (!isInside(root, resolved) || !isInside(allowedRoot, resolved)) return 'outside';
    return (await stat(resolved)).isFile() ? 'ok' : 'missing';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function retainContainedFiles(root, paths, allowedRoot, errors) {
  const retained = [];
  const allowedPath = repoPath(root, allowedRoot);

  for (const path of paths) {
    const fileState = await inspectRepositoryFile(root, path, allowedRoot);
    if (fileState === 'ok') {
      retained.push(path);
    } else if (fileState === 'symlink') {
      errors.add(`${repoPath(root, path)}: symbolic link is not allowed`);
    } else if (fileState === 'outside') {
      errors.add(`${repoPath(root, path)}: file resolves outside ${allowedPath}`);
    } else {
      errors.add(`${repoPath(root, path)}: file does not exist`);
    }
  }

  return retained;
}

function inspectRawManifest(raw, manifestPath, errors, checksumDeclarations) {
  if (!raw || !Array.isArray(raw.items)) return;

  const ids = new Map();
  raw.items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const label = typeof item.id === 'string' && item.id ? `"${item.id}"` : `at index ${index}`;

    for (const field of requiredMediaFields) {
      if (typeof item[field] !== 'string' || item[field].trim() === '') {
        errors.add(`${manifestPath}: media item ${label} is missing required field "${field}"`);
      }
    }
    if (!item.sourceUrl && !item.sourcePath) {
      errors.add(`${manifestPath}: media item ${label} is missing required field "source"`);
    }

    if (typeof item.id === 'string') {
      const count = ids.get(item.id) ?? 0;
      ids.set(item.id, count + 1);
    }
    if (typeof item.checksum === 'string' && typeof item.id === 'string') {
      const declarations = checksumDeclarations.get(item.checksum) ?? [];
      declarations.push({ id: item.id, manifestPath });
      checksumDeclarations.set(item.checksum, declarations);
    }
  });

  for (const [id, count] of ids) {
    if (count > 1) errors.add(`${manifestPath}: duplicate media id "${id}"`);
  }
}

async function loadPublicMemorySlugs(root, errors) {
  const path = join(root, 'src', 'data', 'memory.public.json');
  try {
    const fileState = await inspectRepositoryFile(root, path, join(root, 'src', 'data'));
    if (fileState === 'symlink') {
      errors.add('src/data/memory.public.json: symbolic link is not allowed');
      return new Set();
    }
    if (fileState === 'outside') {
      errors.add('src/data/memory.public.json: file resolves outside src/data');
      return new Set();
    }
    if (fileState === 'missing') return new Set();
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return new Set((Array.isArray(parsed?.thoughts) ? parsed.thoughts : [])
      .map((thought) => thought?.slug)
      .filter((slug) => typeof slug === 'string' && slug.length > 0)
      .map((slug) => `memory/${slug}`));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    errors.add(`src/data/memory.public.json: ${error instanceof Error ? error.message : String(error)}`);
    return new Set();
  }
}

async function validateManifest(root, absolutePath, state) {
  const manifestPath = repoPath(root, absolutePath);
  let source;
  let raw;
  try {
    source = await readFile(absolutePath, 'utf8');
    raw = parseYaml(source);
  } catch (error) {
    state.errors.add(`${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  inspectRawManifest(raw, manifestPath, state.errors, state.checksumDeclarations);

  let manifest;
  try {
    manifest = parseMediaManifest(source, manifestPath);
  } catch (error) {
    state.errors.add(error instanceof Error ? error.message : `${manifestPath}: ${String(error)}`);
    return;
  }

  const manifestDirectory = await realpath(resolve(absolutePath, '..'));
  state.manifests.set(absolutePath, manifest);
  const reviewManifest = manifestPath.match(
    /^src\/assets\/content\/reviews\/([a-z0-9][a-z0-9-]*)\/media\.yml$/,
  );

  for (const item of manifest.items) {
    const assetPath = resolve(manifestDirectory, item.file);
    const assetRepoPath = repoPath(root, assetPath);
    if (!isInside(manifestDirectory, assetPath) || !isInside(root, assetPath)) {
      state.errors.add(`${manifestPath}: media file "${item.file}" escapes its manifest directory`);
      continue;
    }
    state.declaredAssets.add(assetPath);

    const assetState = await inspectRepositoryFile(root, assetPath, manifestDirectory);
    if (assetState === 'symlink') {
      state.errors.add(`${assetRepoPath}: symbolic link is not allowed`);
      continue;
    }
    if (assetState === 'outside') {
      state.errors.add(`${assetRepoPath}: media file resolves outside its manifest directory`);
      continue;
    }
    if (assetState === 'missing') {
      state.errors.add(`${assetRepoPath}: media file does not exist or resolves outside the repository`);
      continue;
    }

    const bytes = await readFile(assetPath);
    if (sha256(bytes) !== item.checksum) {
      state.errors.add(`${assetRepoPath}: checksum does not match media.yml`);
    }

    const extension = extname(item.file).toLowerCase();
    let actualDimensions = null;
    if (rasterExtensions.has(extension)) {
      const dimensions = rasterDimensions(bytes, extension);
      actualDimensions = dimensions;
      if (!dimensions) {
        state.errors.add(`${assetRepoPath}: cannot read ${extension.slice(1).toUpperCase()} dimensions from file header`);
      } else if (dimensions.width === 0 || dimensions.height === 0) {
        state.errors.add(`${assetRepoPath}: raster dimensions must be greater than zero`);
      } else {
        if (item.width !== undefined && item.height !== undefined
          && (dimensions.width !== item.width || dimensions.height !== item.height)) {
          state.errors.add(`${assetRepoPath}: raster dimensions ${dimensions.width}x${dimensions.height} do not match media.yml ${item.width}x${item.height}`);
        }
        if (item.kind === 'book-cover' && dimensions.width < 300) {
          state.errors.add(`${assetRepoPath}: book cover width ${dimensions.width}px is below 300px`);
        }
        if (dimensions.width * dimensions.height > 12_000_000) {
          state.errors.add(`${assetRepoPath}: raster dimensions ${dimensions.width}x${dimensions.height} exceed 12 megapixels`);
        }
      }
    }

    let redistributionApproved = false;
    if (item.redistributionApproval) {
      const recordId = reviewManifest?.[1];
      const label = `${manifestPath}: media item ${item.id}`;
      if (!recordId || item.kind !== 'book-cover') {
        state.errors.add(`${label}: redistribution approval is only valid for review book-cover media`);
      } else {
        const receipt = item.redistributionApproval;
        const expectedDecisionPath = canonicalReviewCoverDecisionPath(recordId);
        if (receipt.decisionDocument !== expectedDecisionPath) {
          state.errors.add(`${label}: redistribution decision document must use the canonical record path`);
        } else {
          const decisionPath = resolve(root, receipt.decisionDocument);
          if (!isInside(root, decisionPath) || await inspectRepositoryFile(root, decisionPath, root) !== 'ok') {
            state.errors.add(`${label}: redistribution decision document is missing`);
          } else {
            try {
              const decisionBytes = await readFile(decisionPath);
              if (sha256(decisionBytes) !== receipt.decisionChecksum) {
                state.errors.add(`${label}: redistribution decision checksum changed`);
              } else {
                const decision = reviewCoverRedistributionDecisionSchema.parse(parseYaml(decisionBytes.toString('utf8')));
                if (decision.state !== 'approved' || decision.decision !== 'approve-public-redistribution') {
                  state.errors.add(`${label}: redistribution decision must be approved for public redistribution`);
                } else {
                  const expectedAsset = {
                    path: assetRepoPath,
                    checksum: item.checksum,
                    width: item.width ?? actualDimensions?.width,
                    height: item.height ?? actualDimensions?.height,
                    kind: 'book-cover',
                  };
                  const mismatched = ['path', 'checksum', 'width', 'height', 'kind']
                    .find((field) => decision.asset[field] !== expectedAsset[field]);
                  if (decision.recordId !== recordId || decision.mediaId !== item.id) {
                    state.errors.add(`${label}: redistribution decision identity does not match the review cover`);
                  } else if (mismatched) {
                    state.errors.add(`${label}: asset ${mismatched} does not match the approved redistribution decision`);
                  } else if (decision.edition.isbn13 !== item.isbn13) {
                    state.errors.add(`${label}: edition isbn13 does not match the approved redistribution decision`);
                  } else if (decision.edition.label !== item.edition) {
                    state.errors.add(`${label}: edition label does not match the approved redistribution decision`);
                  } else {
                    try {
                      assertRegisteredReviewCoverApproval(state.reviewCoverApprovalRegistry, {
                        collection: 'reviews',
                        recordId,
                        mediaId: item.id,
                        decisionDocument: receipt.decisionDocument,
                        decisionChecksum: sha256(decisionBytes),
                        source: {
                          path: expectedAsset.path,
                          checksum: expectedAsset.checksum,
                          width: expectedAsset.width,
                          height: expectedAsset.height,
                          kind: expectedAsset.kind,
                          isbn13: decision.edition.isbn13,
                          edition: decision.edition.label,
                          sourceUrl: item.sourceUrl,
                          verifiedAt: item.verifiedAt,
                        },
                      });
                      redistributionApproved = true;
                    } catch (error) {
                      state.errors.add(error instanceof Error ? error.message : String(error));
                    }
                  }
                }
              }
            } catch (error) {
              state.errors.add(`${label}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
    }

    if (item.sourcePath) {
      const sourcePath = resolve(root, item.sourcePath);
      if (!isInside(root, sourcePath) || await inspectRepositoryFile(root, sourcePath, root) !== 'ok') {
        state.errors.add(`${manifestPath}: sourcePath "${item.sourcePath}" does not exist`);
      }
    } else if (item.sourceUrl && item.rightsNote.trim() && !redistributionApproved) {
      state.warnings.add(`${assetRepoPath}: redistribution rights are not independently verified`);
    }
  }
}

async function loadReviewCoverApprovalRegistry(root, state) {
  const registryPath = join(root, ...REVIEW_COVER_APPROVAL_REGISTRY_PATH.split('/'));
  try {
    if (await inspectRepositoryFile(root, registryPath, root) !== 'ok') {
      state.errors.add(`${REVIEW_COVER_APPROVAL_REGISTRY_PATH}: review cover approval registry is missing`);
      return { version: 1, approvals: [] };
    }
    return parseReviewCoverApprovalRegistry(
      await readFile(registryPath, 'utf8'),
      REVIEW_COVER_APPROVAL_REGISTRY_PATH,
    );
  } catch (error) {
    state.errors.add(error instanceof Error ? error.message : String(error));
    return { version: 1, approvals: [] };
  }
}

async function validateReviewCoverApprovalInventory(root, state) {
  const registry = state.reviewCoverApprovalRegistry;
  const registeredPaths = new Set(registry.approvals.map((entry) => entry.decisionDocument));
  const evidenceRoot = join(root, 'docs', 'notes', 'project', 'assets', 'review-cover-rights');
  const evidenceTree = await scanTree(evidenceRoot);
  for (const path of evidenceTree.symlinks) {
    state.errors.add(`${repoPath(root, path)}: symbolic link is not allowed`);
  }
  for (const absolutePath of evidenceTree.files) {
    const decisionPath = repoPath(root, absolutePath);
    if (
      /^docs\/notes\/project\/assets\/review-cover-rights\/[a-z0-9][a-z0-9-]*\/redistribution-decision\.yml$/.test(decisionPath)
      && !registeredPaths.has(decisionPath)
    ) {
      state.errors.add(`unregistered review cover decision evidence: ${decisionPath}`);
    }
  }

  for (const registered of registry.approvals) {
    const decisionPath = resolve(root, registered.decisionDocument);
    if (!isInside(root, decisionPath) || await inspectRepositoryFile(root, decisionPath, root) !== 'ok') {
      state.errors.add(`${registered.decisionDocument}: registered review cover decision is missing`);
      continue;
    }
    if (sha256(await readFile(decisionPath)) !== registered.decisionChecksum) {
      state.errors.add(`${registered.decisionDocument}: registry decision checksum must match the committed decision`);
    }
    const manifestPath = resolve(root, dirname(registered.source.path), 'media.yml');
    const manifest = state.manifests.get(manifestPath);
    const item = manifest?.items.find((candidate) => candidate.id === registered.mediaId);
    if (!item) {
      state.errors.add(`${registered.collection}/${registered.recordId}/${registered.mediaId}: registered review cover source media is missing`);
    } else if (
      item.redistributionApproval?.decisionDocument !== registered.decisionDocument
      || item.redistributionApproval?.decisionChecksum !== registered.decisionChecksum
    ) {
      state.errors.add(`${registered.collection}/${registered.recordId}/${registered.mediaId}: registered review cover receipt does not match the approval registry`);
    }
  }
}

function generatedClaimKey(decisionPath, candidateId) {
  return `${decisionPath}\0${candidateId}`;
}

function sourceEntries(root, state) {
  const entries = [];
  for (const [manifestAbsolutePath, manifest] of state.manifests) {
    const match = repoPath(root, manifestAbsolutePath).match(
      /^src\/assets\/content\/(analysis|articles|ideas|reviews|travel|thoughts)\/([a-z0-9][a-z0-9-]*)\/media\.yml$/,
    );
    if (!match) continue;
    for (const item of manifest.items) {
      entries.push({
        collection: match[1],
        recordId: match[2],
        item,
        sourcePath: repoPath(root, resolve(dirname(manifestAbsolutePath), item.file)),
      });
    }
  }
  return entries;
}

function decisionShapeErrors(decision, decisionPath, batchId) {
  const errors = [];
  if (!decision || typeof decision !== 'object' || decision.version !== 1) {
    return [`${decisionPath}: generated decision manifest must use version 1`];
  }
  if (decision.batchId !== batchId) errors.push(`${decisionPath}: batchId must match its canonical evidence directory`);
  if (!decision.approval || typeof decision.approval !== 'object') {
    errors.push(`${decisionPath}: approval is required`);
    return errors;
  }
  if (decision.approval.state !== 'approved') return errors;
  const roles = Array.isArray(decision.approval.approvedBy) ? decision.approval.approvedBy : [];
  if (
    roles.length !== 2
    || new Set(roles).size !== roles.length
    || !roles.includes('controller')
    || !roles.includes('independent-visual-reviewer')
  ) {
    errors.push(`${decisionPath}: approvedBy must contain exactly controller and independent-visual-reviewer`);
  }
  const selected = Array.isArray(decision.approval.selectedCandidateIds)
    ? decision.approval.selectedCandidateIds
    : [];
  const assets = Array.isArray(decision.assets) ? decision.assets : [];
  const assetIds = assets.map((asset) => asset?.candidateId);
  if (
    selected.length === 0
    || assets.length === 0
    || selected.length !== new Set(selected).size
    || assetIds.length !== new Set(assetIds).size
    || selected.length !== assetIds.length
    || selected.some((candidateId) => !assetIds.includes(candidateId))
  ) {
    errors.push(`${decisionPath}: approved selection must exactly match unique approved assets`);
  }
  const expectedContact = `docs/notes/project/assets/form-and-thought-generated/${batchId}/approved-contact-sheet.png`;
  if (decision.approvedContactSheet?.path !== expectedContact) {
    errors.push(`${decisionPath}: approvedContactSheet path must be the canonical PNG in the same batch`);
  }
  return errors;
}

async function validateGeneratedInventory(root, state) {
  const registryPath = join(root, ...GENERATED_MEDIA_APPROVAL_REGISTRY_PATH.split('/'));
  let registry;
  try {
    if (await inspectRepositoryFile(root, registryPath, root) !== 'ok') {
      state.errors.add(`${GENERATED_MEDIA_APPROVAL_REGISTRY_PATH}: generated media approval registry is missing`);
      return;
    }
    registry = parseGeneratedMediaApprovalRegistry(
      await readFile(registryPath, 'utf8'),
      GENERATED_MEDIA_APPROVAL_REGISTRY_PATH,
    );
  } catch (error) {
    state.errors.add(error instanceof Error ? error.message : String(error));
    return;
  }

  const evidenceRoot = join(root, 'docs', 'notes', 'project', 'assets', 'form-and-thought-generated');
  const evidenceTree = await scanTree(evidenceRoot);
  for (const path of evidenceTree.symlinks) {
    state.errors.add(`${repoPath(root, path)}: symbolic link is not allowed`);
  }
  const approved = new Map();
  const registeredByPath = new Map(registry.batches.map((batch) => [batch.decisionManifest, batch]));

  for (const registered of registry.batches) {
    const absolutePath = resolve(root, registered.decisionManifest);
    let bytes;
    let decision;
    if (!isInside(root, absolutePath) || await inspectRepositoryFile(root, absolutePath, root) !== 'ok') {
      state.errors.add(`required generated approval batch ${registered.batchId}: decision manifest is missing`);
      continue;
    }
    try {
      bytes = await readFile(absolutePath);
      if (sha256(bytes) !== registered.decisionManifestChecksum) {
        state.errors.add(`required generated approval batch ${registered.batchId}: decision manifest checksum changed`);
        continue;
      }
      decision = parseYaml(bytes.toString('utf8'));
    } catch (error) {
      state.errors.add(`${registered.decisionManifest}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const shapeErrors = decisionShapeErrors(decision, registered.decisionManifest, registered.batchId);
    for (const error of shapeErrors) state.errors.add(error);
    if (shapeErrors.length > 0 || decision.approval?.state !== 'approved') continue;
    try {
      assertGeneratedMediaRegistrySelections(registered, decision.assets);
    } catch (error) {
      state.errors.add(error instanceof Error ? error.message : String(error));
      continue;
    }

    const decisionChecksum = sha256(bytes);
    for (const asset of decision.assets) {
      approved.set(generatedClaimKey(registered.decisionManifest, asset.candidateId), {
        asset,
        decision,
        decisionPath: registered.decisionManifest,
        decisionChecksum,
      });
    }
    const contactPath = resolve(root, decision.approvedContactSheet.path);
    if (!isInside(root, contactPath) || await inspectRepositoryFile(root, contactPath, root) !== 'ok') {
      state.errors.add(`${registered.decisionManifest}: approved contact sheet is missing`);
    } else if (sha256(await readFile(contactPath)) !== decision.approvedContactSheet.checksum) {
      state.errors.add(`${registered.decisionManifest}: approved contact sheet checksum changed`);
    }
  }

  for (const absolutePath of evidenceTree.files) {
    const decisionPath = repoPath(root, absolutePath);
    const match = decisionPath.match(
      /^docs\/notes\/project\/assets\/form-and-thought-generated\/([a-z0-9][a-z0-9-]*)\/decision-manifest\.yml$/,
    );
    if (!match) continue;
    if (!registeredByPath.has(decisionPath)) {
      state.errors.add(`unregistered generated approval batch ${match[1]}: ${decisionPath}`);
    }
  }

  const entries = sourceEntries(root, state);
  const expectedByIdentity = new Map();
  const approvedPaths = new Map();
  for (const entry of approved.values()) {
    const identity = `${entry.asset.collection}/${entry.asset.recordId}/${entry.asset.mediaId}`;
    if (expectedByIdentity.has(identity)) state.errors.add(`${identity}: selected by more than one approved generated decision`);
    expectedByIdentity.set(identity, entry);
    if (approvedPaths.has(entry.asset.sourcePath)) {
      state.errors.add(`${entry.asset.sourcePath}: selected by more than one approved generated decision`);
    }
    approvedPaths.set(entry.asset.sourcePath, entry);
  }

  const claims = new Map();
  for (const source of entries) {
    const identity = `${source.collection}/${source.recordId}/${source.item.id}`;
    const expected = expectedByIdentity.get(identity);
    if (expected) {
      const label = `approved generated asset ${identity}`;
      if (source.item.sourceKind !== 'repository-generated' || !source.item.generation) {
        state.errors.add(`${label}: source media must remain repository-generated with generation binding`);
      } else {
        const actual = {
          collection: source.collection,
          recordId: source.recordId,
          mediaId: source.item.id,
          file: source.item.file,
          sourcePath: source.sourcePath,
          checksum: source.item.checksum,
          width: source.item.width,
          height: source.item.height,
        };
        for (const field of ['collection', 'recordId', 'mediaId', 'file', 'sourcePath', 'checksum', 'width', 'height']) {
          if (expected.asset[field] !== actual[field]) state.errors.add(`${label}: ${field} does not match the approved inventory`);
        }
        if (source.item.sourcePath !== expected.decisionPath) {
          state.errors.add(`${label}: source decision path does not match the approved inventory`);
        }
        if (source.item.generation.candidateId !== expected.asset.candidateId) {
          state.errors.add(`${label}: generated candidate does not match the approved decision`);
        }
        if (source.item.generation.decisionManifestChecksum !== expected.decisionChecksum) {
          state.errors.add(`${label}: decision manifest checksum changed`);
        }
        for (const field of ['provider', 'generator', 'model', 'modelVersion', 'promptVersion']) {
          if (source.item.generation[field] !== expected.decision.generator?.[field]) {
            state.errors.add(`${label}: generation ${field} does not match the approved decision`);
          }
        }
        const rightsNote = expected.decision.rightsReview?.decision === 'approve-repository-publication'
          ? `Repository publication approved with caveat: ${expected.decision.rightsReview.caveat}`
          : undefined;
        if (!rightsNote || expected.decision.rightsReview?.state !== 'approved' || source.item.rightsNote !== rightsNote) {
          state.errors.add(`${label}: rightsNote does not match the approved decision`);
        }
      }
    }

    const pathOwner = approvedPaths.get(source.sourcePath);
    if (pathOwner && expected !== pathOwner) {
      const kind = source.item.sourceKind === 'repository-generated' ? 'generated media' : 'ordinary media';
      state.errors.add(`${kind} ${identity} reuses approved generated source path ${source.sourcePath}`);
    }
    if (source.item.generation && source.item.sourcePath) {
      const key = generatedClaimKey(source.item.sourcePath, source.item.generation.candidateId);
      const candidates = claims.get(key) ?? [];
      candidates.push(source);
      claims.set(key, candidates);
      if (!approved.has(key)) {
        state.errors.add(`${identity}: generated candidate ${source.item.generation.candidateId} is not in an approved decision inventory`);
      }
    }
  }

  for (const [key, expected] of approved) {
    const identity = `${expected.asset.collection}/${expected.asset.recordId}/${expected.asset.mediaId}`;
    const source = entries.find((candidate) => (
      candidate.collection === expected.asset.collection
      && candidate.recordId === expected.asset.recordId
      && candidate.item.id === expected.asset.mediaId
    ));
    if (!source) state.errors.add(`approved generated asset ${identity}: source media record is missing`);
    const claimed = claims.get(key) ?? [];
    if (claimed.length > 1) {
      state.errors.add(`${expected.decisionPath}: generated candidate ${expected.asset.candidateId} is claimed more than once`);
    } else if (source && (claimed.length !== 1 || claimed[0] !== source)) {
      state.errors.add(`approved generated asset ${identity}: generation binding is missing`);
    }
  }
}

async function validateContentFile(root, absolutePath, targets, state, strict) {
  const path = repoPath(root, absolutePath);
  let parsed;
  try {
    parsed = matter(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    state.errors.add(`${path}: invalid frontmatter: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (hasRemoteImageHotlink(parsed.content)) {
    state.errors.add(`${path}: remote image hotlink is not allowed`);
  }

  if (parsed.data.coverState === 'verified' && !parsed.data.coverMedia) {
    state.errors.add(`${path}: coverState "verified" requires coverMedia`);
  }
  if (parsed.data.coverState === 'hold') {
    if (parsed.data.coverImage) state.errors.add(`${path}: coverState "hold" forbids coverImage`);
    if (parsed.data.coverMedia) state.errors.add(`${path}: coverState "hold" forbids coverMedia`);
  } else if (parsed.data.coverImage) {
    if (strict) state.errors.add(`${path}: legacy coverImage is not allowed in strict mode`);
    else state.warnings.add(`${path}: legacy coverImage is deprecated; use coverMedia`);
  }

  const manifest = state.manifests.get(expectedManifestPath(root, absolutePath));
  for (const field of mediaReferenceFields) {
    const id = parsed.data[field];
    if (field === 'coverMedia' && parsed.data.coverState === 'hold') continue;
    if (typeof id === 'string' && !manifest?.items.some((item) => item.id === id)) {
      state.errors.add(`${path}: ${field} "${id}" has no media manifest item`);
    }
  }
  if (typeof parsed.data.coverMedia === 'string') {
    const cover = manifest?.items.find((item) => item.id === parsed.data.coverMedia);
    if (cover && cover.kind !== 'book-cover') {
      state.errors.add(`${path}: coverMedia "${parsed.data.coverMedia}" must resolve to kind book-cover`);
    }
    if (cover?.redistributionApproval) {
      if (parsed.data.readEditionVerified !== true) {
        state.errors.add(`${path}: approved cover redistribution requires readEditionVerified true`);
      }
      if (parsed.data.isbn13 !== cover.isbn13) {
        state.errors.add(`${path}: review ISBN does not match approved cover edition identity`);
      }
      if (parsed.data.editionLabel !== cover.edition) {
        state.errors.add(`${path}: review edition does not match approved cover edition identity`);
      }
    }
  }

  if (Array.isArray(parsed.data.relationships)) {
    for (const relationship of parsed.data.relationships) {
      if (typeof relationship?.target === 'string' && !targets.has(relationship.target)) {
        state.errors.add(`${path}: relationship target "${relationship.target}" does not exist`);
      }
    }
  }
}

export async function validateMediaRepository(root, { strict = false } = {}) {
  const repositoryRoot = await realpath(resolve(root));
  const contentRoot = join(repositoryRoot, 'src', 'content');
  const assetsRoot = join(repositoryRoot, 'src', 'assets', 'content');
  const state = {
    checksumDeclarations: new Map(),
    declaredAssets: new Set(),
    errors: new Set(),
    manifests: new Map(),
    reviewCoverApprovalRegistry: { version: 1, approvals: [] },
    warnings: new Set(),
  };

  state.reviewCoverApprovalRegistry = await loadReviewCoverApprovalRegistry(repositoryRoot, state);

  const [contentTree, assetTree] = await Promise.all([
    scanTree(contentRoot),
    scanTree(assetsRoot),
  ]);
  for (const path of [...contentTree.symlinks, ...assetTree.symlinks]) {
    state.errors.add(`${repoPath(repositoryRoot, path)}: symbolic link is not allowed`);
  }

  const contentFiles = await retainContainedFiles(
    repositoryRoot,
    contentTree.files.filter((path) => contentExtensions.has(extname(path).toLowerCase())),
    contentRoot,
    state.errors,
  );
  const manifestFiles = await retainContainedFiles(
    repositoryRoot,
    assetTree.files.filter((path) => path.endsWith(`${sep}media.yml`)),
    assetsRoot,
    state.errors,
  );
  const assetFiles = await retainContainedFiles(
    repositoryRoot,
    assetTree.files.filter((path) => !path.endsWith(`${sep}media.yml`)),
    assetsRoot,
    state.errors,
  );

  for (const manifestPath of manifestFiles) {
    await validateManifest(repositoryRoot, manifestPath, state);
  }

  await validateReviewCoverApprovalInventory(repositoryRoot, state);
  await validateGeneratedInventory(repositoryRoot, state);

  for (const [checksum, declarations] of state.checksumDeclarations) {
    if (declarations.length > 1) {
      const labels = declarations
        .map(({ id }) => `"${id}"`)
        .sort(compare)
        .join(', ');
      const manifestPath = declarations.map(({ manifestPath }) => manifestPath).sort(compare)[0];
      state.errors.add(`${manifestPath}: checksum ${checksum} is declared by multiple media items: ${labels}`);
    }
  }

  for (const assetPath of assetFiles) {
    if (!state.declaredAssets.has(assetPath)) {
      state.errors.add(`${repoPath(repositoryRoot, assetPath)}: asset is not declared in media.yml`);
    }
  }

  const targets = new Set(contentFiles.map((path) => contentSlug(repositoryRoot, path)));
  for (const memoryTarget of await loadPublicMemorySlugs(repositoryRoot, state.errors)) {
    targets.add(memoryTarget);
  }

  for (const contentPath of contentFiles) {
    await validateContentFile(repositoryRoot, contentPath, targets, state, strict);
  }

  return {
    errors: [...state.errors].sort(compare),
    warnings: [...state.warnings].sort(compare),
  };
}

async function runCli() {
  const strict = process.argv.slice(2).includes('--strict');
  const result = await validateMediaRepository(process.cwd(), { strict });

  if (result.warnings.length > 0) {
    console.warn('Media validation warnings:');
    for (const warning of result.warnings) console.warn(`- ${warning}`);
  }
  if (result.errors.length > 0) {
    console.error('Media validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Media validation passed with ${result.warnings.length} warning(s).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
