import { loadVerifiedRelease, summariesForCollection } from '../release.server';
import type { SecondaryCollection, SecondaryIndexData } from './secondary-shared';

export async function loadSecondaryIndex(collection: SecondaryCollection): Promise<SecondaryIndexData> {
  return { records: summariesForCollection(await loadVerifiedRelease(), collection) };
}
