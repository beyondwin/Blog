import { SiteShell } from '../../src/ui/components/SiteShell';
import { MemoryIndexPage } from '../../src/ui/memory/MemoryIndexPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, summariesForCollection } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { records: summariesForCollection(await loadVerifiedRelease(), 'memory') }; }
export function MemoryIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/memory/" description="글로 쓰고 난 뒤에도 남는 문장만 여기에 둡니다." title={publicMetadataTitle('문장')} /><SiteShell currentSection={null}><MemoryIndexPage records={data.records} /></SiteShell></>;
}
export default function MemoryIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <MemoryIndexPresentation data={loaderData} />; }
