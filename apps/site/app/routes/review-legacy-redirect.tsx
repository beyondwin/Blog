import { redirect } from 'react-router';
import type { RouteCriticalCssHandle } from '../root';

const readingCss = import.meta.env.SSR ? await import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default) : '';
export const handle: RouteCriticalCssHandle = { criticalCss: readingCss };
export function loader() { return redirect('/reviews/doing-good-better/'); }
export default function LegacyReviewRedirect() {
  return <main><p>책 기록으로 이동합니다. <a href="/reviews/doing-good-better/">냉정한 이타주의자 보기</a></p></main>;
}
