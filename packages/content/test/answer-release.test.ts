import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as answerReleaseApi from '@beyondwin/content/answer-release';
import { describe, expect, it } from 'vitest';
import { buildPublicAnswerRelease } from '../src/answer-release/build-answer-release';
import { readPublicAnswerCorpusApproval } from '../src/answer-release/corpus-approval';
import { canonicalJsonLine, sha256Checksum } from '../src/answer-release/identity';
import { readActiveAnswerRelease } from '../src/answer-release/read-answer-release';
import {
  canonicalPrettyJson,
  createAnswerReleaseFixture,
} from './helpers/answer-release-fixture';

describe('immutable public answer release building', { timeout: 30_000 }, () => {
  it('exports only the supported answer-release API surface', () => {
    expect(Object.keys(answerReleaseApi).sort()).toEqual([
      'buildPublicAnswerRelease',
      'parsePublicAnswerEvalManifest',
      'readActiveAnswerRelease',
      'readPublicAnswerCorpusApproval',
      'validatePublicAnswerEvalManifest',
      'verifyAnswerReleaseDirectory',
    ]);
  });

  it('builds, activates, and reopens the exact deterministic five-file answer release', async () => {
    const fixture = await createAnswerReleaseFixture();
    const first = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    const active = await readActiveAnswerRelease(
      fixture.answerReleasesRoot,
      fixture.contentRelease,
      fixture.approval,
    );

    expect(active.manifest.answerReleaseId).toBe(first.answerReleaseId);
    expect(active.manifest.identity).toMatchObject({
      schemaVersion: 1,
      contentReleaseId: fixture.contentRelease.manifest.releaseId,
      contentManifestHash: fixture.contentRelease.manifestHash,
      contentArtifactHash: fixture.contentRelease.artifactHash,
      chunkerVersion: 'public-blocks-v2',
      normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
      collections: ['articles', 'reviews', 'thoughts'],
    });
    expect(active).toMatchObject({
      contentReleaseId: fixture.contentRelease.manifest.releaseId,
      answerReleaseId: first.answerReleaseId,
      manifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      artifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      corpusApprovalHash: sha256Checksum(canonicalJsonLine(fixture.approval)),
      privateBoundaryHits: [],
    });
    expect(active.chunks).toHaveLength(active.manifest.counts.chunks);
    expect(active.evidence).toHaveLength(active.manifest.counts.evidence);
    expect(active.indexInputs).toHaveLength(active.manifest.counts.chunks);
    expect(active.lexicalIndex.documents).toHaveLength(active.manifest.counts.chunks);
    expect(Object.keys(active).sort()).toEqual([
      'activePointerHash', 'answerReleaseId', 'artifactHash', 'chunks', 'contentReleaseId',
      'corpusApprovalHash', 'evidence', 'indexInputs', 'lexicalIndex', 'manifest', 'manifestHash',
      'privateBoundaryHits', 'releasePath',
    ]);
    expect((await readdir(first.releasePath)).sort()).toEqual([
      'chunks.ndjson',
      'evidence.ndjson',
      'index-inputs.ndjson',
      'lexical-index.json',
      'manifest.json',
    ]);

    const beforeRebuild = Object.fromEntries(await Promise.all((await readdir(first.releasePath)).map(async (path) => (
      [path, await readFile(join(first.releasePath, path))] as const
    ))));

    const rebuilt = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    expect(rebuilt).toEqual(first);
    for (const [path, bytes] of Object.entries(beforeRebuild)) {
      expect(await readFile(join(rebuilt.releasePath, path))).toEqual(bytes);
    }
  });

  it('writes lexical postings with integer-like keys in code-point order and reopens those canonical bytes', async () => {
    const fixture = await createAnswerReleaseFixture({
      title: 'Public numeric tokens',
      prose: 'Public evidence includes 10 before 2.',
    });
    const built = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    const lexicalText = await readFile(join(built.releasePath, 'lexical-index.json'), 'utf8');
    const tenOffset = lexicalText.indexOf('\n    "10": [');
    const twoOffset = lexicalText.indexOf('\n    "2": [');

    expect(tenOffset).toBeGreaterThan(-1);
    expect(twoOffset).toBeGreaterThan(tenOffset);
    await expect(readActiveAnswerRelease(
      fixture.answerReleasesRoot,
      fixture.contentRelease,
      fixture.approval,
    )).resolves.toMatchObject({
      answerReleaseId: built.answerReleaseId,
      lexicalIndex: { postings: { 10: expect.any(Array), 2: expect.any(Array) } },
    });
  });

  it('never reopens raw source and rejects answer-only input before creating staging', async () => {
    const fixture = await createAnswerReleaseFixture();
    await rename(join(fixture.sourceRoot, 'src'), join(fixture.sourceRoot, 'renamed-src'));

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).resolves.toMatchObject({ answerReleaseId: expect.stringMatching(/^[a-f0-9]{64}$/u) });

    const rejectedRoot = join(fixture.sandbox, 'answer-only-rejected');
    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: rejectedRoot,
      answerOnlyCapsules: [{}],
    })).rejects.toThrow(/answer-only/i);
    await expect(readdir(rejectedRoot)).rejects.toThrow();
  });

  it('rejects an existing same-ID directory whose immutable bytes drifted', async () => {
    const fixture = await createAnswerReleaseFixture();
    const first = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    await writeFile(join(first.releasePath, 'chunks.ndjson'), '{"tampered":true}\n');

    await expect(buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).rejects.toThrow(/immutable|checksum|canonical|schema|verify/i);
  });

  it('atomically transitions from a non-empty release to a deterministic canonical zero-row release', async () => {
    const fixture = await createAnswerReleaseFixture();
    const nonEmpty = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: fixture.approval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    const emptyApproval = { schemaVersion: 1 as const, entries: [] };
    const empty = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: emptyApproval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    const active = await readActiveAnswerRelease(
      fixture.answerReleasesRoot,
      fixture.contentRelease,
      emptyApproval,
    );

    expect(empty.answerReleaseId).not.toBe(nonEmpty.answerReleaseId);
    for (const path of ['chunks.ndjson', 'evidence.ndjson', 'index-inputs.ndjson']) {
      expect((await readFile(join(empty.releasePath, path))).byteLength).toBe(0);
    }
    const lexicalBytes = await readFile(join(empty.releasePath, 'lexical-index.json'));
    expect(lexicalBytes.byteLength).toBeGreaterThan(0);
    expect(JSON.parse(lexicalBytes.toString('utf8'))).toEqual({
      schemaVersion: 1,
      normalizerVersion: 'nfkc-lower-hangul-ngram-v1',
      documents: [],
      postings: {},
    });
    expect(active.manifest.counts).toEqual({ records: 0, chunks: 0, evidence: 0, answerOnly: 0 });
    expect(active.manifest.files).toMatchObject({
      chunks: { bytes: 0, count: 0 },
      evidence: { bytes: 0, count: 0 },
      indexInputs: { bytes: 0, count: 0 },
      lexicalIndex: { bytes: lexicalBytes.byteLength, count: 0 },
    });
    expect(active.manifest.identity.corpusApprovalHash).toBe(sha256Checksum(canonicalJsonLine(emptyApproval)));
    expect(active.answerReleaseId).toBe(sha256Checksum(canonicalJsonLine({
      identity: active.manifest.identity,
      files: [
        active.manifest.files.chunks,
        active.manifest.files.evidence,
        active.manifest.files.indexInputs,
        active.manifest.files.lexicalIndex,
      ],
    })).slice('sha256:'.length));
    expect(active).toMatchObject({
      answerReleaseId: empty.answerReleaseId,
      chunks: [],
      evidence: [],
      indexInputs: [],
      lexicalIndex: { documents: [], postings: {} },
      privateBoundaryHits: [],
    });
    const activeBytes = await readFile(join(fixture.answerReleasesRoot, 'active.json'));
    const expectedPointerHash = `sha256:${createHash('sha256').update(activeBytes).digest('hex')}`;
    expect(expectedPointerHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(active.activePointerHash).toBe(expectedPointerHash);
    expect(JSON.parse(activeBytes.toString('utf8'))).toEqual({
      schemaVersion: 1,
      contentReleaseId: fixture.contentRelease.manifest.releaseId,
      answerReleaseId: empty.answerReleaseId,
      path: `${fixture.contentRelease.manifest.releaseId}/${empty.answerReleaseId}`,
    });
    expect((await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: emptyApproval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    })).answerReleaseId).toBe(empty.answerReleaseId);
  });

  it('canonicalizes independently read approval JSON without trusting its whitespace or key order', async () => {
    const fixture = await createAnswerReleaseFixture();
    const approvalPath = join(fixture.sandbox, 'approval.json');
    const entry = fixture.approval.entries[0]!;
    await writeFile(approvalPath, JSON.stringify({ entries: [{ recordChecksum: entry.recordChecksum, recordId: entry.recordId }], schemaVersion: 1 }));
    const firstApproval = await readPublicAnswerCorpusApproval(approvalPath);
    const first = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: firstApproval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });
    await writeFile(approvalPath, ` {\n  "schemaVersion": 1,\n  "entries": [ ${canonicalPrettyJson(entry).trim()} ]\n}\n`);
    const secondApproval = await readPublicAnswerCorpusApproval(approvalPath);
    const second = await buildPublicAnswerRelease({
      contentRelease: fixture.contentRelease,
      approval: secondApproval,
      answerReleasesRoot: fixture.answerReleasesRoot,
    });

    expect(secondApproval).toEqual(firstApproval);
    expect(second.answerReleaseId).toBe(first.answerReleaseId);
  });
});
