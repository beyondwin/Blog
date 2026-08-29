import { SiteShell } from '../../src/ui/components/SiteShell';
import { TagsPage } from '../../src/ui/tags/TagsPage';
import { absoluteCanonical, type RouteCriticalCssHandle, DocumentMetadata, publicMetadataTitle } from '../root';
import { exactPublicTags, loadVerifiedRelease, recordsForTag } from '../release.server';

const [indexCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-index.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${indexCss}${collectionsCss}` };
export async function loader({ params }: { params: { tag?: string } }) {
  const release = await loadVerifiedRelease();
  const tag = params.tag;
  const tags = exactPublicTags(release);
  if (!tag || !tags.some((item) => item.label === tag)) throw new Response('Not Found', { status: 404 });
  return { records: recordsForTag(release, tag), tag };
}
export function meta({ data }: { data?: Awaited<ReturnType<typeof loader>> }) { return data ? [{ title: publicMetadataTitle(data.tag) }, { name: 'description', content: `${data.tag}로 이어진 글과 책.` }, { tagName: 'link', rel: 'canonical', href: absoluteCanonical(`/tags/${encodeURIComponent(data.tag)}/`) }] : []; }
export function TagPresentation({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  const canonical = `/tags/${encodeURIComponent(data.tag)}/`;
  return <><DocumentMetadata canonical={canonical} description={`${data.tag}로 이어진 글과 책.`} title={publicMetadataTitle(data.tag)} /><SiteShell currentSection="search"><TagsPage records={data.records} selectedTag={data.tag} /></SiteShell></>;
}
export default function TagRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <TagPresentation data={loaderData} />; }
