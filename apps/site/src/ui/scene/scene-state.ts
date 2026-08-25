export const SCENE_OBJECT_IDS = [
  'reading-desk-cobalt',
  'judgment-scale',
  'black-swan',
  'reading-excerpt',
  'shared-reading-table',
] as const;

export type SceneObjectId = typeof SCENE_OBJECT_IDS[number];
export type SceneRecordKind = 'article' | 'review';

export interface SceneReturnCheckpoint {
  focusId: SceneObjectId;
  scrollLeft: number;
}

export type SceneState =
  | { mode: 'overview'; restore?: SceneReturnCheckpoint }
  | { mode: 'focus'; focusId: SceneObjectId; returnCheckpoint: SceneReturnCheckpoint };

export type SceneAction =
  | { type: 'focus'; focusId: SceneObjectId; scrollLeft: number }
  | { type: 'return' };

export const initialSceneState: SceneState = { mode: 'overview' };
const VALID_IDS = new Set<string>(SCENE_OBJECT_IDS);

export function isSceneObjectId(value: unknown): value is SceneObjectId {
  return typeof value === 'string' && VALID_IDS.has(value);
}

export function assertSceneInventory(ids: readonly string[]): void {
  if (ids.length < 3 || ids.length > 5) {
    throw new Error('A public scene must contain 3 to 5 objects');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('Public scene object IDs must be unique');
  }
  if (ids.some((id) => !isSceneObjectId(id))) {
    throw new Error('Public scene contains an unknown object');
  }
}

export function reduceSceneState(state: SceneState, action: SceneAction): SceneState {
  if (action.type === 'focus') {
    const returnCheckpoint = { focusId: action.focusId, scrollLeft: action.scrollLeft };
    return { mode: 'focus', focusId: action.focusId, returnCheckpoint };
  }
  return state.mode === 'focus'
    ? { mode: 'overview', restore: state.returnCheckpoint }
    : state;
}

export function readSceneFocus(search: string): SceneObjectId | undefined {
  const values = new URLSearchParams(search).getAll('focus');
  return values.length === 1 && isSceneObjectId(values[0]) ? values[0] : undefined;
}

export function readSceneHistoryCheckpoint(state: unknown): SceneReturnCheckpoint | undefined {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return undefined;
  const bwScene = (state as { bwScene?: unknown }).bwScene;
  if (typeof bwScene !== 'object' || bwScene === null || Array.isArray(bwScene)) return undefined;
  const { focusId, scrollLeft } = bwScene as { focusId?: unknown; scrollLeft?: unknown };
  if (
    !isSceneObjectId(focusId)
    || typeof scrollLeft !== 'number'
    || !Number.isFinite(scrollLeft)
    || scrollLeft < 0
  ) return undefined;
  return { focusId, scrollLeft };
}

export function sceneActionLabels(kind: SceneRecordKind) {
  return {
    inspect: '살펴보기' as const,
    read: kind === 'article' ? '글 읽기' as const : '책 읽기' as const,
    return: '장면으로 돌아가기' as const,
  };
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sceneFocusHref(href: string, focusId: SceneObjectId): string {
  const url = new URL(href, 'https://beyondwin.invalid');
  url.searchParams.set('focus', focusId);
  return relativeUrl(url);
}

export function sceneOverviewHref(href: string): string {
  const url = new URL(href, 'https://beyondwin.invalid');
  url.searchParams.delete('focus');
  return relativeUrl(url);
}
