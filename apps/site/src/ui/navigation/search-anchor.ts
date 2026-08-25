import { isSafeOriginId } from './origin';

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

export function safeSearchAnchor(label: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(label)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  const anchor = `tag-${hash.toString(16).padStart(16, '0')}`;
  if (!isSafeOriginId(anchor)) throw new Error(`${label}: cannot produce a safe search anchor`);
  return anchor;
}

export function safeSearchAnchors(
  labels: readonly string[],
  createAnchor: (label: string) => string = safeSearchAnchor,
): Map<string, string> {
  const labelsByAnchor = new Map<string, string>();
  const anchorsByLabel = new Map<string, string>();
  for (const label of labels) {
    const anchor = createAnchor(label);
    if (!isSafeOriginId(anchor)) throw new Error(`${label}: cannot produce a safe search anchor`);
    const existing = labelsByAnchor.get(anchor);
    if (existing !== undefined && existing !== label) {
      throw new Error(`search anchor collision: ${existing} and ${label}`);
    }
    labelsByAnchor.set(anchor, label);
    anchorsByLabel.set(label, anchor);
  }
  return anchorsByLabel;
}
