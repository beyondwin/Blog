import { describe, expect, it } from 'vitest';
import {
  initialSceneState,
  readFocusId,
  readSceneScrollLeft,
  reduceSceneState,
  shouldRequestSceneFocus,
  withFocusUrl,
  withoutFocusUrl,
} from './sceneState';

const ids = new Set(['reading-desk-cobalt', 'black-swan']);

describe('scene focus state', () => {
  it('focuses and returns to the same overview selection', () => {
    const focused = reduceSceneState(initialSceneState, {
      type: 'focus',
      objectId: 'reading-desk-cobalt',
    });

    expect(focused).toEqual({
      mode: 'focus',
      focusedId: 'reading-desk-cobalt',
      restoreFocusId: 'reading-desk-cobalt',
    });
    expect(reduceSceneState(focused, { type: 'close' })).toEqual({
      mode: 'overview',
      restoreFocusId: 'reading-desk-cobalt',
    });
  });

  it('restores the exact most recent focus after refocusing', () => {
    const focused = reduceSceneState(
      reduceSceneState(initialSceneState, { type: 'focus', objectId: 'reading-desk-cobalt' }),
      { type: 'focus', objectId: 'black-swan' },
    );

    expect(reduceSceneState(focused, { type: 'close' })).toEqual({
      mode: 'overview',
      restoreFocusId: 'black-swan',
    });
  });

  it('clears an invalid direct focus safely', () => {
    const focused = reduceSceneState(initialSceneState, {
      type: 'focus',
      objectId: 'black-swan',
    });

    expect(reduceSceneState(focused, { type: 'invalid-focus' })).toEqual({
      mode: 'overview',
    });
  });
});

describe('scene focus URLs', () => {
  it('accepts one focus request while rejecting the same active or pending request', () => {
    expect(shouldRequestSceneFocus('reading-desk-cobalt')).toBe(true);
    expect(shouldRequestSceneFocus(
      'reading-desk-cobalt',
      'reading-desk-cobalt',
    )).toBe(false);
    expect(shouldRequestSceneFocus(
      'reading-desk-cobalt',
      undefined,
      'reading-desk-cobalt',
    )).toBe(false);
    expect(shouldRequestSceneFocus(
      'black-swan',
      'reading-desk-cobalt',
      'reading-desk-cobalt',
    )).toBe(true);
  });

  it('accepts only a valid direct focus id', () => {
    expect(readFocusId('?focus=private-node', ids)).toBeUndefined();
    expect(readFocusId('?focus=black-swan', ids)).toBe('black-swan');
  });

  it('keeps pathname, unrelated query parameters, and hash when adding focus', () => {
    const focused = withFocusUrl(
      new URL('https://beyondwin.test/atlas?from=search#overview'),
      'black-swan',
    );

    expect(focused).toBe('/atlas?from=search&focus=black-swan#overview');
  });

  it('removes only focus while preserving pathname, unrelated query parameters, and hash', () => {
    const focused = withFocusUrl(
      new URL('https://beyondwin.test/atlas?from=search#overview'),
      'black-swan',
    );

    expect(withoutFocusUrl(new URL('https://beyondwin.test' + focused)))
      .toBe('/atlas?from=search#overview');
  });

  it('accepts only a finite non-negative scene viewport checkpoint', () => {
    expect(readSceneScrollLeft({ publicSceneScrollLeft: 279 })).toBe(279);
    expect(readSceneScrollLeft({ publicSceneScrollLeft: 0 })).toBe(0);
    expect(readSceneScrollLeft({ publicSceneScrollLeft: -1 })).toBeUndefined();
    expect(readSceneScrollLeft({ publicSceneScrollLeft: Number.NaN })).toBeUndefined();
    expect(readSceneScrollLeft({ publicSceneScrollLeft: '279' })).toBeUndefined();
    expect(readSceneScrollLeft(null)).toBeUndefined();
  });
});
