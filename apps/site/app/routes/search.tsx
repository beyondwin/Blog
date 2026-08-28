import { SiteShell } from '../../src/ui/components/SiteShell';
import { SearchPage } from '../../src/ui/search/SearchPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { loadVerifiedRelease, searchInventory } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { inventory: searchInventory(await loadVerifiedRelease()) }; }
export function SearchPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/search/" description="글, 책, 문장을 찾습니다." title={publicMetadataTitle('찾기')} /><SiteShell mode="reading" currentSection="search"><SearchPage inventory={data.inventory} /></SiteShell></>;
}
export default function SearchRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <SearchPresentation data={loaderData} />; }
