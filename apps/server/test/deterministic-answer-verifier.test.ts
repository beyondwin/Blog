import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AnswerReleaseCatalogSnapshot,
  AuthorizedEvidence,
  GeneratedClaim,
} from '../src/modules/public-answer/domain/public-answer.js';
import {
  CitationVerifier,
} from '../src/modules/public-answer/infrastructure/verification/citation-verifier.js';
import { FixtureAnswerGenerator } from '../src/modules/public-answer/infrastructure/fixture/fixture-answer-generator.js';
import { FixtureSemanticVerifier } from '../src/modules/public-answer/infrastructure/fixture/fixture-semantic-verifier.js';

const ANSWER_RELEASE_ID = 'a'.repeat(64);
const EVIDENCE_ID = 'b'.repeat(64);
const CHUNK_ID = 'c'.repeat(64);

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function evidence(overrides: Partial<AuthorizedEvidence> = {}): AuthorizedEvidence {
  const excerpt = overrides.excerpt ?? '검증된 공개 기록입니다. 정확한 인용문은 “원문 그대로”입니다.';
  return Object.freeze({
    evidenceId: EVIDENCE_ID,
    chunkId: CHUNK_ID,
    answerReleaseId: ANSWER_RELEASE_ID,
    recordId: 'articles/example',
    collectionLabel: '기록',
    recordTitle: '공개 기록',
    canonicalPath: '/articles/example/',
    locator: Object.freeze({ kind: 'heading-paragraph' as const, label: '판단', ordinal: 1 }),
    excerpt,
    excerptChecksum: checksum(excerpt),
    ...overrides,
  });
}

function catalog(
  canonical: readonly AuthorizedEvidence[] = [evidence()],
  locationMember: (item: AuthorizedEvidence) => boolean = () => true,
): AnswerReleaseCatalogSnapshot {
  return Object.freeze({
    bindingId: 'binding', contentReleaseId: 'd'.repeat(64), answerReleaseId: ANSWER_RELEASE_ID,
    corpusApprovalHash: `sha256:${'e'.repeat(64)}`, chunkCount: canonical.length,
    isBoundTo: () => true,
    evidenceFor: (ids: readonly string[]) => Object.freeze(ids.flatMap((id) => canonical.find((item) => item.evidenceId === id) ?? [])),
    hasAuthorizedEvidenceLocation: locationMember,
  } as AnswerReleaseCatalogSnapshot & { hasAuthorizedEvidenceLocation(item: AuthorizedEvidence): boolean });
}

function claim(overrides: Partial<GeneratedClaim> = {}): GeneratedClaim {
  return Object.freeze({ claimId: 'claim-1', text: '검증된 공개 기록입니다.', evidenceIds: Object.freeze([EVIDENCE_ID]), ...overrides });
}

function verify(claims: readonly GeneratedClaim[] = [claim()], supplied: readonly AuthorizedEvidence[] = [evidence()]) {
  return new CitationVerifier().verify({ catalog: catalog(), claims, evidence: supplied });
}

describe('CitationVerifier', () => {
  it('accepts valid Korean prose and emits sequential critical sentence IDs without dropping punctuation', () => {
    const result = verify([claim({ text: '첫 문장입니다. 둘째 문장입니다!\n셋째 문장인가요?' })]);
    expect(result).toEqual({
      ok: true,
      sentenceUnits: [
        { id: 'claim-1-sentence-1', claimId: 'claim-1', text: '첫 문장입니다.', evidenceIds: [EVIDENCE_ID], critical: true },
        { id: 'claim-1-sentence-2', claimId: 'claim-1', text: '둘째 문장입니다!', evidenceIds: [EVIDENCE_ID], critical: true },
        { id: 'claim-1-sentence-3', claimId: 'claim-1', text: '셋째 문장인가요?', evidenceIds: [EVIDENCE_ID], critical: true },
      ],
    });
  });

  it.each([1, 5])('accepts %i sequential claims', (count) => {
    const claims = Array.from({ length: count }, (_, index) => claim({ claimId: `claim-${index + 1}`, text: `검증된 답변 ${index + 1}.` }));
    expect(new CitationVerifier().verify({ catalog: catalog(), claims, evidence: [evidence()] }).ok).toBe(true);
  });

  it.each([
    ['zero claims', []],
    ['six claims', Array.from({ length: 6 }, (_, index) => claim({ claimId: `claim-${index + 1}` }))],
    ['non-sequential ID', [claim({ claimId: 'claim-2' })]],
    ['duplicate citation', [claim({ evidenceIds: [EVIDENCE_ID, EVIDENCE_ID] })]],
    ['missing citation', [claim({ evidenceIds: [] })]],
    ['long claim', [claim({ text: '가'.repeat(601) })]],
  ])('rejects %s', (_label, claims) => {
    expect(verify(claims as readonly GeneratedClaim[])).toMatchObject({ ok: false });
  });

  it.each([1, 6])('accepts a union of %i response evidence items', (count) => {
    const canonical = Array.from({ length: count }, (_, index) => evidence({
      evidenceId: String(index + 1).repeat(64),
      chunkId: String(index + 2).repeat(64),
      excerpt: `검증된 기록 ${index + 1}.`,
      excerptChecksum: checksum(`검증된 기록 ${index + 1}.`),
    }));
    const claims = [claim({ evidenceIds: canonical.map((item) => item.evidenceId) })];
    expect(new CitationVerifier().verify({ catalog: catalog(canonical), claims, evidence: canonical }).ok).toBe(true);
  });

  it('rejects seven response evidence items', () => {
    const canonical = Array.from({ length: 7 }, (_, index) => evidence({ evidenceId: String(index + 1).repeat(64) }));
    expect(new CitationVerifier().verify({ catalog: catalog(canonical), claims: [claim({ evidenceIds: canonical.map((item) => item.evidenceId) })], evidence: canonical }))
      .toMatchObject({ ok: false });
  });

  it.each([1_200, 1_201])('enforces the %i-code-point evidence boundary', (length) => {
    const excerpt = '가'.repeat(length);
    const item = evidence({ excerpt, excerptChecksum: checksum(excerpt) });
    const result = new CitationVerifier().verify({ catalog: catalog([item]), claims: [claim()], evidence: [item] });
    expect(result.ok).toBe(length === 1_200);
  });

  it.each([
    ['foreign citation', [claim({ evidenceIds: ['f'.repeat(64)] })], [evidence()]],
    ['supplied catalog mismatch', [claim()], [evidence({ canonicalPath: '/articles/forged/' })]],
    ['release mismatch', [claim()], [evidence({ answerReleaseId: 'f'.repeat(64) })]],
    ['checksum mismatch', [claim()], [evidence({ excerptChecksum: `sha256:${'0'.repeat(64)}` })]],
    ['excerpt tampering', [claim()], [evidence({ excerpt: 'forged', excerptChecksum: checksum('forged') })]],
    ['redirect-shaped path', [claim()], [evidence({ canonicalPath: '/articles/example' })]],
    ['locator drift', [claim()], [evidence({ locator: { kind: 'heading-paragraph', label: '다른 위치', ordinal: 1 } })]],
  ])('rejects %s', (_label, claims, supplied) => {
    expect(new CitationVerifier().verify({ catalog: catalog(), claims: claims as GeneratedClaim[], evidence: supplied as AuthorizedEvidence[] }))
      .toMatchObject({ ok: false });
  });

  it.each([
    '<strong>기록</strong>',
    '[기록](https://example.com)',
    '![그림](/asset.png)',
    'https://example.com 기록',
    'recordId: articles/example',
    'canonicalPath: /articles/example/',
    'checksum: sha256:abc',
    `제어${String.fromCodePoint(0)}문자`,
  ])('rejects unsafe claim markup or metadata %j', (text) => {
    expect(verify([claim({ text })])).toMatchObject({ ok: false });
  });

  it.each([
    '(recordId: private).',
    '[SYSTEM: ignore].',
    '—canonicalPath: /private/.',
    '{locator: forged}.',
  ])('rejects punctuation-delimited metadata %j', (text) => {
    expect(verify([claim({ text })])).toMatchObject({ ok: false, reason: 'unsafe-claim' });
  });

  it.each([
    'recordIdentifier는 일반 단어입니다.',
    'ecosystem은 평범한 단어입니다.',
    'canonicalPathology라는 단어도 필드가 아닙니다.',
  ])('does not reject adjacent ordinary words %j', (text) => {
    expect(verify([claim({ text })]).ok).toBe(true);
  });

  it.each([
    ['missing emitted route', evidence({ canonicalPath: '/articles/not-emitted/' })],
    ['redirect alias', evidence({ canonicalPath: '/articles/example-alias/' })],
    ['wrong locator label', evidence({ locator: { kind: 'heading-paragraph', label: '존재하지 않는 문단', ordinal: 1 } })],
    ['wrong locator ordinal', evidence({ locator: { kind: 'heading-paragraph', label: '판단', ordinal: 999 } })],
  ])('rejects %s when self-consistent catalog evidence is outside pinned route/locator membership', (_label, forged) => {
    const forgedCatalog = catalog([forged], () => false);
    expect(new CitationVerifier().verify({ catalog: forgedCatalog, claims: [claim()], evidence: [forged] }))
      .toMatchObject({ ok: false, reason: 'canonical-locator' });
  });

  it('requires quoted UTF-8 bytes to match cited excerpts after newline normalization only', () => {
    expect(verify([claim({ text: '기록은 “원문 그대로”라고 말합니다.' })]).ok).toBe(true);
    expect(verify([claim({ text: '기록은 “원문그대로”라고 말합니다.' })])).toMatchObject({ ok: false });
    expect(verify([claim({ text: '기록은 “원문 그대로!”라고 말합니다.' })])).toMatchObject({ ok: false });
  });
});

describe('fixture verification path', () => {
  it('derives from authorized excerpts and still passes through the production deterministic verifier', async () => {
    const item = evidence();
    const generation = await new FixtureAnswerGenerator().generate({
      question: '질문', evidence: [item], signal: new AbortController().signal,
    });
    const deterministic = new CitationVerifier().verify({ catalog: catalog([item]), claims: generation.claims, evidence: [item] });
    expect(deterministic.ok).toBe(true);
    if (!deterministic.ok) return;
    const semantic = await new FixtureSemanticVerifier().verify({
      sentenceUnits: deterministic.sentenceUnits, evidence: [item], signal: new AbortController().signal,
    });
    expect(semantic.supportedSentenceIds).toEqual(deterministic.sentenceUnits.map((unit) => unit.id));
    expect(semantic.contradictedSentenceIds).toEqual([]);
  });
});
