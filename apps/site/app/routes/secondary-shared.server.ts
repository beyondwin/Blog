import type { CandidateRelease } from '../release.server';
import { loadVerifiedRelease, recordForRoute, summariesForCollection } from '../release.server';
import type { SecondaryCollection, SecondaryDetailData, SecondaryIndexData } from './secondary-shared';

export async function loadSecondaryIndex(collection: SecondaryCollection): Promise<SecondaryIndexData> {
  return { records: summariesForCollection(await loadVerifiedRelease(), collection) };
}

export function loadSecondaryDetail(
  release: CandidateRelease,
  collection: SecondaryCollection,
  slug: string | undefined,
): SecondaryDetailData {
  const record = slug ? recordForRoute(release, collection, slug) : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  if (record.collection !== 'travel' || !record.leadMedia) return { record };
  const mediaAsset = release.manifest.assets[`travel/${record.id}/${record.leadMedia}`];
  if (!mediaAsset) throw new Error(`Verified release is missing travel/${record.id}/${record.leadMedia}`);
  return { record, mediaAsset };
}
