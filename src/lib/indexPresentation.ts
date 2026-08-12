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
    marker: 'A.', title: '장면', fact: '아직 공개한 장면이 없습니다.',
    condition: '사진과 장소가 함께 남을 때 이곳에 놓입니다.', href: '/tags/', linkLabel: '색인으로 돌아가기',
  };
  if (lane === 'ideas') return {
    marker: 'B.', title: '생각 노트', fact: '아직 공개한 생각 노트가 없습니다.',
    condition: '검토를 마친 문장만 공개합니다.', href: '/memory/', linkLabel: '기억에서 문장 보기',
  };
  return {
    marker: 'C.', title: '분석', fact: '아직 공개한 분석 기록이 없습니다.',
    condition: '외부 자료를 검토하고 출처를 확인한 기록만 놓입니다.', href: '/articles/', linkLabel: '기록으로 돌아가기',
  };
}
