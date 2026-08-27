import { SiteShell } from '../../src/ui/components/SiteShell';
import { ArticleIndexPage } from '../../src/ui/articles/ArticleIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata } from '../root';
import { loadVerifiedRelease, recordsForCollection } from '../release.server';

const [readingCss, articleCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-article.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${articleCss}` };
export async function loader() {
  return { records: recordsForCollection(await loadVerifiedRelease(), 'articles') };
}
export function ArticlesIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/articles/" description="다 쓴 에세이와 조사." title="글 · beyondwin" /><SiteShell mode="reading" currentSection="articles"><ArticleIndexPage records={data.records} /></SiteShell></>;
}
export default function ArticlesIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <ArticlesIndexPresentation data={loaderData} />; }
