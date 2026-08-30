import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublicAnswerChunk } from '@beyondwin/contracts';
import {
  parsePublicAnswerEvalManifest,
  validatePublicAnswerEvalManifest,
} from '../src/answer-release/eval-manifest';

const chunk = (recordId: string): PublicAnswerChunk => ({
  chunkId: 'a'.repeat(64),
  recordId,
  collection: recordId.split('/')[0] as PublicAnswerChunk['collection'],
  canonicalPath: `/${recordId}/`,
  title: '공개 레코드',
  headingPath: [],
  ordinal: 1,
  text: '검증을 위한 공개 청크입니다.',
  checksum: `sha256:${'b'.repeat(64)}`,
});

async function fixture(): Promise<unknown> {
  return JSON.parse(await readFile(resolve('tests/fixtures/public-answer/eval-manifest.v1.json'), 'utf8'));
}

describe('public answer evaluation manifest', () => {
  it('partitions the tracked bootstrap into one runnable case and nineteen deferred cases', async () => {
    const manifest = parsePublicAnswerEvalManifest(await fixture());
    const result = validatePublicAnswerEvalManifest(manifest, [chunk('thoughts/why-i-read-in-the-ai-era')]);

    expect(manifest.cases).toHaveLength(20);
    expect(new Set(manifest.cases.map((item) => item.id)).size).toBe(20);
    expect(JSON.stringify(manifest)).not.toMatch(/bodyHtml|excerpt|private|memory\/|sourcePath|prompt|embedding/iu);
    expect(result).toMatchObject({
      runnable: [{ id: 'dev-01-reading-judgment' }],
      deferred: expect.arrayContaining([expect.objectContaining({
        id: 'dev-02-agent-instructions',
        reason: 'deferred-unapproved-record',
      })]),
      corpusMetricStatus: 'not_measured',
    });
    expect(result.runnable).toHaveLength(1);
    expect(result.deferred).toHaveLength(19);
  });

  it('defers all twenty cases without computing corpus metrics when authority is empty', async () => {
    const manifest = parsePublicAnswerEvalManifest(await fixture());
    const result = validatePublicAnswerEvalManifest(manifest, []);

    expect(result.runnable).toEqual([]);
    expect(result.deferred).toHaveLength(20);
    expect(result.deferred.every((item) => item.reason === 'deferred-unapproved-record')).toBe(true);
    expect(result.corpusMetricStatus).toBe('not_measured');
  });

  it('rejects expected and forbidden evidence overlap when a typed manifest bypasses the parser', async () => {
    const manifest = parsePublicAnswerEvalManifest(await fixture());
    const first = manifest.cases[0]!;
    const invalid = {
      ...manifest,
      cases: [{
        ...first,
        forbiddenRecordIds: [first.expectedEvidence[0]!.recordId],
      }, ...manifest.cases.slice(1)],
    } as typeof manifest;

    expect(() => validatePublicAnswerEvalManifest(invalid, [])).toThrow(/forbidden|overlap/i);
  });

  it('rejects malformed or private evaluation cases instead of accepting synthetic authority', async () => {
    const source = await fixture() as {
      schemaVersion: number;
      split: string;
      cases: Array<{
        id: string;
        question: string;
        expectedMode: string;
        expectedEvidence: Array<{ recordId: string }>;
        forbiddenRecordIds: string[];
      }>;
    };
    const first = source.cases[0]!;

    expect(() => parsePublicAnswerEvalManifest({ ...source, unknown: true })).toThrow(/unrecognized|unknown/i);
    expect(() => parsePublicAnswerEvalManifest({
      ...source,
      cases: [first, first, ...source.cases.slice(2)],
    })).toThrow(/unique/i);
    expect(() => parsePublicAnswerEvalManifest({
      ...source,
      cases: [{ ...first, expectedEvidence: [{ recordId: 'analysis/not-public-answer' }] }, ...source.cases.slice(1)],
    })).toThrow(/articles|reviews|thoughts|invalid/i);
    expect(() => parsePublicAnswerEvalManifest({
      ...source,
      cases: [{ ...first, question: '   ' }, ...source.cases.slice(1)],
    })).toThrow(/too small|at least|invalid/i);
    expect(() => parsePublicAnswerEvalManifest({
      ...source,
      cases: [{ ...first, forbiddenRecordIds: [first.expectedEvidence![0]!.recordId] }, ...source.cases.slice(1)],
    })).toThrow(/forbidden|overlap/i);
    for (const forbiddenField of ['excerpt', 'privatePath', 'rawPrompt', 'embedding']) {
      expect(() => parsePublicAnswerEvalManifest({
        ...source,
        cases: [{ ...first, [forbiddenField]: 'not-public' }, ...source.cases.slice(1)],
      })).toThrow(/unrecognized|unknown/i);
    }
  });
});
