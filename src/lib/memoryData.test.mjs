import { describe, expect, it } from 'vitest';
import {
  buildMemoryLookup,
  emptyMemoryData,
  findArticleMemoryLinks,
  normalizeMemoryData,
  resolveMemorySourceHref,
} from './memoryData.ts';

function makeMemory(overrides = {}) {
  return normalizeMemoryData({
    schemaVersion: 1,
    generatedAt: '2026-06-30T00:00:00.000Z',
    counts: { thoughts: 2, topics: 2, edges: 3, sources: 3 },
    thoughts: [
      {
        slug: 'routing-problem',
        claimKo: '컨텍스트 품질은 라우팅 문제다.',
        claimEn: 'Context quality is a routing problem.',
        memoryType: 'semantic',
        origin: 'kws',
        topics: ['ai-workflow'],
        theses: ['workflow-quality'],
        sources: ['article-source', 'missing-source'],
        body: 'A body.',
        position: { x: 10, y: 20 },
      },
      {
        slug: 'review-gates',
        claimKo: '에이전트 워크플로우에는 리뷰 게이트가 필요하다.',
        claimEn: 'Agent workflows need review gates.',
        memoryType: 'procedural',
        origin: 'kws',
        topics: ['agent-workflows'],
        theses: [],
        sources: ['docs-source'],
        body: 'Another body.',
        position: { x: 30, y: 40 },
      },
    ],
    topics: [
      { id: 'topic:ai-workflow', slug: 'ai-workflow', label: 'ai-workflow', count: 1, position: { x: 1, y: 1 } },
      { id: 'topic:agent-workflows', slug: 'agent-workflows', label: 'agent-workflows', count: 1, position: { x: 2, y: 2 } },
    ],
    sources: [
      {
        id: 'article-source',
        kind: 'article',
        path: 'src/content/articles/context-refinement-system-design.mdx',
        title: 'Context Refinement System 설계 요약',
        count: 1,
      },
      {
        id: 'docs-source',
        kind: 'guide',
        path: 'docs/implementation/memory-second-brain.md',
        title: 'Memory Second Brain Implementation Reference',
        count: 1,
      },
      {
        id: 'external-source',
        kind: 'external',
        url: 'https://example.com/source',
        title: 'External Source',
        count: 0,
      },
    ],
    edges: [
      { from: 'routing-problem', to: 'review-gates', type: 'supports', confidence: 0.8 },
      { from: 'routing-problem', to: 'topic:ai-workflow', type: 'topic-tag', confidence: 1 },
      { from: 'routing-problem', to: 'missing-thought', type: 'supports', confidence: 0.2 },
    ],
    excluded: {},
    ...overrides,
  });
}

describe('memory data helpers', () => {
  it('provides a stable empty memory shape', () => {
    expect(emptyMemoryData).toEqual({
      schemaVersion: 1,
      generatedAt: null,
      counts: { thoughts: 0, topics: 0, edges: 0, sources: 0 },
      thoughts: [],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    });
  });

  it('normalizes missing collections to empty arrays', () => {
    expect(normalizeMemoryData({ schemaVersion: 1, counts: { thoughts: 1 } })).toMatchObject({
      schemaVersion: 1,
      counts: { thoughts: 1, topics: 0, edges: 0, sources: 0 },
      thoughts: [],
      topics: [],
      sources: [],
      edges: [],
      excluded: {},
    });
  });

  it('resolves public source hrefs for routeable content collections', () => {
    expect(resolveMemorySourceHref({ path: 'src/content/articles/example-article.mdx' })).toBe('/articles/example-article/');
    expect(resolveMemorySourceHref({ path: 'src/content/analysis/example-url-analysis.mdx' })).toBe('/analysis/example-url-analysis/');
    expect(resolveMemorySourceHref({ path: 'src/content/ideas/example-idea.mdx' })).toBe('/ideas/example-idea/');
    expect(resolveMemorySourceHref({ path: 'src/content/reviews/black-swan.mdx' })).toBe('/reviews/black-swan/');
    expect(resolveMemorySourceHref({ path: 'src/content/travel/example-travel-note.mdx' })).toBe('/travel/example-travel-note/');
  });

  it('passes through external source URLs', () => {
    expect(resolveMemorySourceHref({ url: 'https://example.com/source' })).toBe('https://example.com/source');
  });

  it('returns null for non-routeable repo paths and missing paths', () => {
    expect(resolveMemorySourceHref({ path: 'docs/implementation/memory-second-brain.md' })).toBeNull();
    expect(resolveMemorySourceHref({ path: 'src/pages/memory.astro' })).toBeNull();
    expect(resolveMemorySourceHref({})).toBeNull();
  });

  it('builds lookup maps with routeable sources and unresolved source refs', () => {
    const lookup = buildMemoryLookup(makeMemory());

    expect(lookup.thoughtsBySlug.get('routing-problem')?.claimEn).toBe('Context quality is a routing problem.');
    expect(lookup.topicsById.get('topic:ai-workflow')?.label).toBe('ai-workflow');
    expect(lookup.topicsBySlug.get('agent-workflows')?.id).toBe('topic:agent-workflows');
    expect(lookup.sourcesById.get('article-source')).toMatchObject({
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
    expect(lookup.sourcesById.get('docs-source')).toMatchObject({
      href: null,
      routeable: false,
    });
    expect(lookup.sourceRefsByThoughtSlug.get('routing-problem')).toEqual([
      expect.objectContaining({ id: 'article-source', routeable: true }),
      expect.objectContaining({ id: 'missing-source', unresolved: true, routeable: false }),
    ]);
  });

  it('groups only relationships whose endpoints are known public thoughts or topics', () => {
    const lookup = buildMemoryLookup(makeMemory());
    const edges = lookup.edgesByThoughtSlug.get('routing-problem') ?? [];

    expect(edges).toEqual([
      expect.objectContaining({ from: 'routing-problem', to: 'review-gates' }),
      expect.objectContaining({ from: 'routing-problem', to: 'topic:ai-workflow' }),
    ]);
    expect(edges.some((edge) => edge.to === 'missing-thought')).toBe(false);
  });

  it('finds memory directly linked to an article source path', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      [],
    );

    expect(result).toEqual({
      linked: [
        {
          slug: 'routing-problem',
          claimKo: '컨텍스트 품질은 라우팅 문제다.',
          claimEn: 'Context quality is a routing problem.',
          memoryType: 'semantic',
          topics: ['ai-workflow'],
          sourceCount: 2,
          matchCount: 0,
        },
      ],
      related: [],
      total: 1,
    });
  });

  it('falls back to case-insensitive article tag and memory topic matches', () => {
    const result = findArticleMemoryLinks(makeMemory(), 'src/content/articles/unlinked.mdx', [
      'AI-WORKFLOW',
      'missing',
    ]);

    expect(result.linked).toEqual([]);
    expect(result.related).toEqual([
      expect.objectContaining({
        slug: 'routing-problem',
        matchCount: 1,
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it('does not duplicate linked thoughts in related fallback results', () => {
    const result = findArticleMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      ['ai-workflow'],
    );

    expect(result.linked.map((thought) => thought.slug)).toEqual(['routing-problem']);
    expect(result.related.map((thought) => thought.slug)).not.toContain('routing-problem');
    expect(result.total).toBe(1);
  });

  it('caps article memory results at four thoughts', () => {
    const memory = makeMemory({
      counts: { thoughts: 5, topics: 1, edges: 0, sources: 1 },
      thoughts: Array.from({ length: 5 }, (_, index) => ({
        slug: `thought-${index + 1}`,
        claimKo: `생각 ${index + 1}`,
        claimEn: `Thought ${index + 1}`,
        memoryType: 'semantic',
        origin: 'kws',
        topics: ['ai-workflow'],
        theses: [],
        sources: [],
        body: '',
        position: { x: index, y: index },
      })),
      topics: [
        { id: 'topic:ai-workflow', slug: 'ai-workflow', label: 'ai-workflow', count: 5, position: { x: 1, y: 1 } },
      ],
      sources: [],
      edges: [],
    });

    const result = findArticleMemoryLinks(memory, '', ['ai-workflow']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'thought-1',
      'thought-2',
      'thought-3',
      'thought-4',
    ]);
    expect(result.total).toBe(4);
  });

  it('returns empty article memory links for empty memory data', () => {
    expect(findArticleMemoryLinks(emptyMemoryData, 'src/content/articles/example.mdx', ['ai-workflow'])).toEqual({
      linked: [],
      related: [],
      total: 0,
    });
  });

  it('sorts related thoughts by match count and keeps projection order for ties', () => {
    const memory = makeMemory({
      counts: { thoughts: 3, topics: 3, edges: 0, sources: 0 },
      thoughts: [
        {
          slug: 'one-match-first',
          claimKo: '첫 번째 한 개 매칭',
          claimEn: 'First one-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['ai-workflow'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 1, y: 1 },
        },
        {
          slug: 'two-matches',
          claimKo: '두 개 매칭',
          claimEn: 'Two-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['ai-workflow', 'codex'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 2, y: 2 },
        },
        {
          slug: 'one-match-second',
          claimKo: '두 번째 한 개 매칭',
          claimEn: 'Second one-match thought.',
          memoryType: 'semantic',
          origin: 'kws',
          topics: ['codex'],
          theses: [],
          sources: [],
          body: '',
          position: { x: 3, y: 3 },
        },
      ],
      topics: [],
      sources: [],
      edges: [],
    });

    const result = findArticleMemoryLinks(memory, '', ['ai-workflow', 'codex']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'two-matches',
      'one-match-first',
      'one-match-second',
    ]);
  });
});
