import { SiteShell } from '../../src/ui/components/SiteShell';
import { boundedSearchQuery, SearchPage } from '../../src/ui/search/SearchPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import {
  loadVerifiedRelease,
  loadVerifiedSearchAnswerRelease,
  searchInventory,
} from '../release.server';

const searchCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-search.css?inline').then((module) => module.default)
  : '';
export const handle: RouteCriticalCssHandle = { criticalCss: searchCss };

export async function loader({ request }: { request?: Request } = {}) {
  const release = await loadVerifiedRelease();
  const answerRelease = await loadVerifiedSearchAnswerRelease(release);
  const initialQuery = boundedSearchQuery(
    request ? new URL(request.url).searchParams.get('q') ?? '' : '',
  );
  return {
    binding: {
      contentReleaseId: release.manifest.releaseId,
      answerReleaseId: answerRelease.manifest.answerReleaseId,
    },
    initialQuery,
    inventory: searchInventory(release),
  };
}

export function SearchPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <DocumentMetadata
        canonical="/search/"
        description="공개된 기록에 질문하고, 연결된 답과 근거를 살펴봅니다."
        title={publicMetadataTitle('검색')}
      />
      <SiteShell currentSection="search">
        <SearchPage
          binding={data.binding}
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
