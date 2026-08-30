import { readFile, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { publicRecordSchema } from '@beyondwin/contracts';
import { readActiveRelease } from '../release/read-release';
import {
  buildPublicAnswerRelease,
  cleanupOwnedAnswerTemporaryRoot,
  createOwnedAnswerTemporaryRoot,
} from './build-answer-release';
import { readPublicAnswerCorpusApproval } from './corpus-approval';
import { parsePublicAnswerEvalManifest, validatePublicAnswerEvalManifest } from './eval-manifest';
import { canonicalJsonLine, sha256Checksum } from './identity';
import { readActiveAnswerRelease } from './read-answer-release';

const root = resolve(process.cwd());
const publicReleasesRoot = join(root, 'build', 'public-releases');
const answerReleasesRoot = join(root, 'build', 'public-answer-releases');
const approvalPath = join(root, 'src/data/public-answer-corpus-approval.v1.json');
const evalManifestPath = join(root, 'tests/fixtures/public-answer/eval-manifest.v1.json');
const command = process.argv[2];

function print(value: unknown): void {
  process.stdout.write(`${canonicalJsonLine(value)}\n`);
}

function fileChecksums(manifest: {
  files: {
    chunks: { checksum: string };
    evidence: { checksum: string };
    indexInputs: { checksum: string };
    lexicalIndex: { checksum: string };
  };
}): Record<string, string> {
  return {
    chunks: manifest.files.chunks.checksum,
    evidence: manifest.files.evidence.checksum,
    indexInputs: manifest.files.indexInputs.checksum,
    lexicalIndex: manifest.files.lexicalIndex.checksum,
  };
}

function artifactCounts(manifest: {
  counts: { records: number; chunks: number; evidence: number; answerOnly: 0 };
  files: { indexInputs: { count: number }; lexicalIndex: { count: number } };
}): Record<string, number> {
  return {
    records: manifest.counts.records,
    chunks: manifest.counts.chunks,
    evidence: manifest.counts.evidence,
    indexInputs: manifest.files.indexInputs.count,
    lexicalDocuments: manifest.files.lexicalIndex.count,
    answerOnly: manifest.counts.answerOnly,
  };
}

async function readEvalManifest(): Promise<ReturnType<typeof parsePublicAnswerEvalManifest>> {
  return parsePublicAnswerEvalManifest(JSON.parse(await readFile(evalManifestPath, 'utf8')));
}

if (command === 'approval-candidate') {
  const [recordId, ...extra] = process.argv.slice(3);
  if (recordId !== 'thoughts/why-i-read-in-the-ai-era' || extra.length > 0) {
    throw new Error('approval-candidate requires sole argument thoughts/why-i-read-in-the-ai-era');
  }
  const contentRelease = await readActiveRelease(publicReleasesRoot);
  const matches = Object.values(contentRelease.manifest.records)
    .filter((record) => `${record.collection}/${record.id}` === recordId);
  if (matches.length !== 1) throw new Error(`${recordId}: candidate must resolve to exactly one materialized record`);
  const record = publicRecordSchema.parse(matches[0]);
  if (record.collection !== 'thoughts' || record.includeInAnswers !== true) {
    throw new Error(`${recordId}: candidate must be a materialized thought with includeInAnswers true`);
  }
  print({
    schemaVersion: 1,
    entries: [{
      recordId,
      recordChecksum: sha256Checksum(canonicalJsonLine(publicRecordSchema.parse(record))),
    }],
  });
} else if (command === 'build') {
  const contentRelease = await readActiveRelease(publicReleasesRoot);
  const approval = await readPublicAnswerCorpusApproval(approvalPath);
  const built = await buildPublicAnswerRelease({
    contentRelease,
    approval,
    answerReleasesRoot,
  });
  print({
    contentReleaseId: contentRelease.manifest.releaseId,
    answerReleaseId: built.answerReleaseId,
    corpusApprovalHash: built.manifest.identity.corpusApprovalHash,
    path: built.releasePath,
    counts: artifactCounts(built.manifest),
    fileChecksums: fileChecksums(built.manifest),
  });
} else if (command === 'verify') {
  const contentRelease = await readActiveRelease(publicReleasesRoot);
  const approval = await readPublicAnswerCorpusApproval(approvalPath);
  const active = await readActiveAnswerRelease(answerReleasesRoot, contentRelease, approval);
  const partition = validatePublicAnswerEvalManifest(await readEvalManifest(), active.chunks);
  print({
    contentReleaseId: active.contentReleaseId,
    answerReleaseId: active.answerReleaseId,
    corpusApprovalHash: active.corpusApprovalHash,
    answerManifestHash: active.manifestHash,
    answerArtifactHash: active.artifactHash,
    path: active.releasePath,
    counts: {
      ...artifactCounts(active.manifest),
      runnableEvalCases: partition.runnable.length,
      deferredEvalCases: partition.deferred.length,
      deferredUnapprovedRecordEvalCases: partition.deferred.filter(
        (item) => item.reason === 'deferred-unapproved-record',
      ).length,
    },
    fileChecksums: fileChecksums(active.manifest),
    corpusMetricStatus: partition.corpusMetricStatus,
    privateBoundaryHits: active.privateBoundaryHits.length,
  });
} else if (command === 'clean-test') {
  const owned = await createOwnedAnswerTemporaryRoot(tmpdir());
  await cleanupOwnedAnswerTemporaryRoot(owned);
  try {
    await stat(owned.path);
    throw new Error('owned temporary answer release root was not removed');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  for (const target of [
    answerReleasesRoot,
    publicReleasesRoot,
    root,
    homedir(),
    tmpdir(),
    join(tmpdir(), 'caller-supplied-public-answer-release'),
  ]) {
    try {
      await cleanupOwnedAnswerTemporaryRoot({ path: target } as never);
      throw new Error(`cleanup guard accepted unsafe target: ${target}`);
    } catch (error) {
      if (!String(error).includes('owned answer temporary root')) throw error;
    }
  }
  print({ cleanup: 'passed', destructiveTargetsRejected: 6 });
} else {
  throw new Error('usage: cli.ts <approval-candidate|build|verify|clean-test>');
}
