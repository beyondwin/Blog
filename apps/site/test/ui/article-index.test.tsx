import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { ArticleIndexPage, browserArticleTopic } from '../../src/ui/articles/ArticleIndexPage';

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

const ARTICLE_IDS = [
  'agents-md-vs-agent-skills-evidence', 'ai-design-references', 'andrej-karpathy-skills-analysis',
  'aws-static-frontend-serverless-bff', 'codex-ui-mockup-workflow', 'context-refinement-system-design',
  'graphify-code-knowledge-graph-deep-dive', 'hermes-agent-persistent-worker-runtime',
  'karpathy-delete-everything-keep-graph', 'lazycodex-agent-harness-analysis', 'oh-my-pi-deep-review',
  'open-design-repo-analysis', 'pgvector-hybrid-search', 'ponytail-agent-minimalism-analysis',
  'postgresql-bm25-pg-search', 'shared-ai-conversation-evidence-boundaries',
  'uncle-bob-ai-code-review-evidence',
] as const;

function article(id: string, index: number): ArticleRecord {
  return {
    collection: 'articles', id, href: `/articles/${id}/`, title: `제목 ${id}`,
    description: `${id} 설명.`, createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: `2026-08-${String(29 - index).padStart(2, '0')}T00:00:00.000Z`,
    tags: index % 2 === 0 ? ['source-grounded'] : [], media: [], relationships: [],
    memoryLinks: [], bodyHtml: '<p><strong>실제 판단.</strong></p>',
    ...(id === 'graphify-code-knowledge-graph-deep-dive' ? { featuredMedia: 'editorial-hero' } : {}),
  } as ArticleRecord;
}

const articleAsset = {
  id: 'editorial-hero', collection: 'articles', recordId: 'graphify-code-knowledge-graph-deep-dive',
  alt: '높이가 다른 콘크리트 구조물 사이의 검은 다리', width: 1536, height: 1024,
  sources: [{ type: 'image/avif', candidates: [{ src: '/assets/content/articles/graphify/editorial-hero-1536w.avif', width: 1536, height: 1024, checksum: `sha256:${'a'.repeat(64)}` }] }],
  fallback: { src: '/assets/content/articles/graphify/editorial-hero.png', candidates: [{ src: '/assets/content/articles/graphify/editorial-hero.png', width: 1536, height: 1024, checksum: `sha256:${'b'.repeat(64)}` }] },
  provenanceUrl: '/articles/graphify-code-knowledge-graph-deep-dive/', sourceChecksum: `sha256:${'c'.repeat(64)}`,
} as PublicReleaseManifest['assets'][string];

describe('article editorial ledger', () => {
  it('derives the selected topic from the static export query string in the browser', () => {
    expect(browserArticleTopic('전체', '?topic=%EB%8D%B0%EC%9D%B4%ED%84%B0')).toBe('데이터');
    expect(browserArticleTopic('데이터', '?topic=unknown')).toBe('전체');
  });

  it('renders all 17 classified articles once, without pagination or public subtype labels', () => {
    const html = renderToStaticMarkup(createElement(ArticleIndexPage, {
      records: ARTICLE_IDS.map(article), selectedTopic: '전체',
      assets: new Map([['articles/graphify-code-knowledge-graph-deep-dive/editorial-hero', articleAsset]]),
    }));

    expect(html).toContain('<h1>아티클</h1>');
    expect(html.match(/class="editorial-list-row(?:\s|"|--)/gu)).toHaveLength(17);
    for (const id of ARTICLE_IDS) expect(html).toContain(`href="/articles/${id}/"`);
    expect(html).not.toMatch(/pagination|다음 페이지|조사 · 근거|>에세이</u);
    expect(html.match(/fetchPriority="high"/gu)).toHaveLength(1);
    expect(html).not.toContain('placeholder');
  });

  it('uses six canonical GET filter URLs and marks the selected topic', () => {
    const html = renderToStaticMarkup(createElement(ArticleIndexPage, {
      records: ARTICLE_IDS.map(article), selectedTopic: '데이터', assets: new Map(),
    }));

    const topicFilter = html.match(/<nav class="article-topic-filter" aria-label="아티클 주제">([\s\S]*?)<\/nav>/u)?.[1];
    expect(topicFilter).toBeDefined();
    expect(topicFilter).toMatch(/<a href="\/articles\/">전체<\/a>/u);
    for (const topic of ['에이전트', '디자인', '데이터', '아키텍처', '검증']) {
      expect(topicFilter).toContain(`<a href="/articles/?topic=${encodeURIComponent(topic)}"`);
      expect(topicFilter).toContain(`>${topic}</a>`);
    }
    expect(topicFilter).not.toContain('<button');
    expect(topicFilter?.match(/<a /gu)).toHaveLength(6);
    expect(html).toMatch(/href="\/articles\/\?topic=%EB%8D%B0%EC%9D%B4%ED%84%B0" aria-current="page"/u);
    expect(html.match(/class="editorial-list-row(?:\s|"|--)/gu)).toHaveLength(3);
  });

  it('fails closed when a public article is not in the exhaustive topic map', () => {
    expect(() => renderToStaticMarkup(createElement(ArticleIndexPage, {
      records: [article('unclassified-public-article', 0)], selectedTopic: '전체', assets: new Map(),
    }))).toThrow(/unclassified public article/u);
  });
});
