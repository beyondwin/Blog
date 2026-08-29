import { describe, expect, it } from 'vitest';
import { parseOrigin } from '../../src/ui/navigation/origin';

describe('parseOrigin', () => {
  it.each([
    [{ kind: 'articles', anchorId: 'article-2' }, { kind: 'articles', anchorId: 'article-2' }],
    [{ kind: 'reviews', anchorId: 'review_2' }, { kind: 'reviews', anchorId: 'review_2' }],
    [{ kind: 'search', query: ' AI 시대 ', anchorId: 'result-2' }, { kind: 'search', query: 'AI 시대', anchorId: 'result-2' }],
    [{ kind: 'analysis', anchorId: 'analysis-2' }, { kind: 'analysis', anchorId: 'analysis-2' }],
    [{ kind: 'ideas' }, { kind: 'ideas' }],
    [{ kind: 'travel', anchorId: 'seoul-1' }, { kind: 'travel', anchorId: 'seoul-1' }],
    [{ kind: 'tags', anchorId: 'typescript' }, { kind: 'tags', anchorId: 'typescript' }],
  ])('parses an allowlisted origin without retaining arbitrary fields', (input, expected) => {
    expect(parseOrigin({ ...input, returnUrl: 'https://evil.test', label: 'injected' })).toEqual(expected);
  });

  it('bounds search queries by Unicode characters and rejects controls or empty text', () => {
    expect(parseOrigin({ kind: 'search', query: '😀'.repeat(120), anchorId: 'result-1' })).not.toBeNull();
    expect(parseOrigin({ kind: 'search', query: '😀'.repeat(121), anchorId: 'result-1' })).toBeNull();
    expect(parseOrigin({ kind: 'search', query: ' '.repeat(10), anchorId: 'result-1' })).toBeNull();
    expect(parseOrigin({ kind: 'search', query: 'safe\nquery', anchorId: 'result-1' })).toBeNull();
    expect(parseOrigin({ kind: 'search', query: 'safe​query', anchorId: 'result-1' })).toBeNull();
  });

  it('uses a conservative 80-character ASCII identifier grammar', () => {
    expect(parseOrigin({ kind: 'articles', anchorId: `a${'b'.repeat(78)}z` })).not.toBeNull();
    for (const anchorId of [
      '',
      'a'.repeat(81),
      '..',
      '../article',
      'article/2',
      'article\\2',
      'article%2f2',
      'article?2',
      'article#2',
      '-article',
      'article_',
      'article\u0000x',
      'аrticle',
    ]) {
      expect(parseOrigin({ kind: 'articles', anchorId }), anchorId).toBeNull();
    }
  });

  it('rejects missing required fields and drops an invalid optional secondary anchor', () => {
    expect(parseOrigin({ kind: 'scene', focusId: 'retired-focus' })).toBeNull();
    expect(parseOrigin({ kind: 'articles' })).toBeNull();
    expect(parseOrigin({ kind: 'reviews', anchorId: 1 })).toBeNull();
    expect(parseOrigin({ kind: 'search', query: 'AI' })).toBeNull();
    expect(parseOrigin({ kind: 'analysis', anchorId: '../unsafe' })).toEqual({ kind: 'analysis' });
    expect(parseOrigin({ kind: 'unknown', anchorId: 'safe' })).toBeNull();
    expect(parseOrigin(null)).toBeNull();
  });
});
