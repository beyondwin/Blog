import { SiteShell } from '../../src/ui/components/SiteShell';
import { CollectionPage } from '../../src/ui/collections/CollectionPage';
import { type RouteCriticalCssHandle, DocumentMetadata } from '../root';
import { loadVerifiedRelease, summariesForCollection } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { records: summariesForCollection(await loadVerifiedRelease(), 'articles') }; }
export function ArticlesIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/articles/" description="다 쓴 에세이와 조사." title="글 · beyondwin" /><SiteShell mode="reading" currentSection="articles"><CollectionPage collection="articles" title="글" description="다 쓴 에세이와 조사." records={data.records} emptyMessage="아직 공개한 글이 없습니다." /></SiteShell></>;
}
export default function ArticlesIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <ArticlesIndexPresentation data={loaderData} />; }
