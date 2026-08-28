import { SiteShell } from '../../src/ui/components/SiteShell';
import { boundedSearchQuery, SearchPage } from '../../src/ui/search/SearchPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, searchDiscovery, searchInventory } from '../release.server';

const searchCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-search.css?inline').then((module) => module.default)
  : '';
export const handle: RouteCriticalCssHandle = { criticalCss: searchCss };

export async function loader({ request }: { request?: Request } = {}) {
  const release = await loadVerifiedRelease();
  const initialQuery = boundedSearchQuery(
    request ? new URL(request.url).searchParams.get('q') ?? '' : '',
  );
  return {
    discovery: searchDiscovery(release),
    initialQuery,
    inventory: searchInventory(release),
  };
}

export function SearchPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <DocumentMetadata
        canonical="/search/"
        description="서평, 아티클, 생각을 검색합니다."
        title={publicMetadataTitle('검색')}
      />
      <SiteShell currentSection="search">
        <SearchPage
          discovery={data.discovery}
          initialQuery={data.initialQuery}
          inventory={data.inventory}
        />
      </SiteShell>
    </>
  );
}

export default function SearchRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <SearchPresentation data={loaderData} />;
}
