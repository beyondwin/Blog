import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { parse as parseYaml } from 'yaml';
import { parseMediaManifest } from '../src/lib/content/mediaManifest.mjs';

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
    if (rasterExtensions.has(extension)) {
      const dimensions = rasterDimensions(bytes, extension);
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

    if (item.sourcePath) {
      const sourcePath = resolve(root, item.sourcePath);
      if (!isInside(root, sourcePath) || await inspectRepositoryFile(root, sourcePath, root) !== 'ok') {
        state.errors.add(`${manifestPath}: sourcePath "${item.sourcePath}" does not exist`);
      }
    } else if (item.sourceUrl && item.rightsNote.trim()) {
      state.warnings.add(`${assetRepoPath}: redistribution rights are not independently verified`);
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
    warnings: new Set(),
  };

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
