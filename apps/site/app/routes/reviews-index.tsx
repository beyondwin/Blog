import { SiteShell } from '../../src/ui/components/SiteShell';
import { BookIndexPage } from '../../src/ui/reviews/BookIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { listingAssets, listingRecord, loadVerifiedRelease, recordsForCollection } from '../release.server';

const indexCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-index.css?inline').then((module) => module.default)
  : '';
export const handle: RouteCriticalCssHandle = { criticalCss: indexCss };
export async function loader() {
  const release = await loadVerifiedRelease();
  const records = recordsForCollection(release, 'reviews');
  return {
    records: records.map(listingRecord),
    assets: listingAssets(release, records),
  };
}
export function ReviewsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/reviews/" description="읽고 난 뒤에도 남은 한 문장과 판단." title={publicMetadataTitle('서평')} /><SiteShell currentSection="reviews"><BookIndexPage records={data.records} assets={new Map(Object.entries(data.assets))} /></SiteShell></>;
}
export default function ReviewsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <ReviewsIndexPresentation data={loaderData} />; }
