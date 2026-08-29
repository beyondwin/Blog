import { redirect } from 'react-router';
import { MemoryMapPage } from '../../src/ui/memory/MemoryMapPage';
import type { RouteCriticalCssHandle } from '../root';

const memoryCss = import.meta.env.SSR ? await import('../../src/ui/styles/route-memory.css?inline').then((module) => module.default) : '';
export const handle: RouteCriticalCssHandle = { criticalCss: memoryCss };
export function loader() { return redirect('/memory/'); }
export default MemoryMapPage;
