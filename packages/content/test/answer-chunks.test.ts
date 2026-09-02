import { describe, expect, it } from 'vitest';
import type { PublicAnswerCorpusApproval, PublicRecord } from '@beyondwin/contracts';
import type { VerifiedActivePublicRelease } from '../src/release/read-release';
import {
  buildPublicAnswerCorpus,
  canonicalPublicRecordChecksum,
} from '../src/answer-release/chunk-public-records';
import { canonicalJsonLine } from '../src/answer-release/identity';

const bodyHtml = [
  '<h2 id="judgment">판단</h2>',
  '<p>요약은 결론을 줍니다.</p>',
  '<blockquote><p>독서는 판단의 시간을 줍니다.</p></blockquote>',
  '<h3 id="practice">실천</h3>',
  '<ul><li>답을 쉽게 믿지 않습니다.</li></ul>',
].join('');

function record(overrides: Partial<PublicRecord> = {}): PublicRecord {
  return {
    collection: 'articles',
    id: 'public-fixture',
    href: '/articles/public-fixture/',
    title: '공개 픽스처',
    description: '공개 answer fixture입니다.',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    tags: [],
    media: [],
    relationships: [],
    memoryLinks: [],
    bodyHtml,
    includeInAnswers: true,
    ...overrides,
  } as PublicRecord;
}

function release(records: PublicRecord[]): VerifiedActivePublicRelease {
  return {
    pointer: { releaseId: 'a'.repeat(64), path: 'a'.repeat(64) },
    releasePath: '/verified/release',
    manifest: {
      schemaVersion: 1,
      rendererVersion: 'mdx-3.1.1-sharp-0.35.3-v1',
      releaseId: 'a'.repeat(64),
      records: Object.fromEntries(records.map((item) => [`${item.collection}/${item.id}`, item])),
      assets: {},
    },
    boundaryHits: [],
    verificationPolicyVersion: 1,
    manifestHash: `sha256:${'b'.repeat(64)}`,
    artifactHash: `sha256:${'c'.repeat(64)}`,
    activePointerHash: `sha256:${'d'.repeat(64)}`,
  };
}

function approvalFor(records: PublicRecord[]): PublicAnswerCorpusApproval {
  return {
    schemaVersion: 1,
    entries: records
      .map((item) => ({
        recordId: `${item.collection}/${item.id}`,
        recordChecksum: canonicalPublicRecordChecksum(item),
      }))
      .sort((left, right) => left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0),
  };
}

describe('public answer chunks', () => {
  it('emits deterministic public blocks and matching evidence without source fields', () => {
    const publicRecord = record();
    const corpus = buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) });

    expect(corpus.chunks.map(({ recordId, headingPath, ordinal, text }) => ({
      recordId, headingPath, ordinal, text,
    }))).toEqual([
      {
        recordId: 'articles/public-fixture',
        headingPath: ['판단'],
        ordinal: 1,
        text: '요약은 결론을 줍니다.\n\n독서는 판단의 시간을 줍니다.',
      },
      {
        recordId: 'articles/public-fixture',
        headingPath: ['판단', '실천'],
        ordinal: 2,
        text: '답을 쉽게 믿지 않습니다.',
      },
    ]);
    expect(corpus.evidence.map((item) => item.locator)).toEqual([
      { kind: 'heading-paragraph', label: '판단 · 문단 1', ordinal: 1 },
      { kind: 'heading-paragraph', label: '실천 · 문단 2', ordinal: 2 },
    ]);
    expect(corpus.evidence.map((item) => item.chunkId)).toEqual(corpus.chunks.map((item) => item.chunkId));
    expect(JSON.stringify(corpus)).not.toMatch(/bodyHtml|<p|status|draft|sourcePath|embedding|rawPrompt/u);
    expect(buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) })).toEqual(corpus);
  });

  it('binds approval to one opted-in materialized primary record before parsing', () => {
    const publicRecord = record();
    const eligible = approvalFor([publicRecord]);
    const disabled = record({ includeInAnswers: false });
    const wrongCollection = record({ collection: 'analysis' } as Partial<PublicRecord>);

    expect(() => buildPublicAnswerCorpus(release([publicRecord]), {} as never)).toThrow(/approval/i);
    expect(() => buildPublicAnswerCorpus(release([publicRecord]), { approval: undefined as never })).toThrow(/approval/i);
    expect(buildPublicAnswerCorpus(release([publicRecord]), { approval: { schemaVersion: 1, entries: [] } }))
      .toEqual({ chunks: [], evidence: [] });
    expect(() => buildPublicAnswerCorpus(release([disabled]), { approval: eligible })).toThrow(/includeInAnswers|eligible/i);
    expect(() => buildPublicAnswerCorpus(release([wrongCollection]), { approval: eligible })).toThrow(/resolve|eligible|collection/i);
    expect(() => buildPublicAnswerCorpus(release([publicRecord]), {
      approval: { ...eligible, entries: [{ ...eligible.entries[0]!, recordChecksum: `sha256:${'f'.repeat(64)}` }] },
    })).toThrow(/checksum/i);
    const duplicated = release([publicRecord]);
    duplicated.manifest.records['articles/duplicate-fixture'] = publicRecord;
    expect(() => buildPublicAnswerCorpus(duplicated, { approval: eligible })).toThrow(/exactly one/i);
    expect(() => buildPublicAnswerCorpus(release([publicRecord]), {
      approval: eligible,
      answerOnlyCapsules: [{}],
    })).toThrow(/answer-only/i);
  });

  it('selects only approval-receipt records and rejects an unresolved receipt entry', () => {
    const approved = record();
    const unlistedTrue = record({ id: 'unlisted-true', href: '/articles/unlisted-true/' });
    const unlistedFalse = record({ id: 'unlisted-false', href: '/articles/unlisted-false/', includeInAnswers: false });
    const omittedToggle = record({ id: 'unlisted-omitted', href: '/articles/unlisted-omitted/' });
    delete (omittedToggle as { includeInAnswers?: boolean }).includeInAnswers;
    const approvedOnly = approvalFor([approved]);

    expect(buildPublicAnswerCorpus(release([approved, unlistedTrue, unlistedFalse, omittedToggle]), {
      approval: approvedOnly,
    }).chunks.every((item) => item.recordId === 'articles/public-fixture')).toBe(true);
    expect(() => buildPublicAnswerCorpus(release([approved]), {
      approval: {
        schemaVersion: 1,
        entries: [...approvedOnly.entries, {
          recordId: 'thoughts/missing-receipt',
          recordChecksum: `sha256:${'e'.repeat(64)}`,
        }],
      },
    })).toThrow(/resolve/i);
  });

  it('keeps identity stable for irrelevant attributes and changes only changed block evidence', () => {
    const publicRecord = record();
    const changed = record({ bodyHtml: bodyHtml.replace('독서는 판단의 시간을 줍니다.', '독서는 오래 생각하게 합니다.') });
    const attributed = record({ bodyHtml: bodyHtml.replace('<p>', '<p data-private="ignored">') });
    const first = buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) });
    const second = buildPublicAnswerCorpus(release([changed]), { approval: approvalFor([changed]) });
    const ignoredAttribute = buildPublicAnswerCorpus(release([attributed]), { approval: approvalFor([attributed]) });

    expect(first.chunks).toHaveLength(2);
    expect(second.chunks[0]).not.toMatchObject({
      chunkId: first.chunks[0]!.chunkId,
      checksum: first.chunks[0]!.checksum,
    });
    expect(second.chunks[1]).toMatchObject({
      chunkId: first.chunks[1]!.chunkId,
      checksum: first.chunks[1]!.checksum,
    });
    expect(second.evidence[0]).not.toMatchObject({
      evidenceId: first.evidence[0]!.evidenceId,
      excerptChecksum: first.evidence[0]!.excerptChecksum,
    });
    expect(second.evidence[1]).toMatchObject({
      evidenceId: first.evidence[1]!.evidenceId,
      excerptChecksum: first.evidence[1]!.excerptChecksum,
    });
    expect(ignoredAttribute).toEqual(first);
    expect(canonicalJsonLine({ z: { b: 1, a: 2 }, a: 3 })).toBe('{"a":3,"z":{"a":2,"b":1}}');
    const { bodyHtml: reorderedBodyHtml, ...reorderedRest } = publicRecord;
    expect(canonicalPublicRecordChecksum({ bodyHtml: reorderedBodyHtml, ...reorderedRest } as PublicRecord))
      .toBe(canonicalPublicRecordChecksum(publicRecord));
    expect(canonicalPublicRecordChecksum(record({ bodyHtml: '<p>changed</p>' })))
      .not.toBe(canonicalPublicRecordChecksum(publicRecord));
    expect(canonicalPublicRecordChecksum(record({ includeInAnswers: false })))
      .not.toBe(canonicalPublicRecordChecksum(publicRecord));
  });

  it('splits code points deterministically and rejects oversized record output', () => {
    const exact = record({ bodyHtml: `<p>${'🙂'.repeat(1200)}</p>` });
    const sentence = record({ bodyHtml: `<p>${'가'.repeat(1190)}. ${'나'.repeat(20)}</p>` });
    const whitespace = record({ bodyHtml: `<p>${'가'.repeat(1190)} ${'나'.repeat(20)}</p>` });
    const hard = record({ bodyHtml: `<p>${'🙂'.repeat(1201)}</p>` });
    const allowed = record({ bodyHtml: Array.from({ length: 256 }, (_, index) => `<p>문단 ${index + 1}</p>`).join('') });
    const many = record({ bodyHtml: Array.from({ length: 257 }, (_, index) => `<p>문단 ${index + 1}</p>`).join('') });

    expect(buildPublicAnswerCorpus(release([exact]), { approval: approvalFor([exact]) }).chunks).toHaveLength(1);
    expect(buildPublicAnswerCorpus(release([sentence]), { approval: approvalFor([sentence]) }).chunks.map((item) => item.text))
      .toEqual([`${'가'.repeat(1190)}.`, '나'.repeat(20)]);
    expect(buildPublicAnswerCorpus(release([whitespace]), { approval: approvalFor([whitespace]) }).chunks.map((item) => item.text))
      .toEqual(['가'.repeat(1190), '나'.repeat(20)]);
    const hardChunks = buildPublicAnswerCorpus(release([hard]), { approval: approvalFor([hard]) }).chunks;
    expect(hardChunks.map((item) => item.text)).toEqual(['🙂'.repeat(1200), '🙂']);
    expect(hardChunks.every((item) => item.text && Array.from(item.text).length <= 1200)).toBe(true);
    expect(hardChunks.map((item) => item.ordinal)).toEqual([1, 2]);
    const packed = buildPublicAnswerCorpus(release([allowed]), { approval: approvalFor([allowed]) }).chunks;
    expect(packed.length).toBeGreaterThan(0);
    expect(packed.length).toBeLessThan(256);
    expect(packed.every((item) => Array.from(item.text).length <= 1200)).toBe(true);
    expect(packed.map((item) => item.ordinal)).toEqual(packed.map((_, index) => index + 1));
    expect(packed.every((item) => item.headingPath.length === 0)).toBe(true);
    expect(() => buildPublicAnswerCorpus(release([many]), { approval: approvalFor([many]) })).toThrow(/256/i);
  });

  it('merges headingless short paragraphs into one chunk at or under 1200 code points', () => {
    const publicRecord = record({
      collection: 'thoughts',
      id: 'short-thought',
      href: '/thoughts/short-thought/',
      bodyHtml: '<p>첫 문단입니다.</p><p>둘째 문단입니다.</p><p>셋째 문단입니다.</p>',
    });
    const corpus = buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) });
    expect(corpus.chunks).toHaveLength(1);
    expect(corpus.chunks[0]).toMatchObject({
      recordId: 'thoughts/short-thought',
      headingPath: [],
      ordinal: 1,
      text: '첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.',
    });
    expect(corpus.evidence[0]!.locator).toEqual({
      kind: 'heading-paragraph',
      label: '문단 1',
      ordinal: 1,
    });
    expect(Array.from(corpus.chunks[0]!.text).length).toBeLessThanOrEqual(1200);
  });

  it('does not merge short paragraphs under different headings', () => {
    const publicRecord = record({
      bodyHtml: '<h2>하나</h2><p>짧은 하나.</p><h2>둘</h2><p>짧은 둘.</p>',
    });
    const corpus = buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) });
    expect(corpus.chunks.map(({ headingPath, text }) => ({ headingPath, text }))).toEqual([
      { headingPath: ['하나'], text: '짧은 하나.' },
      { headingPath: ['둘'], text: '짧은 둘.' },
    ]);
  });

  it('starts a new chunk when the next same-heading paragraph would exceed 1200 code points', () => {
    const first = `${'가'.repeat(1190)}.`;
    const second = '나'.repeat(20);
    const publicRecord = record({
      bodyHtml: `<h2>긴글</h2><p>${first}</p><p>${second}</p>`,
    });
    const corpus = buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) });
    expect(corpus.chunks.map((item) => item.text)).toEqual([first, second]);
    expect(corpus.chunks.every((item) => Array.from(item.text).length <= 1200)).toBe(true);
  });

  it('does not turn non-rendered HTML contents into public evidence', () => {
    const publicRecord = record({ bodyHtml: '<p>공개 문장<script>private raw prompt</script><style>secret</style><template>hidden</template></p>' });

    expect(buildPublicAnswerCorpus(release([publicRecord]), { approval: approvalFor([publicRecord]) }).chunks)
      .toMatchObject([{ text: '공개 문장' }]);
  });
});
