import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicAnswerCorpusApproval } from '@beyondwin/contracts';
import { canonicalPublicRecordChecksum } from '../src/answer-release/identity';
import { buildPublicRelease } from '../src/release/build-release';
import { readActiveRelease, type VerifiedActivePublicRelease } from '../src/release/read-release';
import { writeReleaseFixture } from './helpers/release-fixture';

const repositoryRoot = process.cwd();
const cliPath = resolve(repositoryRoot, 'packages/content/src/answer-release/cli.ts');
const tsxLoader = resolve(repositoryRoot, 'node_modules/tsx/dist/loader.mjs');
const evalFixturePath = resolve(repositoryRoot, 'tests/fixtures/public-answer/eval-manifest.v1.json');
const trackedApprovalPath = resolve(repositoryRoot, 'src/data/public-answer-corpus-approval.v1.json');
const sandboxes: string[] = [];

type CliResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type CliFixture = {
  root: string;
  approvalPath: string;
  answerReleasesRoot: string;
  contentRelease: VerifiedActivePublicRelease;
};

async function createCliFixture(options: { thoughtProse?: string } = {}): Promise<CliFixture> {
  const root = await mkdtemp(join(
    process.env.TMPDIR ?? '/tmp',
    'beyondwin-answer-cli-',
  ));
  sandboxes.push(root);
  await writeReleaseFixture(root, { featuredMedia: false });
  await writeFile(join(root, 'src/content/thoughts/why-i-read-in-the-ai-era.mdx'), [
    '---',
    'title: Verified thought fixture',
    'description: A checksum-bound candidate fixture.',
    'createdAt: "2026-08-30"',
    'updatedAt: "2026-08-30"',
    'status: published',
    'draft: false',
    'includeInAnswers: true',
    '---',
    '',
    '## Fixture heading',
    '',
    options.thoughtProse ?? 'CLI_CHUNK_SECRET must never cross the command output boundary.',
    '',
  ].join('\n'));
  const publicReleasesRoot = join(root, 'build/public-releases');
  await buildPublicRelease({ root, releasesRoot: publicReleasesRoot });
  const evalDirectory = join(root, 'tests/fixtures/public-answer');
  await mkdir(evalDirectory, { recursive: true });
  await copyFile(evalFixturePath, join(evalDirectory, 'eval-manifest.v1.json'));
  return {
    root,
    approvalPath: join(root, 'src/data/public-answer-corpus-approval.v1.json'),
    answerReleasesRoot: join(root, 'build/public-answer-releases'),
    contentRelease: await readActiveRelease(publicReleasesRoot),
  };
}

function runCli(root: string, ...args: string[]): CliResult {
  const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: undefined },
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseBoundedJson(result: CliResult, keys: readonly string[]): Record<string, unknown> {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout.endsWith('\n')).toBe(true);
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  expect(Object.keys(output).sort()).toEqual([...keys].sort());
  return output;
}

function expectNoCorpusLeak(result: CliResult): void {
  const output = `${result.stdout}\n${result.stderr}`;
  expect(output).not.toContain('CLI_CHUNK_SECRET');
  expect(output).not.toContain('AI 시대에도 왜 계속 책을 읽나요?');
  expect(output).not.toMatch(/bodyHtml|sourcePath|manifest payload|rawPrompt|providerResponse|provider response/iu);
}

async function writeApproval(path: string, approval: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(approval)}\n`);
}

async function expectAnswerReleaseSurfaceAbsent(answerReleasesRoot: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(answerReleasesRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  expect(entries).toEqual([]);
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('public answer release CLI', { timeout: 90_000 }, () => {
  it('derives the sole approval candidate from the verified public release without receipt or answer side effects', async () => {
    const fixture = await createCliFixture();
    const result = runCli(fixture.root, 'approval-candidate', 'thoughts/why-i-read-in-the-ai-era');
    const output = parseBoundedJson(result, ['schemaVersion', 'entries']);
    const materialized = Object.values(fixture.contentRelease.manifest.records)
      .find((record) => record.collection === 'thoughts' && record.id === 'why-i-read-in-the-ai-era')!;
    const expectedChecksum = canonicalPublicRecordChecksum(materialized);

    expect(output).toEqual({
      entries: [{
        recordChecksum: expectedChecksum,
        recordId: 'thoughts/why-i-read-in-the-ai-era',
      }],
      schemaVersion: 1,
    });
    await expect(readFile(fixture.approvalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expectAnswerReleaseSurfaceAbsent(fixture.answerReleasesRoot);
    expectNoCorpusLeak(result);

    const changed = await createCliFixture({
      thoughtProse: 'Changed verified public bytes produce a different checksum-bound candidate.',
    });
    const changedResult = runCli(changed.root, 'approval-candidate', 'thoughts/why-i-read-in-the-ai-era');
    const changedOutput = parseBoundedJson(changedResult, ['schemaVersion', 'entries']) as {
      entries: Array<{ recordChecksum: string; recordId: string }>;
      schemaVersion: 1;
    };
    const changedMaterialized = Object.values(changed.contentRelease.manifest.records)
      .find((record) => record.collection === 'thoughts' && record.id === 'why-i-read-in-the-ai-era')!;
    const changedExpectedChecksum = canonicalPublicRecordChecksum(changedMaterialized);

    expect(changedOutput).toEqual({
      entries: [{
        recordChecksum: changedExpectedChecksum,
        recordId: 'thoughts/why-i-read-in-the-ai-era',
      }],
      schemaVersion: 1,
    });
    expect(changedExpectedChecksum).not.toBe(expectedChecksum);
    await expect(readFile(changed.approvalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expectAnswerReleaseSurfaceAbsent(changed.answerReleasesRoot);
    expectNoCorpusLeak(changedResult);
  });

  it('builds and verifies bootstrap and empty authorities from release bytes and the strict eval manifest', async () => {
    const fixture = await createCliFixture();
    const candidateResult = runCli(fixture.root, 'approval-candidate', 'thoughts/why-i-read-in-the-ai-era');
    const candidate = parseBoundedJson(candidateResult, ['schemaVersion', 'entries']);
    await writeApproval(fixture.approvalPath, candidate);

    const buildResult = runCli(fixture.root, 'build');
    const built = parseBoundedJson(buildResult, [
      'answerReleaseId',
      'contentReleaseId',
      'corpusApprovalHash',
      'path',
      'counts',
      'fileChecksums',
    ]);
    const verifyResult = runCli(fixture.root, 'verify');
    const verified = parseBoundedJson(verifyResult, [
      'answerArtifactHash',
      'answerManifestHash',
      'answerReleaseId',
      'contentReleaseId',
      'corpusApprovalHash',
      'corpusMetricStatus',
      'counts',
      'fileChecksums',
      'path',
      'privateBoundaryHits',
    ]);
    expect(verified).toMatchObject({
      answerReleaseId: built.answerReleaseId,
      contentReleaseId: built.contentReleaseId,
      corpusApprovalHash: built.corpusApprovalHash,
      corpusMetricStatus: 'not_measured',
      counts: {
        runnableEvalCases: 1,
        deferredEvalCases: 19,
        deferredUnapprovedRecordEvalCases: 19,
      },
      privateBoundaryHits: 0,
    });

    const evalPath = join(fixture.root, 'tests/fixtures/public-answer/eval-manifest.v1.json');
    const changedEval = JSON.parse(await readFile(evalPath, 'utf8')) as {
      cases: Array<{ expectedEvidence: Array<{ recordId: string }> }>;
    };
    changedEval.cases[0]!.expectedEvidence = [{ recordId: 'articles/public-fixture' }];
    await writeFile(evalPath, `${JSON.stringify(changedEval)}\n`);
    const repartitioned = parseBoundedJson(runCli(fixture.root, 'verify'), [
      'answerArtifactHash',
      'answerManifestHash',
      'answerReleaseId',
      'contentReleaseId',
      'corpusApprovalHash',
      'corpusMetricStatus',
      'counts',
      'fileChecksums',
      'path',
      'privateBoundaryHits',
    ]);
    expect(repartitioned.counts).toMatchObject({
      runnableEvalCases: 0,
      deferredEvalCases: 20,
      deferredUnapprovedRecordEvalCases: 20,
    });

    await copyFile(evalFixturePath, evalPath);
    await writeApproval(fixture.approvalPath, { schemaVersion: 1, entries: [] });
    parseBoundedJson(runCli(fixture.root, 'build'), [
      'answerReleaseId',
      'contentReleaseId',
      'corpusApprovalHash',
      'path',
      'counts',
      'fileChecksums',
    ]);
    const empty = parseBoundedJson(runCli(fixture.root, 'verify'), [
      'answerArtifactHash',
      'answerManifestHash',
      'answerReleaseId',
      'contentReleaseId',
      'corpusApprovalHash',
      'corpusMetricStatus',
      'counts',
      'fileChecksums',
      'path',
      'privateBoundaryHits',
    ]);
    expect(empty).toMatchObject({
      corpusMetricStatus: 'not_measured',
      counts: {
        records: 0,
        chunks: 0,
        evidence: 0,
        indexInputs: 0,
        lexicalDocuments: 0,
        answerOnly: 0,
        runnableEvalCases: 0,
        deferredEvalCases: 20,
        deferredUnapprovedRecordEvalCases: 20,
      },
      privateBoundaryHits: 0,
    });
    expectNoCorpusLeak(buildResult);
    expectNoCorpusLeak(verifyResult);
  });

  it('rejects missing, malformed, drifted, unresolved, and ineligible receipts before staging', async () => {
    const fixture = await createCliFixture();
    const ineligible = Object.values(fixture.contentRelease.manifest.records)
      .find((record) => record.collection === 'articles' && record.id === 'public-fixture')!;
    const invalidApprovals: Array<unknown | undefined> = [
      undefined,
      { schemaVersion: 1, entries: [{ recordId: 'thoughts/why-i-read-in-the-ai-era' }] },
      { schemaVersion: 1, entries: [{
        recordId: 'thoughts/why-i-read-in-the-ai-era',
        recordChecksum: `sha256:${'0'.repeat(64)}`,
      }] },
      { schemaVersion: 1, entries: [{
        recordId: 'articles/not-materialized',
        recordChecksum: `sha256:${'1'.repeat(64)}`,
      }] },
      { schemaVersion: 1, entries: [{
        recordId: 'articles/public-fixture',
        recordChecksum: canonicalPublicRecordChecksum(ineligible),
      }] },
    ];

    for (const approval of invalidApprovals) {
      await rm(fixture.approvalPath, { force: true });
      if (approval !== undefined) await writeApproval(fixture.approvalPath, approval);
      const result = runCli(fixture.root, 'build');
      expect(result.status).not.toBe(0);
      expectNoCorpusLeak(result);
      await expectAnswerReleaseSurfaceAbsent(fixture.answerReleasesRoot);
    }
  });

  it('runs guarded cleanup and rejects unknown commands with the bounded usage contract', async () => {
    const fixture = await createCliFixture();
    const cleaned = parseBoundedJson(runCli(fixture.root, 'clean-test'), [
      'cleanup',
      'destructiveTargetsRejected',
    ]);
    expect(cleaned).toEqual({ cleanup: 'passed', destructiveTargetsRejected: 6 });

    const unknown = runCli(fixture.root, 'unknown');
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain('usage: cli.ts <approval-candidate|build|verify|clean-test>');
    expectNoCorpusLeak(unknown);
  });

  it('tracks exactly one checksum-bound bootstrap authority entry', async () => {
    const approval = JSON.parse(await readFile(trackedApprovalPath, 'utf8')) as PublicAnswerCorpusApproval;
    expect(approval).toEqual({
      schemaVersion: 1,
      entries: [{
        recordId: 'thoughts/why-i-read-in-the-ai-era',
        recordChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      }],
    });
  });
});
