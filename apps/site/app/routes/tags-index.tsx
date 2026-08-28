import { SiteShell } from '../../src/ui/components/SiteShell';
import { TagsPage } from '../../src/ui/tags/TagsPage';
import { type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { exactPublicTags, loadVerifiedRelease } from '../release.server';

const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export async function loader() { return { tags: exactPublicTags(await loadVerifiedRelease()) }; }
export function TagsIndexPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return <><DocumentMetadata canonical="/tags/" description="찾기로 이어진 단어들." title={publicMetadataTitle()} /><SiteShell mode="reading" currentSection="search"><TagsPage tags={data.tags} /></SiteShell></>;
}
export default function TagsIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <TagsIndexPresentation data={loaderData} />; }
