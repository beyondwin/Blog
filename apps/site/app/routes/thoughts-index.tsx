import { SiteShell } from '../../src/ui/components/SiteShell';
import { ThoughtIndexPage } from '../../src/ui/thoughts/ThoughtIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata } from '../root';
import { loadVerifiedRelease, recordsForCollection } from '../release.server';

const [routeReadingCss, readingCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/reading.css?inline').then((module) => module.default),
]) : ['', ''];

export const handle: RouteCriticalCssHandle = { criticalCss: `${routeReadingCss}${readingCss}` };

export async function loader() {
  const release = await loadVerifiedRelease();
  return {
    records: recordsForCollection(release, 'thoughts'),
    assets: release.manifest.assets,
  };
}

export function ThoughtsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <DocumentMetadata canonical="/thoughts/" description="읽고 남은 생각." title="생각 · FORM & THOUGHT" />
      <SiteShell mode="reading" currentSection={null}>
        <ThoughtIndexPage records={data.records} assets={new Map(Object.entries(data.assets))} />
      </SiteShell>
    </>
  );
}

export default function ThoughtsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <ThoughtsIndexPresentation data={loaderData} />;
}
