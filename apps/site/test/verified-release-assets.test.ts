import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReleaseMediaAsset } from '../../../packages/content/src/media/build-responsive-media';
import {
  createVerifiedReleaseAssetMiddleware,
  verifiedReleaseAssetInventory,
  resolveVerifiedReleaseAssetRequest,
} from '../verified-release-assets';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const pngChecksum = `sha256:${createHash('sha256').update(pngBytes).digest('hex')}`;

function heroAsset(overrides: Partial<ReleaseMediaAsset['fallback']> = {}): ReleaseMediaAsset {
  return {
    id: 'hero',
    collection: 'articles',
    recordId: 'safe-record',
    kind: 'illustration',
    alt: 'A safe diagram',
    credit: 'Public credit',
    provenanceUrl: 'https://example.com/source',
    verifiedAt: '2026-08-23',
    rightsNote: 'Approved for this fixture',
    width: 1,
    height: 1,
    sourceChecksum: pngChecksum,
    sources: [
      {
        type: 'image/avif',
        candidates: [
          {
            src: '/assets/content/articles/safe-record/hero-1w.avif',
            width: 1,
            height: 1,
            checksum: `sha256:${'a'.repeat(64)}`,
          },
        ],
      },
      {
        type: 'image/webp',
        candidates: [
          {
            src: '/assets/content/articles/safe-record/hero-1w.source.webp',
            width: 1,
            height: 1,
            checksum: `sha256:${'b'.repeat(64)}`,
          },
        ],
      },
    ],
    fallback: {
      src: '/assets/content/articles/safe-record/hero.png',
      format: 'png',
      checksum: pngChecksum,
      candidates: [
        {
          src: '/assets/content/articles/safe-record/hero.png',
          width: 1,
          height: 1,
          checksum: pngChecksum,
        },
      ],
      ...overrides,
    },
  };
}

function inventoryFor(releasePath: string) {
  return verifiedReleaseAssetInventory({
    releasePath,
    manifest: { assets: { 'articles/safe-record/hero': heroAsset() } },
  });
}

async function invoke(
  middleware: ReturnType<typeof createVerifiedReleaseAssetMiddleware>,
  request: { url: string; method?: string },
) {
  const chunks: Buffer[] = [];
  let passed = false;
  const headers = new Map<string, string>();
  const req = { url: request.url, method: request.method ?? 'GET' } as IncomingMessage;
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number) {
      headers.set(name.toLowerCase(), String(value));
    },
    end(data?: unknown) {
      if (data !== undefined && data !== null) {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
      }
    },
  } as unknown as ServerResponse;

  await new Promise<void>((resolve, reject) => {
    const maybe = middleware(req, res, (error?: unknown) => {
      if (error) reject(error);
      else {
        passed = true;
        resolve();
      }
    });
    Promise.resolve(maybe).then(() => {
      if (!passed) resolve();
    }, reject);
  });

  return {
    passed,
    statusCode: res.statusCode,
    headers,
    body: Buffer.concat(chunks),
  };
}

describe('verified public release asset serving for site:dev', () => {
  it('indexes fallback, source, and candidate hrefs from the bound release', () => {
    const inventory = inventoryFor('/tmp/release');
    expect(inventory.get('/assets/content/articles/safe-record/hero.png')).toEqual({
      checksum: pngChecksum,
      sourcePath: '/tmp/release/assets/content/articles/safe-record/hero.png',
    });
    expect(inventory.has('/assets/content/articles/safe-record/hero-1w.avif')).toBe(true);
    expect(inventory.has('/assets/content/articles/safe-record/hero-1w.source.webp')).toBe(true);
  });

  it('resolves exact verified hrefs, including query strings, and rejects anything else', () => {
    const inventory = inventoryFor('/tmp/release');
    expect(resolveVerifiedReleaseAssetRequest(
      '/assets/content/articles/safe-record/hero.png?v=1',
      inventory,
    )).toMatchObject({
      kind: 'file',
      href: '/assets/content/articles/safe-record/hero.png',
      contentType: 'image/png',
    });
    expect(resolveVerifiedReleaseAssetRequest(
      '/assets/content/articles/safe-record/missing.png',
      inventory,
    )).toEqual({ kind: 'not-found' });
    expect(resolveVerifiedReleaseAssetRequest(
      '/assets/content/articles/safe-record/../../memory/secret.png',
      inventory,
    )).toEqual({ kind: 'not-found' });
    expect(resolveVerifiedReleaseAssetRequest(
      '/assets/content/articles/safe-record/../../../../memory/secret.png',
      inventory,
    )).toEqual({ kind: 'pass' });
    expect(resolveVerifiedReleaseAssetRequest('/assets/entry.client.js', inventory)).toEqual({ kind: 'pass' });
    expect(resolveVerifiedReleaseAssetRequest('/articles/safe-record/', inventory)).toEqual({ kind: 'pass' });
  });

  it('serves only inventory files with their bytes and 404s unknown content assets', async () => {
    const releasePath = await mkdtemp(join(tmpdir(), 'beyondwin-dev-assets-'));
    temporaryRoots.push(releasePath);
    const filePath = join(releasePath, 'assets/content/articles/safe-record/hero.png');
    await mkdir(join(releasePath, 'assets/content/articles/safe-record'), { recursive: true });
    await writeFile(filePath, pngBytes);

    const middleware = createVerifiedReleaseAssetMiddleware(inventoryFor(releasePath));
    const found = await invoke(middleware, { url: '/assets/content/articles/safe-record/hero.png' });
    expect(found.passed).toBe(false);
    expect(found.statusCode).toBe(200);
    expect(found.headers.get('content-type')).toBe('image/png');
    expect(found.body).toEqual(pngBytes);

    const missing = await invoke(middleware, { url: '/assets/content/reviews/unknown/cover.jpg' });
    expect(missing.passed).toBe(false);
    expect(missing.statusCode).toBe(404);
    expect(missing.body.equals(pngBytes)).toBe(false);

    const framework = await invoke(middleware, { url: '/assets/entry.client.js' });
    expect(framework.passed).toBe(true);
  });

  it('does not serve a verified href whose bytes no longer match the bound checksum', async () => {
    const releasePath = await mkdtemp(join(tmpdir(), 'beyondwin-dev-assets-'));
    temporaryRoots.push(releasePath);
    const filePath = join(releasePath, 'assets/content/articles/safe-record/hero.png');
    await mkdir(join(releasePath, 'assets/content/articles/safe-record'), { recursive: true });
    await writeFile(filePath, Buffer.from('tampered'));

    const middleware = createVerifiedReleaseAssetMiddleware(inventoryFor(releasePath));
    const result = await invoke(middleware, { url: '/assets/content/articles/safe-record/hero.png' });
    expect(result.passed).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.body.toString()).not.toContain('tampered');
  });

  it('registers the Vite serve plugin so site:dev can attach the middleware', async () => {
    const source = await readFile(join(import.meta.dirname, '../vite.config.ts'), 'utf8');
    expect(source).toContain("name: 'beyondwin-verified-release-assets'");
    expect(source).toContain('createVerifiedReleaseAssetMiddleware');
    expect(source).toContain('verifiedReleaseAssetInventory');
  });
});
