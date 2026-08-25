import { SiteShell } from '../../src/ui/components/SiteShell';
import { MemoryIndexPage } from '../../src/ui/memory/MemoryIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata } from '../root';
import { loadVerifiedRelease, summariesForCollection } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { records: summariesForCollection(await loadVerifiedRelease(), 'memory') }; }
export function MemoryIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/memory/" description="공개하기로 고른 문장과 그 문장이 나온 근거." title="남는 문장 · beyondwin" /><SiteShell mode="reading" currentSection={null}><MemoryIndexPage records={data.records} /></SiteShell></>;
}
export default function MemoryIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <MemoryIndexPresentation data={loaderData} />; }
