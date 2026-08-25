import { redirect } from 'react-router';
import { MemoryMapPage } from '../../src/ui/memory/MemoryMapPage';
import type { RouteCriticalCssHandle } from '../root';

const readingCss = import.meta.env.SSR ? await import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default) : '';
export const handle: RouteCriticalCssHandle = { criticalCss: readingCss };
export function loader() { return redirect('/memory/'); }
export default MemoryMapPage;
