import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  activateRelease,
  cleanupOwnedTemporaryRoot,
  createOwnedTemporaryRoot,
  prepareActiveRelease,
} from '../src/release/build-release';
import { findPublicBoundaryHits, readActiveRelease } from '../src/release/read-release';
import { renderTrustedMdx } from '../src/mdx/render';
import { writeReleaseFixture } from './helpers/release-fixture';
import { buildPublicRelease } from '../src/release/build-release';

const renameRace = vi.hoisted(() => ({
  beforeRename: undefined as undefined | ((from: string, to: string) => Promise<boolean>),
  beforeOpen: undefined as undefined | ((path: string) => Promise<boolean>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const hook = renameRace.beforeOpen;
      if (hook && await hook(String(args[0]))) {
        renameRace.beforeOpen = undefined;
      }
      return actual.open(...args);
    },
    rename: async (from: string, to: string) => {
      const hook = renameRace.beforeRename;
      if (hook && await hook(String(from), String(to))) {
        renameRace.beforeRename = undefined;
      }
      return actual.rename(from, to);
    },
  };
});

interface TestCandidate {
  src: string;
  width: number;
  height: number;
  checksum: string;
}

interface TestManifest {
  assets: Record<string, {
    sources: Array<{ type: string; candidates: TestCandidate[] }>;
    fallback: { candidates: TestCandidate[] };
  }>;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function writeForgedCandidate(
  releasePath: string,
  href: string,
  format: 'avif' | 'webp' | 'png',
  width: number,
  height: number,
): Promise<TestCandidate> {
  let pipeline = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  if (format === 'avif') pipeline = pipeline.avif();
  else if (format === 'webp') pipeline = pipeline.webp();
  else pipeline = pipeline.png();
  const bytes = await pipeline.toBuffer();
  await writeFile(join(releasePath, href.slice(1)), bytes);
  return { src: href, width, height, checksum: sha256(bytes) };
}

describe('active public release boundary', { timeout: 30_000 }, () => {
  it('accepts the migrated thought media through the verified release boundary', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-thought-boundary-'));
    const releasesRoot = join(sandbox, 'releases');
    await buildPublicRelease({ root: process.cwd(), releasesRoot });

    const active = await readActiveRelease(releasesRoot);

    expect(active.boundaryHits).toEqual([]);
    expect(active.manifest.records['thoughts/why-i-read-in-the-ai-era']).toMatchObject({
      collection: 'thoughts',
      href: '/thoughts/why-i-read-in-the-ai-era/',
    });
    expect(active.manifest.records['articles/why-i-read-in-the-ai-era']).toBeUndefined();
    expect(active.manifest.assets['thoughts/why-i-read-in-the-ai-era/editorial-reading']).toMatchObject({
      collection: 'thoughts',
      fallback: { src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png' },
    });
  });

  it.each([
    ['private source locator', 'file:///Users/example/private/Blog/memory/thoughts/secret.md'],
    ['private memory edge locator', 'memory/edges.jsonl'],
    ['private memory source locator', 'memory\\sources.jsonl'],
    ['serialized raw prompt', '{"rawPrompt":"do not publish","jobPayload":{"id":"private"}}'],
    ['serialized embedding payload', '{"embedding":[0.1,-0.2,0.3]}'],
  ])('measures a %s embedded inside an allowlisted string', (_case, leakedValue) => {
    const hits = findPublicBoundaryHits({ bodyHtml: `<p>${leakedValue}</p>` });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.path === 'manifest.bodyHtml')).toBe(true);
  });

  it('measures serialized private fields and vectors after the real renderer escapes their quotes', async () => {
    const bodyHtml = await renderTrustedMdx([
      '`{"rawPrompt":"private instruction"}`',
      '',
      '`{"embedding":[0.1,-0.2,0.3]}`',
    ].join('\n'), { media: new Map() });
    expect(bodyHtml).toContain('&quot;rawPrompt&quot;');
    expect(bodyHtml).toContain('&quot;embedding&quot;');

    expect(findPublicBoundaryHits({ bodyHtml })).toEqual([
      expect.objectContaining({ kind: 'serialized-private-field', path: 'manifest.bodyHtml' }),
      expect.objectContaining({ kind: 'embedding-payload', path: 'manifest.bodyHtml' }),
    ]);
  });

  it('does not treat truthful public prose about embeddings as an embedding payload', () => {
    expect(findPublicBoundaryHits({
      bodyHtml: '<p>Embedding systems map public text into useful semantic representations.</p>',
    })).toEqual([]);
  });

  it('rejects a measured private payload marker embedded in an allowlisted record string', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-private-string-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      records: Record<string, { bodyHtml: string }>;
    };
    manifest.records['articles/public-fixture']!.bodyHtml += '<p>{"rawPrompt":"private instruction"}</p>';
    expect(findPublicBoundaryHits(manifest)).toHaveLength(1);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/private boundary hit.*serialized-private-field/i);
  });

  it.each([
    ['partial JSON', '{"releaseId":'],
    ['absolute path', JSON.stringify({ releaseId: 'a'.repeat(64), path: '/tmp/release' })],
    ['traversal path', JSON.stringify({ releaseId: 'a'.repeat(64), path: '../release' })],
    ['nonexistent release', JSON.stringify({ releaseId: 'a'.repeat(64), path: 'a'.repeat(64) })],
  ])('rejects a %s pointer', async (_case, pointerJson) => {
    const releasesRoot = await mkdtemp(join(tmpdir(), 'beyondwin-release-pointer-'));
    await writeFile(join(releasesRoot, 'active.json'), pointerJson);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow();
  });

  it('rejects a release-ID mismatch between pointer and manifest', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-mismatch-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.releaseId = 'b'.repeat(64);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/release ID/i);
  });

  it('rejects a release directory symlink that escapes the owned releases root', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-directory-link-'));
    const sourceRoot = join(sandbox, 'source');
    const externalRoot = join(sandbox, 'external-releases');
    const releasesRoot = join(sandbox, 'owned-releases');
    await writeReleaseFixture(sourceRoot);
    const external = await buildPublicRelease({ root: sourceRoot, releasesRoot: externalRoot });
    await mkdir(releasesRoot, { recursive: true });
    await symlink(external.releasePath, join(releasesRoot, external.releaseId), 'dir');
    await writeFile(join(releasesRoot, 'active.json'), `${JSON.stringify({
      releaseId: external.releaseId,
      path: external.releaseId,
    })}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/symbolic link|containment/i);
  });

  it('detects a release-directory replacement after containment resolution but before manifest open', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-directory-in-call-race-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'owned-releases');
    const externalRoot = join(sandbox, 'external-releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const external = await buildPublicRelease({ root: sourceRoot, releasesRoot: externalRoot });
    const displacedPath = join(sandbox, 'displaced-release');
    const manifestPath = join(await realpath(built.releasePath), 'manifest.json');
    renameRace.beforeOpen = async (path) => {
      if (path !== manifestPath) return false;
      await rename(built.releasePath, displacedPath);
      await symlink(external.releasePath, built.releasePath, 'dir');
      return true;
    };

    try {
      await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/changed during verification|inode/i);
      expect(renameRace.beforeOpen).toBeUndefined();
    } finally {
      renameRace.beforeOpen = undefined;
    }
  });

  it('rejects an active pointer symlink that escapes the owned releases root', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-active-link-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    const externalPointer = join(sandbox, 'external-active.json');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    await writeFile(externalPointer, `${JSON.stringify({
      releaseId: built.releaseId,
      path: built.releaseId,
    })}\n`);
    await rm(join(releasesRoot, 'active.json'));
    await symlink(externalPointer, join(releasesRoot, 'active.json'));

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/symbolic link|containment/i);
  });

  it('rejects a manifest whose responsive asset no longer matches its public media allowlist', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-mismatch-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      assets: Record<string, { sourceChecksum: string }>;
    };
    manifest.assets['articles/public-fixture/hero']!.sourceChecksum = `sha256:${'b'.repeat(64)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/source checksum|public media/i);
  });

  it('rejects an unmanifested file anywhere in the immutable release directory', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-extra-file-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    await writeFile(join(built.releasePath, 'private-source.map'), '{"privatePath":"/Users/example"}');

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/unmanifested|unexpected release file/i);
  });

  it('requires one AVIF and one WebP source in each responsive asset manifest', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-source-types-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      assets: Record<string, { sources: Array<{ type: string }> }>;
    };
    manifest.assets['articles/public-fixture/hero']!.sources[1]!.type = 'image/avif';
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/AVIF.*WebP|WebP.*AVIF/i);
  });

  it('rejects a candidate whose actual bytes do not match its declared media type', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-format-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    const avif = asset.sources.find((source) => source.type === 'image/avif')!.candidates[0]!;
    const webp = asset.sources.find((source) => source.type === 'image/webp')!.candidates[0]!;
    const webpBytes = await readFile(join(built.releasePath, webp.src.slice(1)));
    await writeFile(join(built.releasePath, avif.src.slice(1)), webpBytes);
    avif.checksum = sha256(webpBytes);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/actual media format|AVIF/i);
  });

  it('rejects candidate dimensions forged in the manifest', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-dimensions-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    for (const source of asset.sources) source.candidates[0]!.width = 2;
    asset.fallback.candidates[0]!.width = 2;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/actual media dimensions/i);
  });

  it('rejects a candidate path whose extension does not match its source type', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-extension-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const avif = manifest.assets['articles/public-fixture/hero']!.sources
      .find((source) => source.type === 'image/avif')!.candidates[0]!;
    const forgedHref = '/assets/content/articles/public-fixture/hero-forged.webp';
    await rename(
      join(built.releasePath, avif.src.slice(1)),
      join(built.releasePath, forgedHref.slice(1)),
    );
    avif.src = forgedHref;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/path extension.*source type/i);
  });

  it('rejects a candidate path reused across modern source sets', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-duplicate-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    const avif = asset.sources.find((source) => source.type === 'image/avif')!.candidates[0]!;
    const webp = asset.sources.find((source) => source.type === 'image/webp')!.candidates[0]!;
    await rm(join(built.releasePath, webp.src.slice(1)));
    Object.assign(webp, avif);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/duplicate candidate path/i);
  });

  it('rejects dimension sets that are not identical across AVIF, WebP, and fallback candidates', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-parity-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    const webp = asset.sources.find((source) => source.type === 'image/webp')!;
    const extraHref = '/assets/content/articles/public-fixture/hero-2w.webp';
    const extraBytes = await sharp({
      create: { width: 2, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).webp().toBuffer();
    await writeFile(join(built.releasePath, extraHref.slice(1)), extraBytes);
    webp.candidates.push({ src: extraHref, width: 2, height: 1, checksum: sha256(extraBytes) });
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/source-set dimension parity/i);
  });

  it('rejects duplicate rendered width descriptors even when candidate heights differ', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-duplicate-width-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot, {
      featuredMedia: false,
      mediaWidth: 1600,
      mediaHeight: 900,
    });
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    const avif = asset.sources.find((source) => source.type === 'image/avif')!;
    const webp = asset.sources.find((source) => source.type === 'image/webp')!;
    avif.candidates.push(await writeForgedCandidate(
      built.releasePath,
      '/assets/content/articles/public-fixture/hero-720w-forged.avif',
      'avif',
      720,
      400,
    ));
    webp.candidates.push(await writeForgedCandidate(
      built.releasePath,
      '/assets/content/articles/public-fixture/hero-720w-forged.webp',
      'webp',
      720,
      400,
    ));
    asset.fallback.candidates.push(await writeForgedCandidate(
      built.releasePath,
      '/assets/content/articles/public-fixture/hero-720w-forged.png',
      'png',
      720,
      400,
    ));
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/duplicate responsive width descriptor/i);
  });

  it('rejects identical source sets that all omit an approved generated width', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-missing-width-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot, {
      featuredMedia: false,
      mediaWidth: 1600,
      mediaHeight: 900,
    });
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const manifestPath = join(built.releasePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest;
    const asset = manifest.assets['articles/public-fixture/hero']!;
    for (const candidates of [
      ...asset.sources.map((source) => source.candidates),
      asset.fallback.candidates,
    ]) {
      const missing = candidates.find((candidate) => candidate.width === 1080)!;
      await rm(join(built.releasePath, missing.src.slice(1)));
      candidates.splice(candidates.indexOf(missing), 1);
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await expect(readActiveRelease(releasesRoot)).rejects.toThrow(/approved responsive widths/i);
  });

  it('keeps the previous pointer readable before rename and exposes only the complete release after rename', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-crash-'));
    const oldSource = join(sandbox, 'old-source');
    const newSource = join(sandbox, 'new-source');
    const releasesRoot = join(sandbox, 'releases');
    await Promise.all([
      writeReleaseFixture(oldSource, { title: 'Old public title' }),
      writeReleaseFixture(newSource, { title: 'New public title' }),
    ]);
    const oldRelease = await buildPublicRelease({ root: oldSource, releasesRoot });
    const newRelease = await buildPublicRelease({ root: newSource, releasesRoot, activate: false });

    const prepared = await prepareActiveRelease(releasesRoot, {
      releaseId: newRelease.releaseId,
      path: newRelease.releaseId,
    });
    expect((await readActiveRelease(releasesRoot)).pointer.releaseId).toBe(oldRelease.releaseId);

    await activateRelease(prepared);
    const active = await readActiveRelease(releasesRoot);
    expect(active.pointer.releaseId).toBe(newRelease.releaseId);
    expect(active.manifest.records['articles/public-fixture']?.title).toBe('New public title');
  });

  it('refuses to follow a symbolic link at the active pointer staging path', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-pointer-link-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    const sentinel = join(sandbox, 'sentinel');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    await writeFile(sentinel, 'must remain unchanged');
    await symlink(sentinel, join(releasesRoot, 'active.json.tmp'));

    await expect(prepareActiveRelease(releasesRoot, {
      releaseId: built.releaseId,
      path: built.releaseId,
    })).rejects.toThrow(/symbolic link/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('must remain unchanged');
  });

  it('refuses a symbolic-link swap after an active pointer has been prepared', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-pointer-swap-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    const externalPointer = join(sandbox, 'external-pointer.json');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const prepared = await prepareActiveRelease(releasesRoot, {
      releaseId: built.releaseId,
      path: built.releaseId,
    });
    const temporaryPath = join(releasesRoot, 'active.json.tmp');
    await writeFile(externalPointer, await readFile(temporaryPath));
    await rm(temporaryPath);
    await symlink(externalPointer, temporaryPath);

    await expect(activateRelease(prepared)).rejects.toThrow(/symbolic link|regular owned file/i);
  });

  it('detects and recovers an active pointer replacement inside the rename operation', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-pointer-in-call-race-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    const externalPointer = join(sandbox, 'external-pointer.json');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const prepared = await prepareActiveRelease(releasesRoot, {
      releaseId: built.releaseId,
      path: built.releaseId,
    });
    const temporaryPath = join(releasesRoot, 'active.json.tmp');
    const activePath = join(releasesRoot, 'active.json');
    await writeFile(externalPointer, `${JSON.stringify({
      releaseId: 'b'.repeat(64),
      path: 'b'.repeat(64),
    })}\n`);
    renameRace.beforeRename = async (from, to) => {
      if (from !== temporaryPath || to !== activePath) return false;
      await rm(temporaryPath);
      await symlink(externalPointer, temporaryPath);
      return true;
    };

    try {
      await expect(activateRelease(prepared)).rejects.toThrow(/changed during activation|inode/i);
      await expect(readActiveRelease(releasesRoot)).resolves.toMatchObject({
        pointer: { releaseId: built.releaseId, path: built.releaseId },
      });
    } finally {
      renameRace.beforeRename = undefined;
    }
  });
});

describe('temporary release cleanup ownership', () => {
  it('deletes only the exact root returned by mkdtemp and rejects destructive targets', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-cleanup-'));
    const releasesRoot = join(sandbox, 'build', 'public-releases');
    await mkdir(releasesRoot, { recursive: true });
    const owned = await createOwnedTemporaryRoot(releasesRoot);
    await writeFile(join(owned.path, 'sentinel'), 'temporary');

    await expect(cleanupOwnedTemporaryRoot(owned)).resolves.toBeUndefined();
    await expect(readFile(join(owned.path, 'sentinel'))).rejects.toThrow();

    for (const target of [
      releasesRoot,
      join(releasesRoot, 'active.json'),
      join(releasesRoot, 'rollback.json'),
      resolve('.'),
      homedir(),
      join(sandbox, 'caller-supplied'),
    ]) {
      await expect(cleanupOwnedTemporaryRoot({ path: target } as never)).rejects.toThrow(/owned temporary root/i);
    }
  });
});
