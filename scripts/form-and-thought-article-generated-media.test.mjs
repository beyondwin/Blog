import { cp, access, appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { recordsForCollection } from '../apps/site/app/release.server.ts';
import { ARTICLE_TOPICS } from '../apps/site/src/ui/articles/articleTopics.ts';
import { buildPublicRelease } from '../packages/content/src/release/build-release.ts';
import { readActiveRelease } from '../packages/content/src/release/read-release.ts';
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
const articleBriefsPath = 'docs/notes/project/assets/form-and-thought-generated/articles/topic-family-image-briefs.yml';
const requiredBatches = ['calibration', 'agents', 'design', 'data-search', 'architecture-validation'];
const selectedCandidates = [
  'H01', 'A03', 'T01',
  'AG01', 'AG02', 'AG03', 'AG04', 'AG05',
  'DS01', 'DS03',
  'DT01',
  'AV01', 'AV02', 'AV03', 'AV05',
];
const heldCandidates = ['DS02', 'DT02', 'AV04', 'AV06'];
const articleDecisions = ['retain', 'replace', 'add'];
const articleFamilies = [
  'people-action',
  'tool-workbench',
  'data-structure',
  'boundary-evidence',
  'design-material',
  'reading-reflection',
];
const cameraDistances = ['close', 'medium', 'wide'];
const genericBriefValue = /^(?:tbd|todo|n\/?a|none|article|content|image|subject|action|대표 이미지|내용에 맞는 이미지)$/iu;
const roots = [];
let articleBriefEvidencePromise;

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

async function loadArticleBriefEvidence() {
  articleBriefEvidencePromise ??= (async () => {
    const root = await copyPhaseBRepository();
    const releasesRoot = join(root, '.test-releases');
    await buildPublicRelease({
      root,
      releasesRoot,
    });
    const verified = await readActiveRelease(releasesRoot);
    return {
      briefs: parseYaml(await readFile(join(root, articleBriefsPath), 'utf8')),
      visibleArticleIds: recordsForCollection(verified, 'articles').map(({ id }) => id),
    };
  })();
  return articleBriefEvidencePromise;
}

function expectConcreteBriefValue(value, field, recordId) {
  expect(typeof value, `${recordId}.${field} must be a string`).toBe('string');
  const normalized = value.trim();
  expect(normalized.length, `${recordId}.${field} must be specific`).toBeGreaterThanOrEqual(4);
  expect(normalized, `${recordId}.${field} must not be generic`).not.toMatch(genericBriefValue);
}

function expectNormalizedTuple(value, length, field, recordId) {
  expect(value, `${recordId}.${field} must contain ${length} normalized values`).toHaveLength(length);
  for (const coordinate of value) {
    expect(typeof coordinate, `${recordId}.${field} values must be numbers`).toBe('number');
    expect(coordinate, `${recordId}.${field} values must be normalized`).toBeGreaterThanOrEqual(0);
    expect(coordinate, `${recordId}.${field} values must be normalized`).toBeLessThanOrEqual(1);
  }
}

describe('FORM & THOUGHT article topic-family image-brief ledger', () => {
  it('matches the complete topic inventory in exact visible release order', async () => {
    const { briefs, visibleArticleIds } = await loadArticleBriefEvidence();
    const recordIds = briefs.articles.map(({ recordId }) => recordId);
    const topicIds = Object.keys(ARTICLE_TOPICS);

    expect(briefs.version).toBe(1);
    expect(recordIds).toHaveLength(17);
    expect(new Set(recordIds).size).toBe(17);
    expect([...recordIds].sort()).toEqual([...topicIds].sort());
    expect(recordIds).toEqual(visibleArticleIds);
  }, 30_000);

  it('uses only controlled decisions, families, camera distances, and concrete semantic fields', async () => {
    const { briefs } = await loadArticleBriefEvidence();

    for (const brief of briefs.articles) {
      expect(articleDecisions, `${brief.recordId}.decision`).toContain(brief.decision);
      expect(articleFamilies, `${brief.recordId}.family`).toContain(brief.family);
      expect(cameraDistances, `${brief.recordId}.cameraDistance`).toContain(brief.cameraDistance);
      for (const field of ['claim', 'mustNotImply', 'action', 'subject', 'reason']) {
        expectConcreteBriefValue(brief[field], field, brief.recordId);
      }
    }
  }, 30_000);

  it('keeps focal points and safe areas normalized, ordered, and non-empty', async () => {
    const { briefs } = await loadArticleBriefEvidence();

    for (const brief of briefs.articles) {
      expectNormalizedTuple(brief.focalPoint, 2, 'focalPoint', brief.recordId);
      expectNormalizedTuple(brief.safeArea, 4, 'safeArea', brief.recordId);
      const [left, top, right, bottom] = brief.safeArea;
      expect(left, `${brief.recordId}.safeArea left must precede right`).toBeLessThan(right);
      expect(top, `${brief.recordId}.safeArea top must precede bottom`).toBeLessThan(bottom);
    }
  }, 30_000);

  it('avoids triple repetition of family, camera distance, or concrete subject in visible order', async () => {
    const { briefs } = await loadArticleBriefEvidence();

    for (let index = 0; index <= briefs.articles.length - 3; index += 1) {
      const window = briefs.articles.slice(index, index + 3);
      for (const field of ['family', 'cameraDistance', 'subject']) {
        expect(new Set(window.map((brief) => brief[field])).size, `${field} repeats for ${window.map(({ recordId }) => recordId).join(', ')}`)
          .toBeGreaterThan(1);
      }
    }
  }, 30_000);

  it('reserves exactly two two-candidate rounds only for add and replace records', async () => {
    const { briefs } = await loadArticleBriefEvidence();
    const generationBriefs = briefs.articles.filter(({ decision }) => decision !== 'retain');
    const candidateIds = [];

    for (const brief of briefs.articles) {
      if (brief.decision === 'retain') {
        expect(brief.candidateRounds, `${brief.recordId} retain must not reserve candidates`).toBeUndefined();
        continue;
      }
      expect(brief.candidateRounds, `${brief.recordId} ${brief.decision} must reserve candidates`).toHaveLength(2);
      for (const round of brief.candidateRounds) {
        expect(round, `${brief.recordId} candidate round must contain two IDs`).toHaveLength(2);
        for (const candidateId of round) {
          expect(candidateId).toMatch(/^TR\d{2}$/u);
          candidateIds.push(candidateId);
        }
      }
    }

    expect(candidateIds).toHaveLength(generationBriefs.length * 4);
    expect(new Set(candidateIds).size).toBe(candidateIds.length);
    expect(candidateIds).toEqual(candidateIds.map((_, index) => `TR${String(index + 1).padStart(2, '0')}`));
  }, 30_000);
});

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
