import type { CandidateRelease } from '../release.server';
import { loadVerifiedRelease } from '../release.server';
import { metadataForRecord, type RouteCriticalCssHandle } from '../root';
import { SecondaryDetailPresentation } from './secondary-shared';
import { loadSecondaryDetail } from './secondary-shared.server';

const [detailCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([
  import('../../src/ui/styles/route-detail.css?inline').then((module) => module.default),
  import('../../src/ui/styles/route-collections.css?inline').then((module) => module.default),
]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${detailCss}${collectionsCss}` };
export function loadDetail(release: CandidateRelease, slug: string | undefined) { return loadSecondaryDetail(release, 'ideas', slug); }
export async function loader({ params }: { params: { slug?: string } }) { return loadDetail(await loadVerifiedRelease(), params.slug); }
export function meta({ data }: { data?: ReturnType<typeof loadDetail> }) { return data ? metadataForRecord(data.record) : []; }
export default function IdeaRoute({ loaderData }: { loaderData: ReturnType<typeof loadDetail> }) { return <SecondaryDetailPresentation data={loaderData} />; }
