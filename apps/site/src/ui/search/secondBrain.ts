import { ORIGIN_QUERY_MAX_LENGTH } from '../navigation/origin';

export const SAMPLE_QUESTION = 'AI 시대에도 왜 계속 책을 읽나요?';

export type AskExperienceState =
  | { view: 'idle'; query: '' }
  | { view: 'retrieving' | 'connecting' | 'composing' | 'answered'; query: string }
  | { view: 'evidence-open'; query: string; selectedEvidenceIndex: number }
  | { view: 'search-results'; query: string }
  | { view: 'error'; query: string; message: string };

export type AskExperienceAction =
  | { type: 'submit-answer'; query: string }
  | { type: 'show-results'; query: string }
  | { type: 'advance'; view: 'connecting' | 'composing' }
  | { type: 'complete' }
  | { type: 'open-evidence'; index: number; evidenceCount: number }
  | { type: 'select-evidence'; index: number; evidenceCount: number }
  | { type: 'close-evidence' }
  | { type: 'reset' }
  | { type: 'fail'; query: string; message: string };

function boundedQuestion(value: string): string {
  const query = value.trim();
  return query.length > 0 && Array.from(query).length <= ORIGIN_QUERY_MAX_LENGTH ? query : '';
}

export function initialAskState(initialQuery: string): AskExperienceState {
  const query = boundedQuestion(initialQuery);
  return query ? { view: 'search-results', query } : { view: 'idle', query: '' };
}

function evidenceIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), count - 1));
}

export function askExperienceReducer(
  state: AskExperienceState,
  action: AskExperienceAction,
): AskExperienceState {
  switch (action.type) {
    case 'submit-answer':
      return { view: 'retrieving', query: action.query };
    case 'show-results':
      return { view: 'search-results', query: action.query };
    case 'advance':
      if (action.view === 'connecting' && state.view === 'retrieving') {
        return { view: 'connecting', query: state.query };
      }
      if (action.view === 'composing' && state.view === 'connecting') {
        return { view: 'composing', query: state.query };
      }
      return state;
    case 'complete':
      return state.view === 'composing' || state.view === 'retrieving'
        ? { view: 'answered', query: state.query }
        : state;
    case 'open-evidence':
      return state.view === 'answered'
        ? {
            view: 'evidence-open',
            query: state.query,
            selectedEvidenceIndex: evidenceIndex(action.index, action.evidenceCount),
          }
        : state;
    case 'select-evidence':
      return state.view === 'evidence-open'
        ? { ...state, selectedEvidenceIndex: evidenceIndex(action.index, action.evidenceCount) }
        : state;
    case 'close-evidence':
      return state.view === 'evidence-open'
        ? { view: 'answered', query: state.query }
        : state;
    case 'reset':
      return { view: 'idle', query: '' };
    case 'fail':
      return { view: 'error', query: action.query, message: action.message };
  }
}
