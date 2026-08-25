import { SiteShell } from '../../src/ui/components/SiteShell';
import { CollectionPage } from '../../src/ui/collections/CollectionPage';
import { type RouteCriticalCssHandle, DocumentMetadata } from '../root';
import { loadVerifiedRelease, summariesForCollection } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { records: summariesForCollection(await loadVerifiedRelease(), 'reviews') }; }
export function ReviewsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/reviews/" description="읽고 남은 판단." title="책 · beyondwin" /><SiteShell mode="reading" currentSection="reviews"><CollectionPage collection="reviews" title="책" description="읽고 남은 판단." records={data.records} emptyMessage="아직 공개한 책이 없습니다." /></SiteShell></>;
}
export default function ReviewsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <ReviewsIndexPresentation data={loaderData} />; }
