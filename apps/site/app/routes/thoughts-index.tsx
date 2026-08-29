import { SiteShell } from '../../src/ui/components/SiteShell';
import { ThoughtIndexPage } from '../../src/ui/thoughts/ThoughtIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { listingAssets, listingRecord, loadVerifiedRelease, recordsForCollection } from '../release.server';

const thoughtCss = import.meta.env.SSR
  ? await import('../../src/ui/styles/route-thought.css?inline').then((module) => module.default)
  : '';

export const handle: RouteCriticalCssHandle = { criticalCss: thoughtCss };

export async function loader() {
  const release = await loadVerifiedRelease();
  const records = recordsForCollection(release, 'thoughts');
  return {
    records: records.map(listingRecord),
    assets: listingAssets(release, records),
  };
}

export function ThoughtsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <DocumentMetadata canonical="/thoughts/" description="읽고 남은 생각." title={publicMetadataTitle('생각')} />
      <SiteShell currentSection="thoughts">
        <ThoughtIndexPage records={data.records} assets={new Map(Object.entries(data.assets))} />
      </SiteShell>
    </>
  );
}

export default function ThoughtsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <ThoughtsIndexPresentation data={loaderData} />;
}
