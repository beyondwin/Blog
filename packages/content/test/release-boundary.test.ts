import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  activateRelease,
  cleanupOwnedTemporaryRoot,
  createOwnedTemporaryRoot,
  prepareActiveRelease,
} from '../src/release/build-release';
import { readActiveRelease } from '../src/release/read-release';
import { writeReleaseFixture } from './helpers/release-fixture';
import { buildPublicRelease } from '../src/release/build-release';

describe('active public release boundary', () => {
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
