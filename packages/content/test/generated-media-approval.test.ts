import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { buildPublicRelease } from '../src/release/build-release';
import { readActiveRelease } from '../src/release/read-release';
import { writeReleaseFixture } from './helpers/release-fixture';

const evidencePath = 'docs/notes/project/assets/form-and-thought-generated/calibration/decision-manifest.yml';
const contactSheetPath = 'docs/notes/project/assets/form-and-thought-generated/calibration/approved-contact-sheet.png';
const boundedRightsNote = 'Repository publication approved with caveat: non-exclusive generated output; copyrightability/uniqueness not guaranteed';

function sha256(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function put(root: string, relativePath: string, contents: Buffer | string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function writeGeneratedFixture(
  root: string,
  options: {
    approvalState?: 'approved' | 'pending';
    rightsState?: 'approved' | 'pending';
    approvalRoles?: string[];
    contactPath?: string;
    omitGeneration?: boolean;
    omitSourceKind?: boolean;
    rightsNote?: string;
  } = {},
): Promise<void> {
  await writeReleaseFixture(root);
  const approvalState = options.approvalState ?? 'approved';
  const rightsState = options.rightsState ?? 'approved';
  const assetPath = 'src/assets/content/articles/public-fixture/hero.png';
  const assetBytes = await readFile(join(root, assetPath));
  const fixtureContactPath = options.contactPath ?? contactSheetPath;
  const contactSheetBytes = Buffer.from('approved-contact-sheet-fixture');
  await put(root, fixtureContactPath, contactSheetBytes);
  const decision = {
    version: 1,
    batchId: 'calibration',
    generator: {
      provider: 'openai',
      generator: 'codex-built-in-image-generation',
      model: 'not-exposed-by-built-in-tool',
      modelVersion: 'not-exposed-by-built-in-tool',
      promptVersion: 'form-and-thought-calibration-v1',
      generatedAt: '2026-08-29T02:53:35+09:00',
    },
    approval: {
      state: approvalState,
      selectedCandidateIds: ['H01'],
      approvedBy: options.approvalRoles ?? ['controller', 'independent-visual-reviewer'],
      recordedAt: '2026-08-29T03:24:41+09:00',
      evidence: 'Fixed test approval evidence.',
    },
    rightsReview: {
      state: rightsState,
      decision: 'approve-repository-publication',
      checkedAt: '2026-08-29',
      decidedBy: 'controller',
      caveat: 'non-exclusive generated output; copyrightability/uniqueness not guaranteed',
      sources: [
        { url: 'https://openai.com/policies/terms-of-use', checkedAt: '2026-08-29' },
        { url: 'https://openai.com/policies/service-terms/', checkedAt: '2026-08-29' },
      ],
      inspection: {
        externalImageInputs: false,
        namedOrLivingArtist: false,
        recognizablePersonOrProduct: false,
        readableMark: false,
      },
    },
    approvedContactSheet: {
      path: fixtureContactPath,
      checksum: sha256(contactSheetBytes),
    },
    assets: [{
      candidateId: 'H01',
      slot: 'homePick/indexLandscape',
      collection: 'articles',
      recordId: 'public-fixture',
      mediaId: 'hero',
      file: 'hero.png',
      sourcePath: assetPath,
      checksum: sha256(assetBytes),
      width: 1,
      height: 1,
    }],
  };
  const decisionBytes = stringifyYaml(decision, { lineWidth: 0 });
  await put(root, evidencePath, decisionBytes);

  const mediaPath = join(root, 'src/assets/content/articles/public-fixture/media.yml');
  const media = parseYaml(await readFile(mediaPath, 'utf8'));
  delete media.items[0].sourceUrl;
  media.items[0].sourcePath = evidencePath;
  if (!options.omitSourceKind) media.items[0].sourceKind = 'repository-generated';
  if (!options.omitGeneration) {
    media.items[0].generation = {
      provider: 'openai',
      generator: 'codex-built-in-image-generation',
      model: 'not-exposed-by-built-in-tool',
      modelVersion: 'not-exposed-by-built-in-tool',
      promptVersion: 'form-and-thought-calibration-v1',
      candidateId: 'H01',
      decisionManifestChecksum: sha256(decisionBytes),
    };
  }
  media.items[0].rightsNote = options.rightsNote ?? boundedRightsNote;
  await writeFile(mediaPath, stringifyYaml(media, { lineWidth: 0 }));
}

describe('generated media approval and immutable evidence', () => {
  it('keeps prompt/provider private while preserving the approved evidence locator and checksum', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-approved-'));
    const sourceRoot = join(sandbox, 'source');
    const releasesRoot = join(sandbox, 'releases');
    await writeGeneratedFixture(sourceRoot);

    const built = await buildPublicRelease({ root: sourceRoot, releasesRoot });
    const active = await readActiveRelease(releasesRoot);
    const publicMedia = active.manifest.records['articles/public-fixture']?.media[0];
    const releaseAsset = active.manifest.assets['articles/public-fixture/hero'];

    expect(publicMedia).toBeDefined();
    expect(publicMedia).not.toHaveProperty('generation');
    expect(publicMedia).not.toHaveProperty('provider');
    expect(publicMedia).not.toHaveProperty('promptVersion');
    expect(publicMedia?.rightsNote).toBe(boundedRightsNote);
    expect(releaseAsset?.generationEvidence).toEqual({
      decisionManifest: evidencePath,
      decisionManifestChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      candidateId: 'H01',
    });
    expect(built.manifest).toEqual(active.manifest);
  });

  it.each([
    ['generation metadata', { omitGeneration: true }, /repository-generated.*generation/i],
    ['explicit source kind', { omitSourceKind: true }, /sourceKind.*repository-generated/i],
    ['both generated markers', { omitGeneration: true, omitSourceKind: true }, /decision-bound.*repository-generated/i],
  ])('fails closed when decision-bound media omits %s', async (_name, options, error) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-omission-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, options);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });

  it('fails closed when source rights text is stronger than the bounded decision ruling', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-rights-note-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, {
      rightsNote: 'Exclusive ownership and full indemnity guaranteed.',
    });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/rightsNote.*approved decision/i);
  });

  it.each([
    ['missing independent reviewer', ['controller']],
    ['empty approval roles', []],
    ['extra approval role', ['controller', 'independent-visual-reviewer', 'publisher']],
  ])('fails closed for %s', async (_name, approvalRoles) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-roles-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, { approvalRoles });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/approvedBy.*controller.*independent-visual-reviewer/i);
  });

  it.each([
    ['an arbitrary repository file', 'package.json'],
    ['a different evidence batch', 'docs/notes/project/assets/form-and-thought-generated/other/approved-contact-sheet.png'],
  ])('fails closed when the approved contact sheet points to %s', async (_name, contactPath) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-contact-path-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, { contactPath });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/approvedContactSheet.*same batch/i);
  });

  it.each([
    ['approval', { approvalState: 'pending' as const }, /approval.*approved/i],
    ['rights review', { rightsState: 'pending' as const }, /rights.*approved/i],
  ])('fails closed when generated-media %s is not approved', async (_name, options, error) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-hold-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, options);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });

  it('fails closed when the decision manifest checksum drifts', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-checksum-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    await writeFile(join(sourceRoot, evidencePath), '\n# drift\n', { flag: 'a' });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/decision manifest checksum/i);
  });

  it('fails closed when the approved contact sheet checksum drifts', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-contact-sheet-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    await writeFile(join(sourceRoot, contactSheetPath), Buffer.from('drifted-contact-sheet'));

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/contact sheet checksum/i);
  });
});
