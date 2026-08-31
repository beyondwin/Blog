import { ORIGIN_QUERY_MAX_LENGTH } from '../navigation/origin';
import { createAnswerViewModel, type AnswerViewModel } from './answerViewModel';
import type { CoordinatedAskResult } from './publicAskCoordinator';

export const SAMPLE_QUESTION = 'AI 시대에도 왜 계속 책을 읽나요?';

export const FALLBACK_NOTICE = {
  'insufficient-evidence': '충분한 공개 근거를 확인하지 못해 검색 결과를 보여드립니다.',
  'unsupported-question': '이 질문은 공개 기록만으로 답하기 어려워 검색 결과를 보여드립니다.',
  'provider-disabled': '현재 답변 기능을 쉬고 있어 공개 기록 검색 결과를 보여드립니다.',
  'release-mismatch': '공개 기록 버전이 바뀌어 안전하게 검색 결과로 전환했습니다.',
  timeout: '답변을 기다리는 시간이 길어져 공개 기록 검색 결과로 전환했습니다.',
  unavailable: '답변 기능에 연결하지 못해 공개 기록 검색 결과를 보여드립니다.',
  'rate-limited': '잠시 질문이 많아 공개 기록 검색 결과를 보여드립니다.',
  'invalid-response': '검증할 수 없는 답변 대신 공개 기록 검색 결과를 보여드립니다.',
} as const;

export type AskExperienceState =
  | { view: 'idle'; query: '' }
  | {
      view: 'pending';
      query: string;
      phase: 'retrieving' | 'connecting' | 'composing';
      visualComplete: boolean;
      answer: AnswerViewModel | null;
    }
  | { view: 'answered'; query: string; answer: AnswerViewModel }
  | { view: 'evidence-open'; query: string; answer: AnswerViewModel; selectedEvidenceId: string }
  | {
      view: 'search-results';
      query: string;
      notice: string | null;
      originPolicy: 'search-continuation' | 'canonical-only';
    };

export type AskExperienceAction =
  | { type: 'submit-answer'; query: string }
  | { type: 'restore-search'; query: string }
  | { type: 'advance'; phase: 'connecting' | 'composing' }
  | { type: 'visual-complete' }
  | { type: 'network-settled'; result: CoordinatedAskResult }
  | { type: 'open-evidence'; evidenceId: string }
  | { type: 'select-evidence'; evidenceId: string }
  | { type: 'close-evidence' }
  | { type: 'reset' };

function boundedQuestion(value: string): string {
  const query = value.trim();
  return query.length > 0 && Array.from(query).length <= ORIGIN_QUERY_MAX_LENGTH ? query : '';
}

export function initialAskState(initialQuery: string): AskExperienceState {
  const query = boundedQuestion(initialQuery);
  return query
    ? { view: 'search-results', query, notice: null, originPolicy: 'search-continuation' }
    : { view: 'idle', query: '' };
}

function fallback(query: string, code: keyof typeof FALLBACK_NOTICE): AskExperienceState {
  return {
    view: 'search-results',
    query,
    notice: FALLBACK_NOTICE[code],
    originPolicy: 'canonical-only',
  };
}

function settleNetwork(
  state: Extract<AskExperienceState, { view: 'pending' }>,
  result: CoordinatedAskResult,
): AskExperienceState {
  if (result.kind === 'aborted' || result.kind === 'stale') return state;
  if (result.kind === 'transport-error') return fallback(state.query, result.code);
  if (result.response.kind === 'search') return fallback(state.query, result.response.reason);
  if (result.response.kind === 'error') return fallback(state.query, result.response.code);

  let answer: AnswerViewModel;
  try {
    answer = createAnswerViewModel(result.response);
  } catch {
    return fallback(state.query, 'invalid-response');
  }
  return state.visualComplete
    ? { view: 'answered', query: state.query, answer }
    : { ...state, answer };
}

export function askExperienceReducer(
  state: AskExperienceState,
  action: AskExperienceAction,
): AskExperienceState {
  switch (action.type) {
    case 'submit-answer': {
      const query = boundedQuestion(action.query);
      return query
        ? { view: 'pending', query, phase: 'retrieving', visualComplete: false, answer: null }
        : { view: 'idle', query: '' };
    }
    case 'restore-search': {
      const query = boundedQuestion(action.query);
      return query
        ? { view: 'search-results', query, notice: null, originPolicy: 'search-continuation' }
        : { view: 'idle', query: '' };
    }
    case 'advance':
      if (state.view !== 'pending') return state;
      if (action.phase === 'connecting' && state.phase === 'retrieving') {
        return { ...state, phase: 'connecting' };
      }
      if (action.phase === 'composing' && state.phase === 'connecting') {
        return { ...state, phase: 'composing' };
      }
      return state;
    case 'visual-complete':
      if (state.view !== 'pending') return state;
      return state.answer
        ? { view: 'answered', query: state.query, answer: state.answer }
        : { ...state, visualComplete: true };
    case 'network-settled':
      return state.view === 'pending' ? settleNetwork(state, action.result) : state;
    case 'open-evidence':
      return state.view === 'answered' && state.answer.evidenceById.has(action.evidenceId)
        ? { ...state, view: 'evidence-open', selectedEvidenceId: action.evidenceId }
        : state;
    case 'select-evidence':
      return state.view === 'evidence-open' && state.answer.evidenceById.has(action.evidenceId)
        ? { ...state, selectedEvidenceId: action.evidenceId }
        : state;
    case 'close-evidence':
      return state.view === 'evidence-open'
        ? { view: 'answered', query: state.query, answer: state.answer }
        : state;
    case 'reset':
      return { view: 'idle', query: '' };
  }
}
