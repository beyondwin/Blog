import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Connect } from 'vite';

export interface VerifiedReleaseAsset {
  checksum: string;
  sourcePath: string;
}

interface ReleaseAssetHref {
  src: string;
  checksum: string;
}

export interface CandidateReleaseAssets {
  releasePath: string;
  manifest: {
    assets: Record<string, {
      fallback: ReleaseAssetHref & { candidates: ReleaseAssetHref[] };
      sources: Array<{ candidates: ReleaseAssetHref[] }>;
    }>;
  };
}

export type VerifiedReleaseAssetResolution =
  | { kind: 'pass' }
  | { kind: 'not-found' }
  | { kind: 'file'; href: string; contentType: string; checksum: string; sourcePath: string };

const CONTENT_TYPES = {
  '.avif': 'image/avif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const;

export function verifiedReleaseAssetInventory(
  release: CandidateReleaseAssets,
): Map<string, VerifiedReleaseAsset> {
  const assets = new Map<string, VerifiedReleaseAsset>();
  const add = (href: string, checksum: string): void => {
    const existing = assets.get(href);
    if (existing && existing.checksum !== checksum) {
      throw new Error(`${href}: verified manifest assigns conflicting checksums`);
    }
    assets.set(href, {
      checksum,
      sourcePath: join(release.releasePath, href.slice(1)),
    });
  };
  for (const asset of Object.values(release.manifest.assets)) {
    add(asset.fallback.src, asset.fallback.checksum);
    for (const candidate of asset.fallback.candidates) add(candidate.src, candidate.checksum);
    for (const source of asset.sources) {
      for (const candidate of source.candidates) add(candidate.src, candidate.checksum);
    }
  }
  return assets;
}

export function resolveVerifiedReleaseAssetRequest(
  requestUrl: string,
  inventory: ReadonlyMap<string, VerifiedReleaseAsset>,
): VerifiedReleaseAssetResolution {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
  } catch {
    return { kind: 'pass' };
  }
  if (!pathname.startsWith('/assets/content/')) return { kind: 'pass' };
  const asset = inventory.get(pathname);
  if (!asset) return { kind: 'not-found' };
  const contentType = CONTENT_TYPES[extname(pathname).toLowerCase() as keyof typeof CONTENT_TYPES];
  if (!contentType) return { kind: 'not-found' };
  return {
    kind: 'file',
    href: pathname,
    contentType,
    checksum: asset.checksum,
    sourcePath: asset.sourcePath,
  };
}

export function createVerifiedReleaseAssetMiddleware(
  inventory: ReadonlyMap<string, VerifiedReleaseAsset>,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      next();
      return undefined;
    }
    const resolution = resolveVerifiedReleaseAssetRequest(req.url ?? '/', inventory);
    if (resolution.kind === 'pass') {
      next();
      return undefined;
    }
    if (resolution.kind === 'not-found') {
      res.statusCode = 404;
      res.end();
      return undefined;
    }
    return writeVerifiedReleaseAsset(resolution, res);
  };
}

async function writeVerifiedReleaseAsset(
  resolution: Extract<VerifiedReleaseAssetResolution, { kind: 'file' }>,
  res: Parameters<Connect.NextHandleFunction>[1],
): Promise<void> {
  try {
    const state = await lstat(resolution.sourcePath);
    if (state.isSymbolicLink() || !state.isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const bytes = await readFile(resolution.sourcePath);
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (checksum !== resolution.checksum) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', resolution.contentType);
    res.setHeader('Content-Length', bytes.byteLength);
    res.end(bytes);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}
