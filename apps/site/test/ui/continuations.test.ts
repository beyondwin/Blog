import { parsePublicRecord, type PublicRecord } from '@beyondwin/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContinueReading } from '../../src/ui/reading/ContinueReading';
import { selectContinuations } from '../../src/ui/reading/select-continuations';

const base = {
  description: '설명',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  tags: [],
  media: [],
  relationships: [],
  memoryLinks: [],
  bodyHtml: '<p>본문</p>',
};

function article(id: string, overrides: Record<string, unknown> = {}): PublicRecord {
  return {
    ...base,
    collection: 'articles',
    id,
    href: `/articles/${id}/`,
    title: `아티클 ${id}`,
    includeInAnswers: false,
    ...overrides,
  } satisfies PublicRecord;
}

function review(id: string, overrides: Record<string, unknown> = {}): PublicRecord {
  return {
    ...base,
    collection: 'reviews',
    id,
    href: `/reviews/${id}/`,
    title: `서평 ${id}`,
    itemType: 'book',
    itemTitle: `서평 ${id}`,
    authors: ['저자'],
    readEditionVerified: true,
    includeInAnswers: false,
    ...overrides,
  } satisfies PublicRecord;
}

function memory(id: string, overrides: Record<string, unknown> = {}): PublicRecord {
  return {
    ...base,
    collection: 'memory',
    id,
    href: `/memory/${id}/`,
    title: `기억 ${id}`,
    claimKo: `주장 ${id}`,
    body: '본문',
    memoryType: 'reflective',
    origin: 'author',
    topics: [],
    theses: [],
    sources: [],
    companions: [],
    ...overrides,
  } satisfies PublicRecord;
}

describe('selectContinuations', () => {
  it('keeps a public thought relationship as a thought continuation', () => {
    const current = article('current', {
      relationships: [{ target: 'thoughts/reflection', relation: 'extends', reason: '생각을 이어 간다.' }],
    });
    const thought = parsePublicRecord({
      ...base,
      collection: 'thoughts',
      id: 'reflection',
      href: '/thoughts/reflection/',
      title: '아티클 reflection',
    });

    expect(selectContinuations(current, {
      'articles/current': current,
      'thoughts/reflection': thought,
    })).toEqual([
      { href: '/thoughts/reflection/', title: '아티클 reflection', reason: '생각을 이어 간다.', kind: 'thought' },
    ]);
  });

  it('keeps authored order before exact public-memory links and derives truthful target kinds', () => {
    const current = article('current', {
      relationships: [
        { target: 'reviews/first', relation: 'extends', reason: '첫 번째 판단을 이어 간다.' },
        { target: 'articles/second', relation: 'supports', reason: '근거를 더 자세히 설명한다.' },
      ],
      memoryLinks: [
        { slug: 'third', claimKo: '판단 기준을 기억으로 연결한다.', href: '/memory/third/', kind: 'direct' },
      ],
    });
    const index = {
      'articles/current': current,
      'reviews/first': review('first'),
      'articles/second': article('second'),
      'memory/third': memory('third'),
    };

    expect(selectContinuations(current, index)).toEqual([
      { href: '/reviews/first/', title: '서평 first', reason: '첫 번째 판단을 이어 간다.', kind: 'review' },
      { href: '/articles/second/', title: '아티클 second', reason: '근거를 더 자세히 설명한다.', kind: 'article' },
      { href: '/memory/third/', title: '기억 third', reason: '판단 기준을 기억으로 연결한다.', kind: 'memory' },
    ]);
  });

  it('omits self, non-public targets, blank reasons, inexact or derived memory links, and duplicate targets', () => {
    const current = article('current', {
      relationships: [
        { target: 'articles/current', relation: 'related', reason: '자기 자신' },
        { target: 'articles/missing', relation: 'related', reason: '공개되지 않음' },
        { target: 'reviews/blank', relation: 'related', reason: '   ' },
        { target: 'reviews/kept', relation: 'extends', reason: '유효한 관계다.' },
        { target: 'reviews/kept', relation: 'related', reason: '중복 관계다.' },
      ],
      memoryLinks: [
        { slug: 'kept-memory', claimKo: ' ', href: '/memory/kept-memory/', kind: 'direct' },
        { slug: 'wrong-href', claimKo: 'href가 일치하지 않는다.', href: '/memory/other/', kind: 'direct' },
        { slug: 'related-memory', claimKo: '태그로만 연관된 기억이다.', href: '/memory/related-memory/', kind: 'related' },
        { slug: 'kept', claimKo: 'authored target과 중복된다.', href: '/reviews/kept/', kind: 'direct' },
      ],
    });
    const index = {
      'articles/current': current,
      'reviews/blank': review('blank'),
      'reviews/kept': review('kept'),
      'memory/kept-memory': memory('kept-memory'),
      'memory/wrong-href': memory('wrong-href'),
      'memory/related-memory': memory('related-memory'),
    };

    expect(selectContinuations(current, index)).toEqual([
      { href: '/reviews/kept/', title: '서평 kept', reason: '유효한 관계다.', kind: 'review' },
    ]);
  });

  it('returns fewer than three naturally, returns empty without fill, and caps authored input at three', () => {
    const empty = article('empty');
    expect(selectContinuations(empty, { 'articles/empty': empty })).toEqual([]);

    const current = article('current', {
      relationships: ['one', 'two', 'three', 'four'].map((id) => ({
        target: `articles/${id}`,
        relation: 'related',
        reason: `이유 ${id}`,
      })),
    });
    const index = Object.fromEntries([
      ['articles/current', current],
      ...['one', 'two', 'three', 'four'].map((id) => [`articles/${id}`, article(id)] as const),
    ]);
    expect(selectContinuations(current, index)).toEqual([
      { href: '/articles/one/', title: '아티클 one', reason: '이유 one', kind: 'article' },
      { href: '/articles/two/', title: '아티클 two', reason: '이유 two', kind: 'article' },
      { href: '/articles/three/', title: '아티클 three', reason: '이유 three', kind: 'article' },
    ]);
  });

  it('renders clean continuation anchors and a separate explicit collection link', () => {
    const html = renderToStaticMarkup(createElement(ContinueReading, {
      items: [
        { href: '/reviews/first/', title: '첫 기록', reason: '사람이 쓴 이유', kind: 'review' },
        { href: '/articles/second/', title: '두 번째 기록', reason: '기술적 근거', kind: 'article' },
      ],
      collectionHref: '/articles/',
      collectionLabel: '아티클 전체 보기',
    }));

    expect(html).toContain('<h2 id="continue-reading-title">이어서 읽기</h2>');
    expect(html).toContain('href="/reviews/first/"');
    expect(html).toContain('사람이 쓴 이유');
    expect(html).toContain('<span>서평</span>');
    expect(html).toContain('<span>아티클</span>');
    expect(html).not.toContain('<span>책</span>');
    expect(html).not.toContain('<span>글</span>');
    expect(html).toContain('<a class="continue-reading__collection" href="/articles/">아티클 전체 보기</a>');
    expect(html).not.toContain('__bw_');
  });
});
