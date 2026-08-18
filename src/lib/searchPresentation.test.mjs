import { describe, expect, it } from 'vitest';

import {
  buildSearchInventory,
  buildSearchMatches,
  matchLiterarySearchFields,
  summarizeSearchMatches,
  topicRecordHref,
} from './searchPresentation.ts';

const records = [
  {
    id: 'article:one',
    kind: 'writing',
    title: '검증 가능한 기술 문서',
    description: '구현 절차를 실제 코드로 확인합니다.',
    topics: ['testing'],
    href: '/articles/one/',
    date: '2026.07.26',
  },
  {
    id: 'review:one',
    kind: 'book',
    title: '파리대왕',
    description: '책을 덮은 뒤 남은 판단입니다.',
    topics: ['문학'],
    href: '/reviews/one/',
    date: '2026.06.02',
  },
  {
    id: 'memory:one',
    kind: 'sentence',
    title: '검증 습관을 강제하는 데 있다.',
    description: '남는 문장',
    topics: ['ai-workflow'],
    href: '/memory/one/',
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

describe('search presentation', () => {
  it('uses the same browser-safe field matcher for query filtering', () => {
    expect(matchLiterarySearchFields({
      title: '팩트풀니스',
      description: '데이터로 세상을 읽는 법',
      topics: ['book', 'risk'],
    }, '세상')).toBe('description');
    expect(matchLiterarySearchFields({
      title: '팩트풀니스',
      description: '데이터로 세상을 읽는 법',
      topics: ['book', 'risk'],
    }, 'RISK')).toBe('topic');
    expect(matchLiterarySearchFields({ title: '팩트풀니스', description: '', topics: [] }, '')).toBeNull();
  });
  it('groups real matches and explains the first matching field', () => {
    const matches = buildSearchMatches(records, '검증');

    expect(matches.map((match) => match.record.id)).toEqual([
      'article:one',
      'memory:one',
    ]);
    expect(matches[0].matchedField).toBe('title');
    expect(matches[0].matchReason).toBe('제목에서 “검증” 일치');
    expect(matches[1].matchedField).toBe('title');
    expect(matches[1].matchReason).toBe('문장에서 “검증” 일치');
  });

  it('uses authored-result language for book records', () => {
    const matches = buildSearchMatches(records, '파리대왕');

    expect(matches).toHaveLength(1);
    expect(matches[0].record.kind).toBe('book');
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
    expect(summary).toEqual({ total: 2, writing: 1, book: 0, sentence: 0, topic: 1 });
  });

  it('returns an honest empty result for a missing sentence', () => {
    expect(buildSearchMatches(records, '없는 문장')).toEqual([]);
  });

  it('treats an empty query as the public inventory', () => {
    expect(buildSearchInventory(records).map((record) => record.id)).toEqual(
      records.map((record) => record.id),
    );
  });

  it('sends content tags to the tag page and memory-only topics to search', () => {
    expect(topicRecordHref('testing', ['testing', '문학'])).toBe('/tags/testing/');
    expect(topicRecordHref('ai-workflow', ['testing', '문학'])).toBe('/search/?q=ai-workflow');
    expect(topicRecordHref('문장 습관', [])).toBe(`/search/?q=${encodeURIComponent('문장 습관')}`);
  });
});
