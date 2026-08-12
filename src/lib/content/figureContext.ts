export interface FigureContext {
  collection: 'articles';
  slug: string;
}

const articleRoute = /^\/articles\/([a-z0-9][a-z0-9-]*)\/?$/;

export function resolveFigureContext(pathname: string): FigureContext {
  const match = pathname.match(articleRoute);
  if (!match) throw new Error(`${pathname}: Figure requires a canonical content detail route`);
  return { collection: 'articles', slug: match[1] };
}
