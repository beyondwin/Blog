import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    unfeaturedState?: 'valid' | 'downgraded' | 'orphaned' | 'decision-checksum-tamper'
      | 'decision-path-tamper' | 'ordinary-path-reuse' | 'candidate-reuse';
  } = {},
): Promise<void> {
  await writeReleaseFixture(root);
  const approvalState = options.approvalState ?? 'approved';
  const rightsState = options.rightsState ?? 'approved';
  const assetPath = 'src/assets/content/articles/public-fixture/hero.png';
  const assetBytes = await readFile(join(root, assetPath));
  const unfeaturedAssetPath = 'src/assets/content/articles/public-fixture/unfeatured.png';
  const unfeaturedAssetBytes = assetBytes;
  await put(root, unfeaturedAssetPath, unfeaturedAssetBytes);
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
      selectedCandidateIds: ['H01', 'H02'],
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
    assets: [
      {
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
      },
      {
        candidateId: 'A03',
        slot: 'homeHero',
        collection: 'articles',
        recordId: 'public-fixture',
        mediaId: 'unfeatured',
        file: 'unfeatured.png',
        sourcePath: unfeaturedAssetPath,
        checksum: sha256(unfeaturedAssetBytes),
        width: 1,
        height: 1,
      },
      {
        candidateId: 'T01',
        slot: 'detailHero',
        collection: 'articles',
        recordId: 'public-fixture',
        mediaId: 'third',
        file: 'third.png',
        sourcePath: 'src/assets/content/articles/public-fixture/third.png',
        checksum: sha256(unfeaturedAssetBytes),
        width: 1,
        height: 1,
      },
    ],
  };
  decision.approval.selectedCandidateIds = ['H01', 'A03', 'T01'];
  const unfeaturedDecision = decision.assets[1];
  if (options.unfeaturedState === 'decision-checksum-tamper') {
    unfeaturedDecision.checksum = `sha256:${'b'.repeat(64)}`;
  } else if (options.unfeaturedState === 'decision-path-tamper') {
    unfeaturedDecision.sourcePath = 'src/assets/content/articles/public-fixture/tampered.png';
  }
  const decisionBytes = stringifyYaml(decision, { lineWidth: 0 });
  await put(root, evidencePath, decisionBytes);
  await put(root, 'packages/content/generated-media-approval-batches.json', `${JSON.stringify({
    version: 1,
    batches: [{
      batchId: 'calibration',
      decisionManifest: evidencePath,
      decisionManifestChecksum: sha256(decisionBytes),
      selections: decision.assets.map(({ candidateId, collection, recordId, mediaId }) => ({
        candidateId,
        collection,
        recordId,
        mediaId,
      })),
    }],
  })}\n`);

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
  const unfeaturedItem = {
    id: 'unfeatured',
    file: 'unfeatured.png',
    kind: 'illustration',
    alt: 'An approved unfeatured fixture',
    credit: 'beyondwin test',
    sourcePath: evidencePath,
    sourceKind: 'repository-generated',
    generation: {
      provider: 'openai',
      generator: 'codex-built-in-image-generation',
      model: 'not-exposed-by-built-in-tool',
      modelVersion: 'not-exposed-by-built-in-tool',
      promptVersion: 'form-and-thought-calibration-v1',
      candidateId: 'A03',
      decisionManifestChecksum: sha256(decisionBytes),
    },
    verifiedAt: '2026-08-29',
    rightsNote: boundedRightsNote,
    width: 1,
    height: 1,
    checksum: sha256(unfeaturedAssetBytes),
  };
  const thirdItem = {
    ...unfeaturedItem,
    id: 'third',
    file: 'third.png',
    generation: { ...unfeaturedItem.generation, candidateId: 'T01' },
  };
  await put(root, 'src/assets/content/articles/public-fixture/third.png', unfeaturedAssetBytes);
  if (options.unfeaturedState === 'downgraded') {
    unfeaturedItem.sourcePath = 'docs/source.md';
    delete (unfeaturedItem as Partial<typeof unfeaturedItem>).sourceKind;
    delete (unfeaturedItem as Partial<typeof unfeaturedItem>).generation;
    await put(root, 'docs/source.md', '# ordinary source\n');
  }
  if (options.unfeaturedState !== 'orphaned') media.items.push(unfeaturedItem);
  media.items.push(thirdItem);
  if (options.unfeaturedState === 'ordinary-path-reuse') {
    media.items.push({
      ...unfeaturedItem,
      id: 'ordinary-reuse',
      sourcePath: 'docs/source.md',
      sourceKind: undefined,
      generation: undefined,
    });
    await put(root, 'docs/source.md', '# ordinary source\n');
  }
  if (options.unfeaturedState === 'candidate-reuse') {
    const impostorPath = 'src/assets/content/articles/public-fixture/impostor.png';
    await put(root, impostorPath, unfeaturedAssetBytes);
    media.items.push({
      ...unfeaturedItem,
      id: 'impostor',
      file: 'impostor.png',
    });
  }
  await writeFile(mediaPath, stringifyYaml(media, { lineWidth: 0 }));
}

async function downgradeAllGeneratedEntriesAndDeleteEvidence(root: string): Promise<void> {
  const mediaPath = join(root, 'src/assets/content/articles/public-fixture/media.yml');
  const media = parseYaml(await readFile(mediaPath, 'utf8'));
  await put(root, 'docs/source.md', '# ordinary source\n');
  for (const item of media.items) {
    delete item.sourceKind;
    delete item.generation;
    delete item.sourceUrl;
    item.sourcePath = 'docs/source.md';
  }
  await writeFile(mediaPath, stringifyYaml(media, { lineWidth: 0 }));
  await rm(join(root, 'docs/notes/project/assets/form-and-thought-generated/calibration'), { recursive: true });
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
    ['duplicate approval role', ['controller', 'controller', 'independent-visual-reviewer']],
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
    ['downgraded selected asset', 'downgraded' as const, /approved generated asset.*unfeatured.*repository-generated/i],
    ['orphaned selected asset', 'orphaned' as const, /approved generated asset.*unfeatured.*missing/i],
    ['tampered selected checksum', 'decision-checksum-tamper' as const, /approved generated asset.*unfeatured.*checksum/i],
    ['tampered selected source path', 'decision-path-tamper' as const, /approved generated asset.*unfeatured.*sourcePath/i],
    ['ordinary approved-path reuse', 'ordinary-path-reuse' as const, /ordinary media.*approved generated source path/i],
    ['duplicate candidate claim', 'candidate-reuse' as const, /generated candidate.*A03.*claimed more than once/i],
  ])('reverse inventory rejects %s even when the asset is unfeatured', async (_name, unfeaturedState, error) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-reverse-inventory-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot, { unfeaturedState });

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(error);
  });

  it('fails closed when the registered evidence batch is deleted and all three selected sources are downgraded', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-deleted-batch-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    await downgradeAllGeneratedEntriesAndDeleteEvidence(sourceRoot);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/required generated approval batch.*calibration.*missing/i);
  });

  it('fails closed when a required registered decision manifest is missing', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-missing-manifest-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    await rm(join(sourceRoot, evidencePath));

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/required generated approval batch.*calibration.*manifest.*missing/i);
  });

  it('rejects an unregistered generated approval batch', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-unregistered-batch-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    const decision = parseYaml(await readFile(join(sourceRoot, evidencePath), 'utf8'));
    decision.batchId = 'unregistered';
    decision.approvedContactSheet.path = 'docs/notes/project/assets/form-and-thought-generated/unregistered/approved-contact-sheet.png';
    await put(sourceRoot, decision.approvedContactSheet.path, Buffer.from('unregistered contact'));
    decision.approvedContactSheet.checksum = sha256(Buffer.from('unregistered contact'));
    await put(
      sourceRoot,
      'docs/notes/project/assets/form-and-thought-generated/unregistered/decision-manifest.yml',
      stringifyYaml(decision, { lineWidth: 0 }),
    );

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/unregistered generated approval batch.*unregistered/i);
  });

  it.each([
    ['reserved legacy-style filename', 'decision-manifest.yml'],
    ['empty batch suffix', 'decision-manifest-.yml'],
    ['underscore separator', 'decision-manifest_agents.yml'],
    ['uppercase batch identifier', 'decision-manifest-AGENTS.yml'],
  ])('rejects a malformed article approval manifest with %s', async (_name, filename) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-malformed-article-manifest-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    const decisionBytes = await readFile(join(sourceRoot, evidencePath));
    await put(
      sourceRoot,
      `docs/notes/project/assets/form-and-thought-generated/articles/${filename}`,
      decisionBytes,
    );

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/malformed generated article approval manifest/i);
  });

  it('fails closed when a registered selected tuple does not exist in the decision manifest', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-generated-media-selection-anchor-'));
    const sourceRoot = join(sandbox, 'source');
    await writeGeneratedFixture(sourceRoot);
    const registryPath = join(sourceRoot, 'packages/content/generated-media-approval-batches.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.batches[0].selections[1].mediaId = 'missing-selection';
    await writeFile(registryPath, `${JSON.stringify(registry)}\n`);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).rejects.toThrow(/required generated approval batch.*calibration.*registered selection/i);
  });

  it('keeps ordinary release repositories compatible through an explicit empty registry', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'beyondwin-ordinary-media-registry-'));
    const sourceRoot = join(sandbox, 'source');
    await writeReleaseFixture(sourceRoot);

    await expect(buildPublicRelease({
      root: sourceRoot,
      releasesRoot: join(sandbox, 'releases'),
    })).resolves.toMatchObject({ manifest: { schemaVersion: 1 } });
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
