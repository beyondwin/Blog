import { SiteShell } from '../../src/ui/components/SiteShell';
import { boundedSearchQuery, SearchPage } from '../../src/ui/search/SearchPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import {
  loadVerifiedRelease,
  loadVerifiedSearchAnswerRelease,
  verifiedSearchLoaderData,
} from '../release.server';

const searchCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-search.css?inline').then((module) => module.default)
  : '';
export const handle: RouteCriticalCssHandle = { criticalCss: searchCss };

export function localProviderDisclosureEnabled(
  env: {
    FORM_THOUGHT_LOCAL_LIVE_DISCLOSURE?: string;
    FORM_THOUGHT_DELIVERY_MODE?: string;
  } = process.env,
): boolean {
  return env.FORM_THOUGHT_DELIVERY_MODE !== 'production'
    && env.FORM_THOUGHT_LOCAL_LIVE_DISCLOSURE === 'true';
}

export async function loader({ request }: { request?: Request } = {}) {
  const release = await loadVerifiedRelease();
  const answerRelease = await loadVerifiedSearchAnswerRelease(release);
  const initialQuery = boundedSearchQuery(
    request ? new URL(request.url).searchParams.get('q') ?? '' : '',
  );
  return {
    ...verifiedSearchLoaderData(release, answerRelease, initialQuery),
    localProviderDisclosure: localProviderDisclosureEnabled(),
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
          localProviderDisclosure={data.localProviderDisclosure}
        />
      </SiteShell>
    </>
  );
}

export default function SearchRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <SearchPresentation data={loaderData} />;
}
