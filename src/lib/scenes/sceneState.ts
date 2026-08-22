export type SceneState =
  | { mode: 'overview'; restoreFocusId?: string }
  | { mode: 'focus'; focusedId: string; restoreFocusId: string };

export type SceneEvent =
  | { type: 'focus'; objectId: string }
  | { type: 'close' }
  | { type: 'invalid-focus' };

export const initialSceneState: SceneState = { mode: 'overview' };

export function reduceSceneState(state: SceneState, event: SceneEvent): SceneState {
  if (event.type === 'focus') {
    return {
      mode: 'focus',
      focusedId: event.objectId,
      restoreFocusId: event.objectId,
    };
  }

  if (event.type === 'close') {
    return {
      mode: 'overview',
      ...(state.restoreFocusId ? { restoreFocusId: state.restoreFocusId } : {}),
    };
  }

  return { mode: 'overview' };
}

export function readFocusId(search: string, validIds: ReadonlySet<string>): string | undefined {
  const value = new URLSearchParams(search).get('focus');
  return value && validIds.has(value) ? value : undefined;
}

export function shouldRequestSceneFocus(
  objectId: string,
  activeFocusId?: string,
  pendingFocusId?: string,
): boolean {
  return objectId !== activeFocusId && objectId !== pendingFocusId;
}

export function readSceneScrollLeft(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const value = (state as { publicSceneScrollLeft?: unknown }).publicSceneScrollLeft;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function withFocusUrl(url: URL, objectId: string): string {
  const next = new URL(url);
  next.searchParams.set('focus', objectId);
  return next.pathname + next.search + next.hash;
}

export function withoutFocusUrl(url: URL): string {
  const next = new URL(url);
  next.searchParams.delete('focus');
  return next.pathname + next.search + next.hash;
}
