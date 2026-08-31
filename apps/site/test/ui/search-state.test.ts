import { describe, expect, it } from 'vitest';
import {
  SAMPLE_QUESTION,
  askExperienceReducer,
  initialAskState,
} from '../../src/ui/search/secondBrain';

describe('FORM & THOUGHT second-brain question state', () => {
  it('moves through retrieval, answer, evidence, and focus-return states', () => {
    let state = initialAskState('');
    expect(state.view).toBe('idle');

    state = askExperienceReducer(state, { type: 'submit-answer', query: SAMPLE_QUESTION });
    expect(state).toMatchObject({ view: 'retrieving', query: SAMPLE_QUESTION });
    state = askExperienceReducer(state, { type: 'advance', view: 'connecting' });
    expect(state.view).toBe('connecting');
    state = askExperienceReducer(state, { type: 'advance', view: 'composing' });
    expect(state.view).toBe('composing');
    state = askExperienceReducer(state, { type: 'complete' });
    expect(state).toMatchObject({ view: 'answered', query: SAMPLE_QUESTION });
    state = askExperienceReducer(state, { type: 'open-evidence', index: 1, evidenceCount: 3 });
    expect(state).toMatchObject({ view: 'evidence-open', selectedEvidenceIndex: 1 });
    state = askExperienceReducer(state, { type: 'close-evidence' });
    expect(state).toMatchObject({ view: 'answered', query: SAMPLE_QUESTION });
  });

  it('uses real search for initial or arbitrary queries and replaces stale progress', () => {
    expect(initialAskState(' Graphify ')).toEqual({ view: 'search-results', query: 'Graphify' });

    const retrieving = askExperienceReducer(initialAskState(''), {
      type: 'submit-answer',
      query: SAMPLE_QUESTION,
    });
    expect(askExperienceReducer(retrieving, { type: 'show-results', query: '독서' })).toEqual({
      view: 'search-results',
      query: '독서',
    });
    expect(askExperienceReducer(retrieving, { type: 'advance', view: 'composing' })).toBe(retrieving);
  });

  it('clamps evidence selection and ignores invalid transitions', () => {
    const answered = {
      view: 'answered' as const,
      query: SAMPLE_QUESTION,
    };
    expect(askExperienceReducer(answered, {
      type: 'open-evidence',
      index: 99,
      evidenceCount: 3,
    })).toMatchObject({ view: 'evidence-open', selectedEvidenceIndex: 2 });
    expect(askExperienceReducer(initialAskState(''), { type: 'complete' })).toEqual(initialAskState(''));
  });
});
