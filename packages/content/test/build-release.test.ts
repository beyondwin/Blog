import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPublicRelease,
  releaseIdForMaterializedRelease,
} from '../src/release/build-release';
import { readActiveRelease } from '../src/release/read-release';
import {
  fixtureChecksum,
  writeReleaseFixture,
  writeReviewCoverFixture,
  type ReviewCoverDecisionMutation,
  type ReviewCoverRegistryMutation,
} from './helpers/release-fixture';

describe('immutable public release building', () => {
  it('binds release identity to deterministic source, renderer version, and materialized output', () => {
    const source = { records: [{ body: 'same trusted source' }] };
    const output = { records: { 'articles/example': { bodyHtml: '<p>first render</p>' } }, assets: {} };

    const first = releaseIdForMaterializedRelease(source, output, 'renderer-v1');
    expect(releaseIdForMaterializedRelease(source, output, 'renderer-v1')).toBe(first);
    expect(releaseIdForMaterializedRelease(
      source,
      { records: { 'articles/example': { bodyHtml: '<p>changed render</p>' } }, assets: {} },
      'renderer-v1',
    )).not.toBe(first);
    expect(releaseIdForMaterializedRelease(source, output, 'renderer-v2')).not.toBe(first);
  });

  it('builds every approved generated media selection needed by the fixed home and detail projections', async () => {
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
    expect(active.manifest.assets['articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero']).toMatchObject({
      collection: 'articles',
      recordId: 'graphify-code-knowledge-graph-deep-dive',
      fallback: { src: '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero.png' },
      generationEvidence: { candidateId: 'H01' },
    });
    expect(built.manifest).toEqual(active.manifest);
  }, 30_000);

  it('excludes a rights-warning review cover from both the manifest and immutable artifact bytes', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-rights-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    const reviewMediaRoot = join(sourceRoot, 'src', 'assets', 'content', 'reviews', 'rights-warning-review');
    await mkdir(reviewMediaRoot, { recursive: true });
    const coverBytes = await readFile(join(
      sourceRoot,
      'src',
      'assets',
      'content',
      'articles',
      'public-fixture',
      'hero.png',
    ));
    await writeFile(join(reviewMediaRoot, 'cover.png'), coverBytes);
    await writeFile(join(reviewMediaRoot, 'media.yml'), [
      'version: 1',
      'items:',
      '  - id: cover',
      '    file: cover.png',
      '    kind: book-cover',
      '    alt: 권리 경고 판본 표지',
      '    credit: Test bookseller',
      '    sourceUrl: https://example.com/rights-warning-cover.png',
      '    isbn13: "9788990247674"',
      '    edition: Test Publisher 2026 edition',
      '    verifiedAt: "2026-08-29"',
      '    rightsNote: Edition identification only; public redistribution is not approved.',
      '    width: 1',
      '    height: 1',
      `    checksum: ${fixtureChecksum}`,
      '',
    ].join('\n'));
    await writeFile(join(sourceRoot, 'src', 'content', 'reviews', 'rights-warning-review.mdx'), [
      '---',
      'title: Rights warning review',
      'description: The review remains public without its cover bytes.',
      'createdAt: "2026-08-29"',
      'updatedAt: "2026-08-29"',
      'status: published',
      'draft: false',
      'itemType: book',
      'itemTitle: Rights warning review',
      'itemAuthor: Test Author',
      'isbn13: "9788990247674"',
      'publisher: Test Publisher',
      'editionLabel: Test Publisher 2026 edition',
      'readEditionVerified: true',
      'verdict: The verdict remains visible.',
      'coverState: verified',
      'coverMedia: cover',
      '---',
      '',
      'The review body remains visible without its cover.',
      '',
    ].join('\n'));

    const built = await buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    });
    const record = built.manifest.records['reviews/rights-warning-review'];

    expect(record).toMatchObject({
      collection: 'reviews',
      coverState: 'verified',
      coverMedia: 'cover',
      readEditionVerified: true,
      media: [],
    });
    expect(built.manifest.assets['reviews/rights-warning-review/cover']).toBeUndefined();
    await expect(readFile(join(
      built.releasePath,
      'assets',
      'content',
      'reviews',
      'rights-warning-review',
      'cover.png',
    ))).rejects.toThrow();
  });

  it.each(['illustration', 'photo'] as const)(
    'rejects a review coverMedia reference whose source media kind is %s rather than exactly book-cover',
    async (kind) => {
      const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-kind-bypass-'));
      const sourceRoot = join(sandbox, 'source');
      await writeReleaseFixture(sourceRoot);
      await writeReviewCoverFixture(sourceRoot, { approved: false, kind });

      await expect(buildPublicRelease({
        root: sourceRoot,
        releasesRoot: join(sandbox, 'releases'),
      })).rejects.toThrow(/coverMedia.*kind.*book-cover/i);
    },
  );

  it('releases one synthetic cover only through its exact checksum-bound redistribution decision', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-approved-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    const { decisionPath, mediaChecksum } = await writeReviewCoverFixture(sourceRoot);

    const built = await buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    });
    const record = built.manifest.records['reviews/approved-review'];
    const asset = built.manifest.assets['reviews/approved-review/cover'];

    expect(record).toMatchObject({
      collection: 'reviews',
      coverMedia: 'cover',
      readEditionVerified: true,
      media: [expect.objectContaining({ id: 'cover', kind: 'book-cover', checksum: mediaChecksum })],
    });
    expect(asset).toMatchObject({
      collection: 'reviews',
      recordId: 'approved-review',
      id: 'cover',
      kind: 'book-cover',
      sourceChecksum: mediaChecksum,
      redistributionEvidence: {
        state: 'approved',
        decision: 'approve-public-redistribution',
        decisionDocument: decisionPath,
        decisionChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        sourceAsset: '/assets/content/reviews/approved-review/cover.png',
        sourceChecksum: mediaChecksum,
        width: 320,
        height: 480,
        isbn13: '9788990247674',
        edition: 'Test Publisher 2026 edition',
      },
    });
    await expect(readFile(join(
      built.releasePath,
      'assets',
      'content',
      'reviews',
      'approved-review',
      'cover.png',
    ))).resolves.toBeInstanceOf(Buffer);
  });

  it.each([
    ['missing decision document', { omitDecision: true }, /redistribution decision.*missing/i],
    ['forged receipt checksum', { receiptChecksum: `sha256:${'c'.repeat(64)}` }, /decision.*checksum.*changed/i],
    ['held decision', { mutation: 'hold' as ReviewCoverDecisionMutation }, /redistribution decision.*approved/i],
    ['wrong approved asset path', { mutation: 'asset-path' as ReviewCoverDecisionMutation }, /asset path.*approved/i],
    ['wrong approved asset checksum', { mutation: 'asset-checksum' as ReviewCoverDecisionMutation }, /asset checksum.*approved/i],
    ['wrong approved dimensions', { mutation: 'dimensions' as ReviewCoverDecisionMutation }, /asset width.*approved/i],
    ['wrong approved ISBN', { mutation: 'isbn13' as ReviewCoverDecisionMutation }, /edition isbn13.*approved/i],
    ['wrong approved edition label', { mutation: 'edition' as ReviewCoverDecisionMutation }, /edition label.*approved/i],
  ])('rejects a review cover approval with %s', async (_name, mutation, error) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-decision-tamper-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot, mutation);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });

  it('rejects an attacker-self-declared decision even after its receipt checksum is recomputed', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-self-authorized-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot, { registryMutation: 'unregistered' });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/not registered for independent approval/i);
  });

  it('rejects legacy arbitrary decidedBy, URL, and note fields even when their recomputed decision is registered', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-invented-evidence-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot, { legacySelfDeclaredEvidence: true });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/unrecognized key|approval/i);
  });

  it.each([
    ['missing role', ['controller']],
    ['duplicate role', ['controller', 'controller']],
    ['extra role', ['controller', 'independent-rights-reviewer', 'publisher']],
    ['spoofed role', ['controller', 'independent-rights-reviewer ']],
  ])('rejects an independently registered review-cover decision with %s', async (_name, approvalRoles) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-role-contract-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot, { approvalRoles });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/approvedBy.*exactly.*controller.*independent-rights-reviewer/i);
  });

  it.each([
    ['missing registry', 'missing' as ReviewCoverRegistryMutation, /approval registry is missing/i],
    ['tampered registry shape', 'invalid' as ReviewCoverRegistryMutation, /approval registry.*expected array/i],
    ['unregistered decision', 'unregistered' as ReviewCoverRegistryMutation, /not registered for independent approval/i],
    ['tampered registered decision checksum', 'decision-checksum' as ReviewCoverRegistryMutation, /registry decision checksum.*match/i],
    ['wrong registered source tuple', 'source-path' as ReviewCoverRegistryMutation, /registry source path.*match/i],
    ['wrong registered source URL', 'source-url' as ReviewCoverRegistryMutation, /registry source sourceUrl.*match/i],
  ])('rejects a review-cover decision with %s', async (_name, registryMutation, error) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-release-review-cover-registry-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot, { registryMutation });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });

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
