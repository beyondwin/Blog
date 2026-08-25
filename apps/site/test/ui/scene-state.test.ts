import { describe, expect, it } from 'vitest';
import {
  assertSceneInventory,
  initialSceneState,
  readSceneFocus,
  readSceneHistoryCheckpoint,
  reduceSceneState,
  sceneActionLabels,
  sceneFocusHref,
  sceneOverviewHref,
  SCENE_OBJECT_IDS,
} from '../../src/ui/scene/scene-state';

describe('Storyworld scene state', () => {
  it('enters an allowlisted focus and returns the exact object and rail viewport', () => {
    const focused = reduceSceneState(initialSceneState, {
      type: 'focus',
      focusId: 'judgment-scale',
      scrollLeft: 349.5,
    });

    expect(focused).toEqual({
      mode: 'focus',
      focusId: 'judgment-scale',
      returnCheckpoint: { focusId: 'judgment-scale', scrollLeft: 349.5 },
    });
    expect(reduceSceneState(focused, { type: 'return' })).toEqual({
      mode: 'overview',
      restore: { focusId: 'judgment-scale', scrollLeft: 349.5 },
    });
  });

  it('normalizes unknown or ambiguous focus queries to overview', () => {
    expect(readSceneFocus('?focus=judgment-scale')).toBe('judgment-scale');
    expect(readSceneFocus('?focus=unknown')).toBeUndefined();
    expect(readSceneFocus('?focus=judgment-scale&focus=black-swan')).toBeUndefined();
    expect(readSceneFocus('?focus=../../private')).toBeUndefined();
  });

  it('keeps the authored inventory bounded and rejects duplicates or unknown objects', () => {
    expect(SCENE_OBJECT_IDS).toHaveLength(5);
    expect(() => assertSceneInventory(SCENE_OBJECT_IDS)).not.toThrow();
    expect(() => assertSceneInventory(['reading-desk-cobalt', 'black-swan'])).toThrow('3 to 5');
    expect(() => assertSceneInventory([...SCENE_OBJECT_IDS, 'unknown'])).toThrow('3 to 5');
    expect(() => assertSceneInventory(['reading-desk-cobalt', 'judgment-scale', 'judgment-scale'])).toThrow('unique');
  });

  it('uses destination-specific action labels without the ambiguous legacy label', () => {
    expect(sceneActionLabels('article')).toEqual({
      inspect: '살펴보기',
      read: '글 읽기',
      return: '장면으로 돌아가기',
    });
    expect(sceneActionLabels('review')).toEqual({
      inspect: '살펴보기',
      read: '책 읽기',
      return: '장면으로 돌아가기',
    });
    expect(Object.values(sceneActionLabels('article'))).not.toContain('전체 보기');
  });

  it('accepts only finite non-negative exact-return checkpoints', () => {
    expect(readSceneHistoryCheckpoint({
      bwScene: { focusId: 'black-swan', scrollLeft: 644 },
    })).toEqual({ focusId: 'black-swan', scrollLeft: 644 });
    expect(readSceneHistoryCheckpoint({
      bwScene: { focusId: 'unknown', scrollLeft: 644 },
    })).toBeUndefined();
    expect(readSceneHistoryCheckpoint({
      bwScene: { focusId: 'black-swan', scrollLeft: Number.NaN },
    })).toBeUndefined();
    expect(readSceneHistoryCheckpoint({
      bwScene: { focusId: 'black-swan', scrollLeft: -1 },
    })).toBeUndefined();
  });

  it('builds canonical inspect URLs and removes focus without disturbing other state', () => {
    expect(sceneFocusHref('/?utm=reader#stage', 'black-swan')).toBe('/?utm=reader&focus=black-swan#stage');
    expect(sceneOverviewHref('/?utm=reader&focus=black-swan#stage')).toBe('/?utm=reader#stage');
  });
});
