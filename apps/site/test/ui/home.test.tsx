import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePublicRecord, type PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { HomePresentation } from '../../app/routes/home';

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ThoughtRecord = Extract<PublicRecord, { collection: 'thoughts' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

function article(id: string, overrides: Record<string, unknown> = {}): ArticleRecord {
  return {
    collection: 'articles', id, href: `/articles/${id}/`, title: `아티클 ${id}`,
    description: `${id} 설명`, createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z', tags: [], media: [], relationships: [],
    memoryLinks: [], bodyHtml: '<p>본문</p>', includeInAnswers: false, ...overrides,
  } as ArticleRecord;
}

function review(): ReviewRecord {
  const parsed = parsePublicRecord({
    collection: 'reviews', id: 'black-swan', href: '/reviews/black-swan/', title: '블랙스완',
    description: '불확실성을 피하지 않고 다루는 법을 남긴 책.', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-05-27T00:00:00.000Z', tags: [], media: [], relationships: [],
    memoryLinks: [], bodyHtml: '<p>본문</p>', itemType: 'book', itemTitle: '블랙 스완', authors: ['나심 니콜라스 탈레브'],
    readEditionVerified: true, verdict: '불확실성을 몸으로 읽는다.',
  });
  if (parsed.collection !== 'reviews') throw new Error('expected review fixture');
  return parsed;
}

function thought(): ThoughtRecord {
  return {
    collection: 'thoughts', id: 'why-i-read-in-the-ai-era',
    href: '/thoughts/why-i-read-in-the-ai-era/', title: 'AI 시대에, 나는 왜 책을 읽는가',
    description: '답을 쉽게 믿지 않기 위해 읽는다.', createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z', tags: ['reading'], media: [], relationships: [],
    memoryLinks: [], bodyHtml: '<p>본문</p>', featuredMedia: 'editorial-reading', includeInAnswers: false,
  } as ThoughtRecord;
}

function asset(id: string, src: string): ReleaseAsset {
  return {
    id, collection: src.includes('/thoughts/') ? 'thoughts' : 'articles',
    recordId: src.includes('/thoughts/') ? 'why-i-read-in-the-ai-era' : 'graphify-code-knowledge-graph-deep-dive',
    alt: `${id} 실제 승인 이미지`, caption: `${id} 캡션`, credit: 'beyondwin test',
    verifiedAt: '2026-08-29', rightsNote: 'approved test asset', width: 1536, height: 1024,
    sources: [{ type: 'image/avif', candidates: [{ src: src.replace('.png', '-1536w.avif'), width: 1536, height: 1024, checksum: `sha256:${'a'.repeat(64)}` }] }],
    fallback: { src, format: 'png', candidates: [{ src, width: 1536, height: 1024, checksum: `sha256:${'b'.repeat(64)}` }] },
    provenanceUrl: '/articles/graphify-code-knowledge-graph-deep-dive/',
    sourceChecksum: `sha256:${'c'.repeat(64)}`,
  } as ReleaseAsset;
}

describe('FORM & THOUGHT home', () => {
  it('renders one fixed H01 hero and exactly one real pick per primary content lane', () => {
    const hero = article('graphify-code-knowledge-graph-deep-dive', {
      title: 'Graphify는 코드 이해를 정말 더 빠르게 만드는가?',
      description: '구조 지도와 실제 경로 사이의 간극을 검토한다.', featuredMedia: 'editorial-hero',
    });
    const articlePick = article('ai-design-references', { title: 'AI 디자인 도구를 보는 기준' });
    const reviewPick = review();
    const thoughtPick = thought();
    const heroAsset = asset('editorial-home-hero', '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/editorial-home-hero.png');
    const thoughtAsset = asset('editorial-reading', '/assets/content/thoughts/why-i-read-in-the-ai-era/editorial-reading.png');
    const legacyAsset = asset('legacy', '/assets/content/articles/graphify-code-knowledge-graph-deep-dive/legacy.png');
    const html = renderToStaticMarkup(createElement(HomePresentation, {
      data: {
        hero, picks: { review: reviewPick, article: articlePick, thought: thoughtPick },
        assets: { hero: heroAsset, thought: thoughtAsset, judgment: legacyAsset, lead: legacyAsset, shared: legacyAsset },
        article: hero, review: reviewPick,
      } as never,
    }));

    expect(html).toContain('class="form-home__hero"');
    expect(html).toContain('editorial-home-hero.png');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('이 글 읽기');
    expect(html).not.toContain('최근');
    expect(html.match(/class="form-home__pick(?:\s|"|--)/gu)).toHaveLength(3);
    const heroStart = html.indexOf('class="form-home__hero"');
    const picksStart = html.indexOf('<ol class="form-home__picks"');
    const pickLabels = [...html.matchAll(/class="form-home__pick-label">([^<]+)</gu)]
      .map((match) => match[1]);

    expect(heroStart).toBeGreaterThanOrEqual(0);
    expect(picksStart).toBeGreaterThan(heroStart);
    expect(pickLabels).toEqual(['서평', '아티클', '생각']);
    expect(html).toContain('href="/reviews/black-swan/"');
    expect(html).toContain('href="/articles/ai-design-references/"');
    expect(html).toContain('href="/thoughts/why-i-read-in-the-ai-era/"');
    expect(html).not.toMatch(/public-scene|data-scene-object|focus=|placeholder/iu);
  });
});
