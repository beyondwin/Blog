import { type RouteCriticalCssHandle } from '../root';
const [routeCss, readingCss, collectionsCss] = import.meta.env.SSR ? await Promise.all([import('../../src/ui/styles/route-reading.css?inline').then((m) => m.default), import('../../src/ui/styles/reading.css?inline').then((m) => m.default), import('../../src/ui/styles/route-collections.css?inline').then((m) => m.default)]) : ['', '', ''];
export const handle: RouteCriticalCssHandle = { criticalCss: `${routeCss}${readingCss}${collectionsCss}` };
