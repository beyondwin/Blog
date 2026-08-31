import { describe, expect, it } from 'vitest';
import type { PublicAskResponse } from '@beyondwin/contracts';
import type { CoordinatedAskResult } from '../../src/ui/search/publicAskCoordinator';
import {
  SAMPLE_QUESTION,
  askExperienceReducer,
  initialAskState,
} from '../../src/ui/search/secondBrain';

const evidenceId = 'c'.repeat(64);
const answer: Extract<PublicAskResponse, { kind: 'answer' }> = {
  kind: 'answer',
  answerReleaseId: 'a'.repeat(64),
  claims: [{ id: 'claim-1', text: '공개 근거로 답합니다.', evidenceIds: [evidenceId] }],
  evidence: [{
    evidenceId,
    chunkId: 'd'.repeat(64),
    recordId: 'thoughts/why-i-read-in-the-ai-era',
    collectionLabel: '생각',
    recordTitle: 'AI 시대에, 나는 왜 책을 읽는가',
    canonicalPath: '/thoughts/why-i-read-in-the-ai-era/',
    locator: { kind: 'heading-paragraph', label: '문단 1', ordinal: 1 },
    excerpt: '검증된 공개 기록입니다.',
    excerptChecksum: `sha256:${'e'.repeat(64)}`,
  }],
};

function settled(response: PublicAskResponse, token = 1): CoordinatedAskResult {
  return { kind: 'response', token, response };
}

describe('provider-aware second-brain state', () => {
  it('keeps network and choreography completion separate in either arrival order', () => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });
    expect(pending).toEqual({
      view: 'pending', query: SAMPLE_QUESTION, phase: 'retrieving', visualComplete: false, answer: null,
    });

    const networkFirst = askExperienceReducer(pending, {
      type: 'network-settled', result: settled(answer),
    });
    expect(networkFirst).toMatchObject({ view: 'pending', visualComplete: false, answer: { source: 'provider' } });
    expect(askExperienceReducer(networkFirst, { type: 'visual-complete' })).toMatchObject({
      view: 'answered', answer: { source: 'provider' },
    });

    const visualFirst = askExperienceReducer(pending, { type: 'visual-complete' });
    expect(visualFirst).toEqual({ ...pending, visualComplete: true });
    expect(askExperienceReducer(visualFirst, {
      type: 'network-settled', result: settled(answer),
    })).toMatchObject({ view: 'answered', answer: { source: 'provider' } });
  });

  it('advances pending visual phases without allowing a phase to invent an answer', () => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });
    const connecting = askExperienceReducer(pending, { type: 'advance', phase: 'connecting' });
    const composing = askExperienceReducer(connecting, { type: 'advance', phase: 'composing' });

    expect(connecting).toMatchObject({ view: 'pending', phase: 'connecting', answer: null });
    expect(composing).toMatchObject({ view: 'pending', phase: 'composing', answer: null });
    expect(askExperienceReducer(composing, { type: 'visual-complete' })).toMatchObject({
      view: 'pending', visualComplete: true, answer: null,
    });
  });

  it.each([
    [{ kind: 'search', reason: 'insufficient-evidence' }, '충분한 공개 근거를 확인하지 못해 검색 결과를 보여드립니다.'],
    [{ kind: 'search', reason: 'unsupported-question' }, '이 질문은 공개 기록만으로 답하기 어려워 검색 결과를 보여드립니다.'],
    [{ kind: 'search', reason: 'provider-disabled' }, '현재 답변 기능을 쉬고 있어 공개 기록 검색 결과를 보여드립니다.'],
    [{ kind: 'search', reason: 'release-mismatch' }, '공개 기록 버전이 바뀌어 안전하게 검색 결과로 전환했습니다.'],
    [{ kind: 'error', code: 'timeout', retryable: true }, '답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.'],
    [{ kind: 'error', code: 'unavailable', retryable: true }, '답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.'],
    [{ kind: 'error', code: 'rate-limited', retryable: true }, '잠시 질문이 많아 공개 기록 검색 결과를 보여드립니다.'],
    [{ kind: 'error', code: 'invalid-response', retryable: false }, '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.'],
  ] as const)('maps response fallback %# to one deterministic search branch', (response, notice) => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });

    expect(askExperienceReducer(pending, {
      type: 'network-settled', result: settled(response),
    })).toEqual({ view: 'search-results', query: SAMPLE_QUESTION, notice });
  });

  it.each([
    ['timeout', '답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.'],
    ['unavailable', '답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.'],
    ['invalid-response', '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.'],
  ] as const)('maps transport %s to one deterministic search branch', (code, notice) => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });

    expect(askExperienceReducer(pending, {
      type: 'network-settled', result: { kind: 'transport-error', token: 1, code },
    })).toEqual({ view: 'search-results', query: SAMPLE_QUESTION, notice });
  });

  it('turns a schema-bypassed invalid answer into an invalid-response fallback', () => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });
    const invalid = {
      ...answer,
      claims: [{ ...answer.claims[0]!, evidenceIds: ['9'.repeat(64)] }],
    } as Extract<PublicAskResponse, { kind: 'answer' }>;

    expect(askExperienceReducer(pending, {
      type: 'network-settled', result: settled(invalid),
    })).toEqual({
      view: 'search-results',
      query: SAMPLE_QUESTION,
      notice: '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.',
    });
  });

  it('keeps answer, evidence-open, search fallback, and transport fallback mutually exclusive', () => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });
    const answered = askExperienceReducer(
      askExperienceReducer(pending, { type: 'visual-complete' }),
      { type: 'network-settled', result: settled(answer) },
    );
    const evidenceOpen = askExperienceReducer(answered, { type: 'open-evidence', evidenceId });

    expect(answered).toMatchObject({ view: 'answered', query: SAMPLE_QUESTION, answer: { source: 'provider' } });
    expect(evidenceOpen).toMatchObject({
      view: 'evidence-open', selectedEvidenceId: evidenceId, answer: { source: 'provider' },
    });
    expect(askExperienceReducer(evidenceOpen, { type: 'close-evidence' })).toEqual(answered);
    expect(askExperienceReducer(answered, { type: 'open-evidence', evidenceId: '9'.repeat(64) })).toBe(answered);
  });

  it('ignores stale and aborted network outcomes so they cannot publish state', () => {
    const pending = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer', query: SAMPLE_QUESTION,
    });

    expect(askExperienceReducer(pending, {
      type: 'network-settled', result: { kind: 'stale', token: 1 },
    })).toBe(pending);
    expect(askExperienceReducer(pending, {
      type: 'network-settled', result: { kind: 'aborted', token: 1 },
    })).toBe(pending);
  });

  it('uses deterministic real search for direct URLs with no provider answer state', () => {
    expect(initialAskState(' Graphify ')).toEqual({ view: 'search-results', query: 'Graphify', notice: null });
    expect(initialAskState('')).toEqual({ view: 'idle', query: '' });
  });
});
