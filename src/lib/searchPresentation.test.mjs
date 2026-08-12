import { describe, expect, it } from 'vitest';

import { buildSearchMatches, summarizeSearchMatches } from './searchPresentation.ts';

const records = [
  {
    id: 'article:one',
    kind: 'technical',
    title: '검증 가능한 기술 문서',
    description: '구현 절차를 실제 코드로 확인합니다.',
    topics: ['testing'],
    href: '/articles/one/',
    date: '2026.07.26',
  },
  {
    id: 'review:one',
    kind: 'reading',
    title: '파리대왕',
    description: '책을 덮은 뒤 남은 판단입니다.',
    topics: ['문학'],
    href: '/reviews/one/',
    date: '2026.06.02',
  },
  {
    id: 'memory:one',
    kind: 'memory',
    title: '검증 습관을 강제하는 데 있다.',
    description: '공개 기억 문장',
    topics: ['ai-workflow'],
    href: '/memory/?thought=one',
  },
  {
    id: 'topic:testing',
    kind: 'topic',
    title: 'testing',
    description: '주제명',
    topics: ['testing'],
    href: '/tags/testing/',
  },
];

describe('literary search presentation', () => {
  it('groups real matches and explains the first matching field', () => {
    const matches = buildSearchMatches(records, '검증');

    expect(matches.map((match) => match.record.id)).toEqual([
      'article:one',
      'memory:one',
    ]);
    expect(matches[0].matchedField).toBe('title');
    expect(matches[0].matchReason).toBe('제목에서 “검증” 일치');
    expect(matches[1].matchedField).toBe('title');
  });

  it('uses authored-result language for reading records', () => {
    const matches = buildSearchMatches(records, '파리대왕');

    expect(matches).toHaveLength(1);
    expect(matches[0].record.kind).toBe('reading');
    expect(matches[0].matchReason).toBe('책 제목에서 “파리대왕” 일치');
  });

  it('matches topics without fabricating a denser result set', () => {
    const matches = buildSearchMatches(records, 'testing');
    const summary = summarizeSearchMatches(matches);

    expect(matches.map((match) => match.record.id)).toEqual([
      'article:one',
      'topic:testing',
    ]);
    expect(matches[0].matchedField).toBe('topic');
    expect(matches[0].matchReason).toBe('주제에서 “testing” 일치');
    expect(summary).toEqual({ total: 2, technical: 1, reading: 0, memory: 0, topic: 1 });
  });

  it('returns an honest empty result for a missing sentence', () => {
    expect(buildSearchMatches(records, '없는 문장')).toEqual([]);
  });
});
