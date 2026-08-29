import { SecondBrainExperience } from './SecondBrainExperience';
import type { PublicAnswerFixture } from './secondBrain';
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

export function SearchPage({ fixture, initialQuery = '', inventory }: {
  fixture: PublicAnswerFixture;
  initialQuery?: string;
  inventory: readonly SearchInventoryItem[];
}) {
  return <SecondBrainExperience fixture={fixture} initialQuery={initialQuery} inventory={inventory} />;
}
