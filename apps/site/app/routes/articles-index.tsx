import { SiteShell } from '../../src/ui/components/SiteShell';
import { ArticleIndexPage } from '../../src/ui/articles/ArticleIndexPage';
import { assertCompleteArticleInventory, normalizeArticleTopic } from '../../src/ui/articles/articleTopics';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, recordsForCollection } from '../release.server';

const indexCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-index.css?inline').then((module) => module.default)
  : '';
export const handle: RouteCriticalCssHandle = { criticalCss: indexCss };

export async function loader({ request }: { request?: Request } = {}) {
  const release = await loadVerifiedRelease();
  const records = recordsForCollection(release, 'articles');
  assertCompleteArticleInventory(records);
  const selectedTopic = normalizeArticleTopic(request ? new URL(request.url).searchParams.get('topic') : null);
  return { records, assets: release.manifest.assets, selectedTopic };
}

export function ArticlesIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <DocumentMetadata canonical="/articles/" description="기술과 디자인, 에이전트와 시스템을 다룬 아티클." title={publicMetadataTitle('아티클')} />
      <SiteShell currentSection="articles">
        <ArticleIndexPage records={data.records} assets={new Map(Object.entries(data.assets))} selectedTopic={data.selectedTopic} />
      </SiteShell>
    </>
  );
}

export default function ArticlesIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <ArticlesIndexPresentation data={loaderData} />;
}
