import type { PublicCollection } from '@beyondwin/contracts';
import { isSafeOriginId } from './origin';

export function recordAnchor(collection: PublicCollection, id: string): string {
  const anchor = `record-${collection}-${id}`;
  if (!isSafeOriginId(anchor)) {
    throw new Error(`${collection}/${id}: cannot produce a safe origin anchor`);
  }
  return anchor;
}
