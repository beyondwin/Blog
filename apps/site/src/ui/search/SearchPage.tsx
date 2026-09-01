import { useMemo } from 'react';
import { SecondBrainExperience } from './SecondBrainExperience';
import type {
  PublicAnswerReleaseBinding,
  PublicAskProvider,
} from './publicAskTransport';
import type { SearchInventoryItem } from './searchModel';

type PublicAskProviderConstructor = new (
  binding: PublicAnswerReleaseBinding,
) => PublicAskProvider;

export type PublicAskProviderLoader = () => Promise<{
  HttpPublicAskProvider: PublicAskProviderConstructor;
}>;

const loadPublicAskProvider: PublicAskProviderLoader = () => import('./publicAskProvider');

export function createLazyPublicAskProvider(
  binding: PublicAnswerReleaseBinding,
  loadProvider: PublicAskProviderLoader = loadPublicAskProvider,
): PublicAskProvider {
  let providerPromise: Promise<PublicAskProvider> | undefined;
  return {
    ask(question, options) {
      providerPromise ??= loadProvider().then(
        ({ HttpPublicAskProvider }) => new HttpPublicAskProvider(binding),
      );
      return providerPromise.then((provider) => provider.ask(question, options));
    },
  };
}

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
    () => provider ?? createLazyPublicAskProvider(binding),
    [provider, binding.answerReleaseId, binding.contentReleaseId],
  );
  return <SecondBrainExperience initialQuery={initialQuery} inventory={inventory} provider={activeProvider} />;
}
