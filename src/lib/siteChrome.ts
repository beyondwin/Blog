export const publicNav = [
  { href: '/articles/', label: '글' },
  { href: '/reviews/', label: '책' },
  { href: '/memory/', label: '문장' },
  { href: '/search/', label: '찾기' },
] as const;

export const bannedPublicNouns = [
  '기록', '책장', '기억', '색인', '소개', '노트 목록', '아카이브',
  'Articles', 'Analysis', 'Reviews', 'Ideas', 'Memory', 'Map',
] as const;

export const memoryIndexHref = '/memory/';

export function memoryThoughtHref(slug: string): string {
  return `/memory/${slug}/`;
}
