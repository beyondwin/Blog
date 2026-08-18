export interface TagIndexEntry { label: string; count: number }
export type EmptyLane = 'analysis' | 'ideas' | 'travel';

export function buildTagIndex(tagGroups: string[][]): TagIndexEntry[] {
  const counts = new Map<string, number>();
  for (const tags of tagGroups) {
    for (const tag of new Set(tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => {
    return b.count - a.count || a.label.localeCompare(b.label);
  });
}

export function getEmptyLaneCopy(lane: EmptyLane) {
  if (lane === 'travel') return {
    fact: '아직 공개한 장면이 없습니다. 다 쓴 글은 글에서 읽습니다.',
    href: '/articles/',
    linkLabel: '글',
  };
  if (lane === 'ideas') return {
    fact: '아직 공개한 아이디어가 없습니다. 다 쓴 글은 글에서 읽습니다.',
    href: '/articles/',
    linkLabel: '글',
  };
  return {
    fact: '아직 공개한 출처 분석이 없습니다. 근거를 붙인 기술 글은 글에서 읽습니다.',
    href: '/articles/',
    linkLabel: '글',
  };
}
