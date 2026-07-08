import { describe, expect, it } from 'vitest';
import { findContentMemoryLinks } from './contentLinks.ts';
import { emptyMemoryData, normalizeMemoryData } from './publicData.ts';
import { makeMemory } from './testFixture.mjs';

describe('content memory links', () => {
  it('finds memory directly linked to a non-article source path', () => {
    const memory = normalizeMemoryData({
      ...makeMemory(),
      counts: { thoughts: 1, topics: 1, edges: 0, sources: 1 },
      thoughts: [
        {
          slug: 'reading-risk',
          claimKo: '리뷰도 나중의 판단으로 이어져야 한다.',
          claimEn: 'Reviews should become reusable judgement.',
          memoryType: 'reflective',
          origin: 'kws',
          topics: ['book'],
          theses: [],
          sources: ['review-source'],
          body: '',
          position: { x: 10, y: 20 },
        },
      ],
      topics: [
        { id: 'topic:book', slug: 'book', label: 'book', count: 1, position: { x: 1, y: 1 } },
      ],
      sources: [
        {
          id: 'review-source',
          kind: 'review',
          path: 'src/content/reviews/black-swan.mdx',
          title: 'Black Swan',
          count: 1,
        },
      ],
      edges: [],
      excluded: {},
    });

    const result = findContentMemoryLinks(memory, 'src/content/reviews/black-swan.mdx', []);

    expect(result.linked).toEqual([
      expect.objectContaining({
        slug: 'reading-risk',
        nodeId: 'thought:reading-risk',
        memoryHref: '/memory/?node=thought%3Areading-risk',
        matchCount: 0,
      }),
    ]);
    expect(result.related).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('keeps existing article direct source behavior', () => {
    const result = findContentMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      [],
    );

    expect(result.linked).toEqual([
      expect.objectContaining({
        slug: 'routing-problem',
        nodeId: 'thought:routing-problem',
        memoryHref: '/memory/?node=thought%3Arouting-problem',
        matchCount: 0,
      }),
    ]);
    expect(result.related).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('falls back to case-insensitive content tag and memory topic matches', () => {
    const result = findContentMemoryLinks(makeMemory(), 'src/content/reviews/unlinked.mdx', [
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
    const result = findContentMemoryLinks(
      makeMemory(),
      'src/content/articles/context-refinement-system-design.mdx',
      ['ai-workflow'],
    );

    expect(result.linked.map((thought) => thought.slug)).toEqual(['routing-problem']);
    expect(result.related.map((thought) => thought.slug)).not.toContain('routing-problem');
    expect(result.total).toBe(1);
  });

  it('caps content memory results at four thoughts', () => {
    const memory = normalizeMemoryData({
      counts: { thoughts: 5, topics: 1, edges: 0, sources: 0 },
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
      excluded: {},
    });

    const result = findContentMemoryLinks(memory, '', ['ai-workflow']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'thought-1',
      'thought-2',
      'thought-3',
      'thought-4',
    ]);
    expect(result.total).toBe(4);
  });

  it('returns empty content memory links for empty memory data', () => {
    expect(findContentMemoryLinks(emptyMemoryData, 'src/content/reviews/example.mdx', ['ai-workflow'])).toEqual({
      linked: [],
      related: [],
      total: 0,
    });
  });

  it('allows tag fallback when source path is missing', () => {
    const result = findContentMemoryLinks(makeMemory(), '', ['agent-workflows']);

    expect(result.linked).toEqual([]);
    expect(result.related).toEqual([
      expect.objectContaining({
        slug: 'review-gates',
        matchCount: 1,
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it('sorts related thoughts by match count and keeps projection order for ties', () => {
    const memory = normalizeMemoryData({
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
      excluded: {},
    });

    const result = findContentMemoryLinks(memory, '', ['ai-workflow', 'codex']);

    expect(result.related.map((thought) => thought.slug)).toEqual([
      'two-matches',
      'one-match-first',
      'one-match-second',
    ]);
  });
});
