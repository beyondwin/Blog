import type { ImageMetadata } from 'astro';
import type { MediaItem, MediaManifest } from './mediaManifest';
import { parseMediaManifest } from './mediaManifest.mjs';

const manifestSources = import.meta.glob<string>('../../assets/content/**/media.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const assetModules = import.meta.glob<ImageMetadata>('../../assets/content/**/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  import: 'default',
});

export interface ResolvedMedia {
  item: MediaItem;
  asset: ImageMetadata;
}

export interface MediaRegistry {
  resolve(collection: string, slug: string, id: string): ResolvedMedia;
}

const contentAssetPrefix = '/src/assets/content/';

function normalizeContentAssetPath(path: string): string {
  const withForwardSlashes = path.replaceAll('\\', '/');
  const canonicalIndex = withForwardSlashes.indexOf(contentAssetPrefix);
  if (canonicalIndex >= 0) return withForwardSlashes.slice(canonicalIndex);

  const vitePrefix = '../../assets/content/';
  if (withForwardSlashes.startsWith(vitePrefix)) {
    return `${contentAssetPrefix}${withForwardSlashes.slice(vitePrefix.length)}`;
  }

  const sourcePrefix = 'src/assets/content/';
  if (withForwardSlashes.startsWith(sourcePrefix)) {
    return `/${withForwardSlashes}`;
  }

  throw new Error(`${path}: expected a path inside ${contentAssetPrefix}`);
}

function manifestPathFor(collection: string, slug: string): string {
  return `${contentAssetPrefix}${collection}/${slug}/media.yml`;
}

export function buildMediaRegistry(
  manifests: Record<string, string>,
  assets: Record<string, ImageMetadata>,
): MediaRegistry {
  const normalizedAssets = new Map<string, ImageMetadata>();
  for (const [path, metadata] of Object.entries(assets)) {
    const normalizedPath = normalizeContentAssetPath(path);
    if (normalizedAssets.has(normalizedPath)) throw new Error(`${normalizedPath}: duplicate asset path`);
    normalizedAssets.set(normalizedPath, metadata);
  }

  const resolvedById = new Map<string, ResolvedMedia>();
  const manifestPaths = new Set<string>();

  for (const [path, source] of Object.entries(manifests)) {
    const manifestPath = normalizeContentAssetPath(path);
    const match = manifestPath.match(/^\/src\/assets\/content\/([^/]+)\/([^/]+)\/media\.yml$/);
    if (!match) throw new Error(`${manifestPath}: expected <collection>/<slug>/media.yml`);
    if (manifestPaths.has(manifestPath)) throw new Error(`${manifestPath}: duplicate manifest path`);
    manifestPaths.add(manifestPath);

    const [, collection, slug] = match;
    const manifest = parseMediaManifest(source, manifestPath) as MediaManifest;
    const manifestDirectory = manifestPath.slice(0, -'/media.yml'.length);
    const ids = new Set<string>();

    for (const item of manifest.items) {
      if (ids.has(item.id)) throw new Error(`${manifestPath}: duplicate media id ${item.id}`);
      ids.add(item.id);

      const assetPath = `${manifestDirectory}/${item.file}`;
      const asset = normalizedAssets.get(assetPath);
      if (!asset) throw new Error(`${manifestPath}: media item ${item.id} is missing file ${item.file}`);

      resolvedById.set(`${collection}/${slug}/${item.id}`, { item, asset });
    }
  }

  return {
    resolve: (collection, slug, id) => {
      const resolved = resolvedById.get(`${collection}/${slug}/${id}`);
      if (!resolved) throw new Error(`${manifestPathFor(collection, slug)}: unknown media id ${id}`);
      return resolved;
    },
  };
}

const registry = buildMediaRegistry(manifestSources, assetModules);
export const resolveContentMedia = registry.resolve;
