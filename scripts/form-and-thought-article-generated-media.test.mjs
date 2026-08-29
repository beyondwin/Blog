import { cp, access, appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { buildPublicRelease } from '../packages/content/src/release/build-release.ts';
import {
  parseGeneratedMediaApprovalRegistry,
} from '../packages/content/src/media/generated-media-approval-registry.mjs';
import { validateGeneratedMediaInventory } from '../packages/content/src/media/validate-generated-media-inventory.ts';
import { validateMediaRepository } from './validate-media.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = 'packages/content/generated-media-approval-batches.json';
const agentsDecisionPath = 'docs/notes/project/assets/form-and-thought-generated/articles/decision-manifest-agents.yml';
const agentsMediaPath = 'src/assets/content/articles/andrej-karpathy-skills-analysis/media.yml';
const agentsAssetPath = 'src/assets/content/articles/andrej-karpathy-skills-analysis/editorial-hero.png';
const requiredBatches = ['calibration', 'agents', 'design', 'data-search', 'architecture-validation'];
const selectedCandidates = [
  'H01', 'A03', 'T01',
  'AG01', 'AG02', 'AG03', 'AG04', 'AG05',
  'DS01', 'DS03',
  'DT01',
  'AV01', 'AV02', 'AV03', 'AV05',
];
const heldCandidates = ['DS02', 'DT02', 'AV04', 'AV06'];
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function copyPhaseBRepository() {
  const root = await mkdtemp(join(tmpdir(), 'form-thought-article-media-'));
  roots.push(root);
  await Promise.all([
    cp(join(repositoryRoot, 'src'), join(root, 'src'), { recursive: true }),
    cp(join(repositoryRoot, 'docs'), join(root, 'docs'), { recursive: true }),
  ]);
  await mkdir(join(root, 'packages', 'content'), { recursive: true });
  await Promise.all([
    cp(join(repositoryRoot, registryPath), join(root, registryPath)),
    cp(
      join(repositoryRoot, 'packages/content/review-cover-redistribution-approvals.json'),
      join(root, 'packages/content/review-cover-redistribution-approvals.json'),
    ),
  ]);
  return root;
}

async function requireAgentsBatch(root) {
  await expect(access(join(root, agentsDecisionPath))).resolves.toBeUndefined();
  await expect(access(join(root, agentsMediaPath))).resolves.toBeUndefined();
  await expect(access(join(root, agentsAssetPath))).resolves.toBeUndefined();
}

async function expectBothGatesToFail(root, pattern) {
  await expect(buildPublicRelease({
    root,
    releasesRoot: join(root, '.test-releases'),
  })).rejects.toThrow(pattern);

  const strict = await validateMediaRepository(root, { strict: true });
  expect(strict.errors).toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
}

describe('FORM & THOUGHT approved article generated-media batches', () => {
  it('registers exactly the approved Phase B candidates and keeps every HOLD candidate text-led', async () => {
    const registry = parseGeneratedMediaApprovalRegistry(
      await readFile(join(repositoryRoot, registryPath), 'utf8'),
      registryPath,
    );

    expect(registry.batches.map((batch) => batch.batchId)).toEqual(requiredBatches);
    expect(registry.batches.flatMap((batch) => batch.selections.map((selection) => selection.candidateId)))
      .toEqual(selectedCandidates);
    expect(registry.batches.flatMap((batch) => batch.selections.map((selection) => selection.candidateId)))
      .not.toEqual(expect.arrayContaining(heldCandidates));

    const approved = await validateGeneratedMediaInventory(repositoryRoot);
    expect(approved).toHaveLength(selectedCandidates.length);
  });

  it.each([
    {
      name: 'required batch deletion',
      pattern: /required generated approval batch.*agents.*missing/i,
      mutate: async (root) => {
        await rm(dirname(join(root, agentsDecisionPath)), { recursive: true });
      },
    },
    {
      name: 'decision manifest tamper',
      pattern: /required generated approval batch.*agents.*checksum changed/i,
      mutate: async (root) => {
        await appendFile(join(root, agentsDecisionPath), '\n# tampered\n');
      },
    },
    {
      name: 'unregistered selection tuple',
      pattern: /required generated approval batch.*agents.*registered selection/i,
      mutate: async (root) => {
        const path = join(root, registryPath);
        const registry = JSON.parse(await readFile(path, 'utf8'));
        registry.batches.find((batch) => batch.batchId === 'agents').selections[0].mediaId = 'unregistered-selection';
        await writeFile(path, `${JSON.stringify(registry)}\n`);
      },
    },
    {
      name: 'HOLD candidate binding',
      pattern: /generated candidate.*does not match|generated candidate.*not in an approved decision/i,
      mutate: async (root) => {
        const path = join(root, agentsMediaPath);
        const media = parseYaml(await readFile(path, 'utf8'));
        media.items[0].generation.candidateId = 'AV04';
        await writeFile(path, stringifyYaml(media, { lineWidth: 0 }));
      },
    },
    {
      name: 'approved source checksum drift',
      pattern: /checksum does not match/i,
      mutate: async (root) => {
        await appendFile(join(root, agentsAssetPath), Buffer.from([0]));
      },
    },
    {
      name: 'generated media downgrade',
      pattern: /repository-generated|sourceKind/i,
      mutate: async (root) => {
        const path = join(root, agentsMediaPath);
        const media = parseYaml(await readFile(path, 'utf8'));
        delete media.items[0].sourceKind;
        delete media.items[0].generation;
        await writeFile(path, stringifyYaml(media, { lineWidth: 0 }));
      },
    },
  ])('fails both immutable release and strict media gates for $name', async ({ mutate, pattern }) => {
    const root = await copyPhaseBRepository();
    await requireAgentsBatch(root);
    await mutate(root);
    await expectBothGatesToFail(root, pattern);
  });
});
