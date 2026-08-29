import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPublicRelease } from '../src/release/build-release';
import { parseReleaseManifest, type PublicReleaseManifest } from '../src/release/read-release';
import { writeReleaseFixture, writeReviewCoverFixture } from './helpers/release-fixture';

function cloneManifest(manifest: PublicReleaseManifest): PublicReleaseManifest {
  return structuredClone(manifest);
}

describe('direct review-cover read boundary', () => {
  let sandbox: string;
  let manifest: PublicReleaseManifest;

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-read-release-review-cover-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);
    await writeReviewCoverFixture(sourceRoot);
    manifest = (await buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).manifest;
  }, 30_000);

  afterAll(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('accepts exact ordered bibliographic identity while omitting private rights evidence', () => {
    const parsed = parseReleaseManifest(cloneManifest(manifest));
    const record = parsed.records['reviews/approved-review'];
    const asset = parsed.assets['reviews/approved-review/cover'];

    expect(record).toMatchObject({
      itemTitle: 'Approved review',
      authors: ['Test Author', 'Second Author'],
      publisher: 'Test Publisher',
      isbn13: '9788990247674',
      editionLabel: 'Test Publisher 2026 edition',
      publicationYear: 2026,
    });
    expect(asset?.redistributionEvidence?.bibliographicIdentity).toEqual({
      title: 'Approved review',
      authors: ['Test Author', 'Second Author'],
      publisher: 'Test Publisher',
      isbn13: '9788990247674',
      editionLabel: 'Test Publisher 2026 edition',
      publicationYear: 2026,
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /rightsEvidence|evidencePath|evidenceUrl|evidenceChecksum|retrievedAt|public website redistribution/u,
    );
  });

  it('rejects author reordering even when every author remains present', () => {
    const forged = cloneManifest(manifest);
    const record = forged.records['reviews/approved-review'];
    if (!record || record.collection !== 'reviews') throw new Error('missing review fixture');
    record.authors = ['Second Author', 'Test Author'];

    expect(() => parseReleaseManifest(forged)).toThrow(/bibliographic identity authors/i);
  });

  it('rejects a forged identity copied into both public media and responsive asset', () => {
    const forged = cloneManifest(manifest);
    const record = forged.records['reviews/approved-review'];
    const asset = forged.assets['reviews/approved-review/cover'];
    if (!record || record.collection !== 'reviews' || !asset?.redistributionEvidence) {
      throw new Error('missing review fixture');
    }
    const media = record.media.find((entry) => entry.id === 'cover');
    if (!media?.redistributionEvidence) throw new Error('missing public cover fixture');
    media.redistributionEvidence.bibliographicIdentity.title = 'Forged title';
    asset.redistributionEvidence.bibliographicIdentity.title = 'Forged title';

    expect(() => parseReleaseManifest(forged)).toThrow(/bibliographic identity title/i);
  });

  it.each(['rightsEvidence', 'evidencePath', 'evidenceUrl', 'evidenceChecksum', 'retrievedAt', 'scope'])(
    'rejects private field %s copied into a release asset',
    (field) => {
      const forged = cloneManifest(manifest) as PublicReleaseManifest & {
        assets: Record<string, Record<string, unknown>>;
      };
      forged.assets['reviews/approved-review/cover']![field] = field === 'rightsEvidence'
        ? { type: 'written-permission' }
        : 'private';
      expect(() => parseReleaseManifest(forged)).toThrow();
    },
  );

  it('accepts absence of publicationYear only when record, media, and asset all omit it', async () => {
    const noYearSandbox = await mkdtemp(join(tmpdir(), 'beyondwin-read-release-review-cover-no-year-'));
    try {
      const sourceRoot = join(noYearSandbox, 'source');
      await writeReleaseFixture(sourceRoot);
      await writeReviewCoverFixture(sourceRoot, { omitPublicationYear: true });
      const noYear = (await buildPublicRelease({
        root: sourceRoot,
        releasesRoot: join(noYearSandbox, 'releases'),
      })).manifest;

      expect(() => parseReleaseManifest(cloneManifest(noYear))).not.toThrow();
      expect(noYear.records['reviews/approved-review']).not.toHaveProperty('publicationYear');
      expect(noYear.assets['reviews/approved-review/cover']?.redistributionEvidence?.bibliographicIdentity)
        .not.toHaveProperty('publicationYear');
    } finally {
      await rm(noYearSandbox, { recursive: true, force: true });
    }
  }, 30_000);
});
