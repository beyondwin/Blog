import { type RouteCriticalCssHandle } from '../root';
import { SecondaryIndexPresentation } from './secondary-shared';
import { loadSecondaryIndex } from './secondary-shared.server';
const [readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([import('../../src/ui/styles/route-reading.css?inline').then((m) => m.default), import('../../src/ui/styles/route-collections.css?inline').then((m) => m.default)]) : ['', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${readingCss}${collectionsCss}` };
export function loader() { return loadSecondaryIndex('travel'); }
export default function TravelIndexRoute({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) { return <SecondaryIndexPresentation collection="travel" data={loaderData} />; }
