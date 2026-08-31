import { describe, expect, it } from 'vitest';
import type { PublicAskResponse } from '@beyondwin/contracts';
import { createAnswerViewModel } from '../../src/ui/search/answerViewModel';

const evidenceOne = {
  evidenceId: 'c'.repeat(64),
  chunkId: 'd'.repeat(64),
  recordId: 'thoughts/why-i-read-in-the-ai-era' as const,
  collectionLabel: '생각',
  recordTitle: '첫 기록',
  canonicalPath: '/thoughts/why-i-read-in-the-ai-era/' as const,
  locator: { kind: 'heading-paragraph' as const, label: '문단 1', ordinal: 1 },
  excerpt: '첫 공개 근거입니다.',
  excerptChecksum: `sha256:${'e'.repeat(64)}` as const,
};
const evidenceTwo = {
  ...evidenceOne,
  evidenceId: 'f'.repeat(64),
  chunkId: '1'.repeat(64),
  recordTitle: '둘째 기록',
  locator: { kind: 'heading-paragraph' as const, label: '문단 2', ordinal: 2 },
  excerpt: '둘째 공개 근거입니다.',
  excerptChecksum: `sha256:${'2'.repeat(64)}` as const,
};
const validAnswer: Extract<PublicAskResponse, { kind: 'answer' }> = {
  kind: 'answer',
  answerReleaseId: 'a'.repeat(64),
  claims: [{
    id: 'claim-1',
    text: '두 근거를 함께 연결합니다.',
    evidenceIds: [evidenceOne.evidenceId, evidenceTwo.evidenceId],
  }],
  evidence: [evidenceTwo, evidenceOne],
};

describe('provider answer view model', () => {
  it('preserves provider evidence order while resolving selection only by evidence ID', () => {
    const model = createAnswerViewModel(validAnswer);

    expect(model.source).toBe('provider');
    expect(model.answerReleaseId).toBe('a'.repeat(64));
    expect(model.evidence.map((item) => item.recordTitle)).toEqual(['둘째 기록', '첫 기록']);
    expect(model.evidenceById.get(evidenceOne.evidenceId)?.recordTitle).toBe('첫 기록');
    expect(model.evidenceById.get(evidenceTwo.evidenceId)?.recordTitle).toBe('둘째 기록');
  });

  it('rejects a dangling claim reference even when schema parsing was bypassed', () => {
    const bypassed = {
      ...validAnswer,
      claims: [{ ...validAnswer.claims[0]!, evidenceIds: ['9'.repeat(64)] }],
    } as Extract<PublicAskResponse, { kind: 'answer' }>;

    expect(() => createAnswerViewModel(bypassed)).toThrow('claim evidence must resolve');
  });

  it('rejects unreferenced evidence even when schema parsing was bypassed', () => {
    const bypassed = {
      ...validAnswer,
      claims: [{ ...validAnswer.claims[0]!, evidenceIds: [evidenceOne.evidenceId] }],
    } as Extract<PublicAskResponse, { kind: 'answer' }>;

    expect(() => createAnswerViewModel(bypassed)).toThrow('response evidence must be referenced');
  });

  it('rejects duplicate evidence identities before building the lookup map', () => {
    const bypassed = {
      ...validAnswer,
      evidence: [evidenceOne, { ...evidenceTwo, evidenceId: evidenceOne.evidenceId }],
    } as Extract<PublicAskResponse, { kind: 'answer' }>;

    expect(() => createAnswerViewModel(bypassed)).toThrow('evidence IDs must be unique');
  });
});
