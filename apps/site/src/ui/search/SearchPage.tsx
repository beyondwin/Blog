import { useMemo } from 'react';
import { SecondBrainExperience } from './SecondBrainExperience';
import {
  HttpPublicAskProvider,
  type PublicAnswerReleaseBinding,
  type PublicAskProvider,
} from './publicAskProvider';
import type { SearchInventoryItem } from './searchModel';

export {
  boundedSearchQuery,
  matchSearchItem,
  searchMatches,
  searchOriginForItem,
  type SearchDiscoveryItem,
  type SearchInventoryItem,
  type SearchKind,
  type SearchMatch,
} from './searchModel';

export function SearchPage({ binding, initialQuery = '', inventory, provider }: {
  binding: PublicAnswerReleaseBinding;
  initialQuery?: string;
  inventory: readonly SearchInventoryItem[];
  provider?: PublicAskProvider;
}) {
  const activeProvider = useMemo(
    () => provider ?? new HttpPublicAskProvider(binding),
    [provider, binding.answerReleaseId, binding.contentReleaseId],
  );
  return <SecondBrainExperience initialQuery={initialQuery} inventory={inventory} provider={activeProvider} />;
}
