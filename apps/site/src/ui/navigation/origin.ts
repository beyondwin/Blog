export const ORIGIN_QUERY_MAX_LENGTH = 120;
export const ORIGIN_ID_MAX_LENGTH = 80;

/**
 * Focus and anchor identifiers are deliberately narrower than general DOM IDs:
 * 1-80 ASCII letters/digits, with interior hyphens or underscores only.
 */
const SAFE_ORIGIN_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,78}[A-Za-z0-9])?$/u;
const UNSAFE_QUERY_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}]/u;

export type ReadingOrigin =
  | { kind: 'scene'; focusId: string }
  | { kind: 'articles'; anchorId: string }
  | { kind: 'reviews'; anchorId: string }
  | { kind: 'search'; query: string; anchorId: string }
  | { kind: 'analysis' | 'ideas' | 'travel' | 'tags'; anchorId?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSafeOriginId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= ORIGIN_ID_MAX_LENGTH
    && SAFE_ORIGIN_ID.test(value);
}

function parseQuery(value: unknown): string | null {
  if (typeof value !== 'string' || UNSAFE_QUERY_CHARACTER.test(value)) return null;
  const normalized = value.trim();
  if (normalized.length === 0 || Array.from(normalized).length > ORIGIN_QUERY_MAX_LENGTH) return null;
  return normalized;
}

export function parseOrigin(value: unknown): ReadingOrigin | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;

  switch (value.kind) {
    case 'scene':
      return isSafeOriginId(value.focusId) ? { kind: 'scene', focusId: value.focusId } : null;
    case 'articles':
    case 'reviews':
      return isSafeOriginId(value.anchorId) ? { kind: value.kind, anchorId: value.anchorId } : null;
    case 'search': {
      const query = parseQuery(value.query);
      return query !== null && isSafeOriginId(value.anchorId)
        ? { kind: 'search', query, anchorId: value.anchorId }
        : null;
    }
    case 'analysis':
    case 'ideas':
    case 'travel':
    case 'tags':
      return isSafeOriginId(value.anchorId)
        ? { kind: value.kind, anchorId: value.anchorId }
        : { kind: value.kind };
    default:
      return null;
  }
}

export function originsEqual(left: ReadingOrigin, right: ReadingOrigin): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'scene':
      return right.kind === 'scene' && left.focusId === right.focusId;
    case 'articles':
    case 'reviews':
      return right.kind === left.kind && left.anchorId === right.anchorId;
    case 'search':
      return right.kind === 'search' && left.query === right.query && left.anchorId === right.anchorId;
    case 'analysis':
    case 'ideas':
    case 'travel':
    case 'tags':
      return right.kind === left.kind && left.anchorId === right.anchorId;
  }
}
