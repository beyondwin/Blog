import { SiteShell } from '../../src/ui/components/SiteShell';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, recordsForCollection } from '../release.server';

const [indexCss, readingCss, reviewCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-index.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-review.css?inline').then((module) => module.default),
]) : ['', '', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${indexCss}${readingCss}${reviewCss}` };
export async function loader() {
  const release = await loadVerifiedRelease();
  return {
    records: recordsForCollection(release, 'reviews'),
    assets: release.manifest.assets,
  };
}
export function ReviewsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/reviews/" description="읽고 남은 판단." title={publicMetadataTitle('책')} /><SiteShell currentSection="reviews"><BookIndexPage records={data.records} assets={new Map(Object.entries(data.assets))} /></SiteShell></>;
}
export default function ReviewsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <ReviewsIndexPresentation data={loaderData} />; }
