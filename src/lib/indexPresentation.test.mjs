import { describe, expect, it } from 'vitest';

import { buildTagIndex, getEmptyLaneCopy } from './indexPresentation.ts';

describe('literary index presentation', () => {
  it('counts actual tag occurrences and sorts by count then label', () => {
    const result = buildTagIndex([
      ['testing', 'ai'],
      ['ai', 'source-grounded'],
      ['testing'],
    ]);

    expect(result).toEqual([
      { label: 'ai', count: 2 },
      { label: 'testing', count: 2 },
      { label: 'source-grounded', count: 1 },
    ]);
  });

  it('keeps empty lanes factual and visually distinct', () => {
    expect(getEmptyLaneCopy('travel')).toEqual({
      marker: 'A.',
      title: '장면',
      fact: '아직 공개한 장면이 없습니다.',
      condition: '사진과 장소가 함께 남을 때 이곳에 놓입니다.',
      href: '/tags/',
      linkLabel: '색인으로 돌아가기',
    });
    expect(getEmptyLaneCopy('ideas').title).toBe('생각 노트');
    expect(getEmptyLaneCopy('analysis').title).toBe('분석');
  });
});
