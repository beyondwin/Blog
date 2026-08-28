import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPublicRelease } from '../src/release/build-release';
import { readActiveRelease } from '../src/release/read-release';
import { writeReleaseFixture } from './helpers/release-fixture';

describe('immutable public release building', () => {
  it('builds the approved article and thought featured media while keeping the home hero unreferenced', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-thought-round-trip-'));
    const releasesRoot = join(sandbox, 'releases');
    const built = await buildPublicRelease({ root: process.cwd(), releasesRoot });
    const active = await readActiveRelease(releasesRoot);

    expect(active.manifest.records['thoughts/why-i-read-in-the-ai-era']).toMatchObject({
      collection: 'thoughts',
      href: '/thoughts/why-i-read-in-the-ai-era/',
      featuredMedia: 'editorial-reading',
    });
    expect(active.manifest.records['articles/why-i-read-in-the-ai-era']).toBeUndefined();
    expect(active.manifest.assets['thoughts/why-i-read-in-the-ai-era/editorial-reading']).toMatchObject({
      collection: 'thoughts',
      recordId: 'why-i-read-in-the-ai-era',
      fallback: { src: '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png' },
    });
    expect(active.manifest.records['articles/graphify-code-knowledge-graph-deep-dive']).toMatchObject({
      collection: 'articles',
      featuredMedia: 'editorial-hero',
    });
    expect(active.manifest.assets['articles/graphify-code-knowledge-graph-deep-dive/editorial-hero']).toBeDefined();
    expect(active.manifest.assets['articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero']).toBeUndefined();
    expect(built.manifest).toEqual(active.manifest);
  }, 30_000);

  it('derives a deterministic ID from public inputs and changes it when a public field changes', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-build-'));
    const firstRoot = join(sandbox, 'first-source');
    const secondRoot = join(sandbox, 'second-source');
    const changedRoot = join(sandbox, 'changed-source');
    await Promise.all([
      writeReleaseFixture(firstRoot),
      writeReleaseFixture(secondRoot),
      writeReleaseFixture(changedRoot, { title: 'Changed public title' }),
    ]);

    const first = await buildPublicRelease({
      root: firstRoot,
      releasesRoot: join(sandbox, 'first-releases'),
    });
    const second = await buildPublicRelease({
      root: secondRoot,
      releasesRoot: join(sandbox, 'second-releases'),
    });
    const changed = await buildPublicRelease({
      root: changedRoot,
      releasesRoot: join(sandbox, 'changed-releases'),
    });

    expect(first.releaseId).toBe(second.releaseId);
    expect(first.releaseId).not.toBe(changed.releaseId);
    expect(first.manifest).toEqual(second.manifest);
  });

  it('emits an immutable manifest, responsive media files, and a validated active pointer', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-output-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'public-releases');
    await writeReleaseFixture(sourceRoot);
    await mkdir(releasesRoot, { recursive: true });

    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const active = await readActiveRelease(releasesRoot);
    const manifestJson = await readFile(join(built.releasePath, 'manifest.json'), 'utf8');
    const record = built.manifest.records['articles/public-fixture'];
    const asset = built.manifest.assets['articles/public-fixture/hero'];

    expect(active.pointer).toEqual({ releaseId: built.releaseId, path: built.releaseId });
    expect(active.releasePath).toBe(built.releasePath);
    expect(record?.bodyHtml).toContain('<figure');
    expect(record?.bodyHtml).toContain('srcset=');
    expect(record?.media[0]).toMatchObject({
      src: '/assets/content/articles/public-fixture/hero.png',
      width: 1,
      height: 1,
      alt: 'A one-pixel public fixture',
      caption: 'Deterministic fixture media',
      credit: 'beyondwin test',
    });
    expect(asset).toMatchObject({
      provenanceUrl: 'https://example.com/public-fixture',
      sourceChecksum: 'sha256:431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
    });
    expect(asset?.sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp']);
    for (const candidate of [
      ...(asset?.sources.flatMap((source) => source.candidates) ?? []),
      ...(asset?.fallback.candidates ?? []),
    ]) {
      await expect(readFile(join(built.releasePath, candidate.src.slice(1)))).resolves.toBeInstanceOf(Buffer);
    }
    expect(manifestJson).not.toMatch(/\/Users\/|memory\/thoughts|embedding|jobPrompt|rawPrompt|sourcePath/i);
  });

  it('does not let stripped private frontmatter influence the public release ID', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-private-field-'));
    const firstRoot = join(sandbox, 'first');
    const secondRoot = join(sandbox, 'second');
    await Promise.all([
      writeReleaseFixture(firstRoot, { privateFrontmatter: 'jobPrompt: "first private value"' }),
      writeReleaseFixture(secondRoot, { privateFrontmatter: 'jobPrompt: "second private value"' }),
    ]);

    const first = await buildPublicRelease({ root: firstRoot, releasesRoot: join(sandbox, 'first-out') });
    const second = await buildPublicRelease({ root: secondRoot, releasesRoot: join(sandbox, 'second-out') });

    expect(first.releaseId).toBe(second.releaseId);
  });

  it.each([
    ['single-quoted Figure', "<Figure media='hero' />"],
    ['paired empty Figure', '<Figure media="hero"></Figure>'],
  ])('discovers and builds media referenced by a %s through the trusted MDX grammar', async (_case, figureMarkup) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-figure-grammar-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot, { featuredMedia: false, figureMarkup });

    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });

    expect(built.manifest.assets['articles/public-fixture/hero']).toBeDefined();
    expect(built.manifest.records['articles/public-fixture']?.bodyHtml).toContain('<figure');
  });

  it('refuses to repair a damaged existing release directory in place', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-immutable-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeReleaseFixture(sourceRoot);
    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const asset = built.manifest.assets['articles/public-fixture/hero'];
    if (!asset) throw new Error('fixture asset missing');
    const missingPath = join(built.releasePath, asset.sources[0]!.candidates[0]!.src.slice(1));
    await rm(missingPath);

    await expect(buildPublicRelease({ root: sourceRoot, releasesRoot })).rejects.toThrow(/ENOENT|no such file|missing/i);
    await expect(readFile(missingPath)).rejects.toThrow();
  });

  it('refuses to install through an existing release-ID symlink', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-install-link-'));
    const sourceRoot = join(sandbox, 'source');
    const externalRoot = join(sandbox, 'external-releases');
    const releasesRoot = join(sandbox, 'owned-releases');
    await writeReleaseFixture(sourceRoot);
    const external = await buildPublicRelease({ root: sourceRoot, releasesRoot: externalRoot });
    await mkdir(releasesRoot, { recursive: true });
    await symlink(external.releasePath, join(releasesRoot, external.releaseId), 'dir');

    await expect(buildPublicRelease({ root: sourceRoot, releasesRoot })).rejects.toThrow(/symbolic link|containment/i);
  });

  it('rejects a symlinked source-media leaf even when the target bytes match the manifest', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-leaf-link-'));
    const sourceRoot = join(sandbox, 'source');
    const assetPath = join(sourceRoot, 'src', 'assets', 'content', 'articles', 'public-fixture', 'hero.png');
    const externalPath = join(sandbox, 'external-hero.png');
    await writeReleaseFixture(sourceRoot);
    await rename(assetPath, externalPath);
    await symlink(externalPath, assetPath, 'file');

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/symbolic link/iu);
  });

  it('rejects a symlinked source-media ancestor directory', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-media-directory-link-'));
    const sourceRoot = join(sandbox, 'source');
    const mediaPath = join(sourceRoot, 'src', 'assets', 'content', 'articles', 'public-fixture');
    const externalPath = join(sandbox, 'external-public-fixture-media');
    await writeReleaseFixture(sourceRoot);
    await rename(mediaPath, externalPath);
    await symlink(externalPath, mediaPath, 'dir');

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/symbolic link/iu);
  });

  it('rejects a symlinked src/assets ancestor before reading release media', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-assets-directory-link-'));
    const sourceRoot = join(sandbox, 'source');
    const assetsPath = join(sourceRoot, 'src', 'assets');
    const externalPath = join(sandbox, 'external-assets');
    await writeReleaseFixture(sourceRoot);
    await rename(assetsPath, externalPath);
    await symlink(externalPath, assetsPath, 'dir');

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/symbolic link/iu);
  });

  it.each([
    {
      name: 'published review missing bibliography, verdict, and cover state',
      collection: 'reviews',
      slug: 'missing-review-fields',
      fields: ['itemType: book', 'itemTitle: Missing review fields'],
      error: 'published review requires itemAuthor, isbn13, publisher, verdict, and coverState',
    },
    {
      name: 'published verified review missing cover media',
      collection: 'reviews',
      slug: 'verified-without-cover',
      fields: [
        'itemType: book',
        'itemTitle: Verified without cover',
        'itemAuthor: Author',
        'isbn13: "9788990247674"',
        'publisher: Publisher',
        'verdict: Verdict',
        'coverState: verified',
      ],
      error: 'coverState verified requires coverMedia',
    },
    {
      name: 'published hold review with cover media',
      collection: 'reviews',
      slug: 'hold-with-cover',
      fields: [
        'itemType: book',
        'itemTitle: Hold with cover',
        'itemAuthor: Author',
        'isbn13: "9788990247674"',
        'publisher: Publisher',
        'verdict: Verdict',
        'coverState: hold',
        'coverMedia: cover',
      ],
      error: 'coverState hold forbids coverMedia',
    },
    {
      name: 'published travel without privacy review and lead media',
      collection: 'travel',
      slug: 'unreviewed-travel',
      fields: ['location: Seoul', 'privacyReviewed: false'],
      error: 'published travel requires privacyReviewed true and leadMedia',
    },
  ])('rejects $name at the release-builder boundary', async ({ collection, slug, fields, error }) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-published-rule-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeFile(join(sourceRoot, 'src', 'content', collection, `${slug}.mdx`), [
      '---',
      `title: ${slug}`,
      'description: Invalid published fixture',
      'createdAt: "2026-08-23"',
      'updatedAt: "2026-08-23"',
      'status: published',
      'draft: false',
      ...fields,
      '---',
      '',
      'Invalid published fixture.',
      '',
    ].join('\n'));

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });
});
