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

  it('sends empty analysis back to writing, not a fake room', () => {
    const copy = getEmptyLaneCopy('analysis');
    expect(copy.href).toBe('/articles/');
    expect(copy.fact).toContain('없습니다');
    expect(copy.marker).toBeUndefined();
  });

  it('sends every empty lane to writing with one honest sentence', () => {
    for (const lane of ['analysis', 'ideas', 'travel']) {
      const copy = getEmptyLaneCopy(lane);
      expect(copy.href).toBe('/articles/');
      expect(copy.fact).toContain('없습니다');
      expect(copy.marker).toBeUndefined();
      expect(copy.fact).not.toMatch(/색인|기억|기록/);
      expect(JSON.stringify(copy)).not.toMatch(/색인|기억|기록/);
    }
  });
});
