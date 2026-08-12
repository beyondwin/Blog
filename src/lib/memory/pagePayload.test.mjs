import { describe, expect, it } from 'vitest';
import {
  buildMemoryPagePayload,
  getMemoryGraphEdgeCoordinates,
  getLiteraryMemoryMapPosition,
  getMemorySourceCountLabel,
  sortLiteraryMemoryThoughts,
} from './pagePayload.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory page payload', () => {
  it('builds a serializable graph payload and node details', () => {
    const payload = buildMemoryPagePayload(makeMemory());

    expect(payload.graph.selectedFallback).toBe('thought:routing-problem');
    expect(payload.details['thought:routing-problem']).toMatchObject({
      id: 'thought:routing-problem',
      kind: 'thought',
      title: '컨텍스트 품질은 라우팅 문제다.',
      body: 'A body.',
      memoryType: 'semantic',
      origin: 'kws',
    });
    expect(payload.details['topic:ai-workflow']).toMatchObject({
      id: 'topic:ai-workflow',
      kind: 'topic',
      title: 'ai-workflow',
    });
    expect(payload.details['source:article-source']).toMatchObject({
      id: 'source:article-source',
      kind: 'source',
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
  });

  it('provides lookup data needed by the Astro markup without exposing Maps', () => {
    const payload = buildMemoryPagePayload(makeMemory());

    expect(payload.topicIdsByLabel).toEqual({
      'agent-workflows': 'topic:agent-workflows',
      'ai-workflow': 'topic:ai-workflow',
    });
    expect(payload.sourcesById['article-source']).toMatchObject({
      href: '/articles/context-refinement-system-design/',
      routeable: true,
    });
  });

  it('exposes only direct thought-to-thought connections for the literary archive', () => {
    const payload = buildMemoryPagePayload(makeMemory());

    expect(payload.details['thought:routing-problem'].directConnections).toEqual([
      {
        type: 'supports',
        direction: 'outbound',
        thought: {
          id: 'thought:review-gates',
          title: '에이전트 워크플로우에는 리뷰 게이트가 필요하다.',
        },
      },
    ]);
    expect(payload.details['thought:review-gates'].directConnections).toEqual([
      expect.objectContaining({
        type: 'supports',
        direction: 'inbound',
        thought: expect.objectContaining({ id: 'thought:routing-problem' }),
      }),
    ]);
  });

  it('computes graph edge coordinates from graph node positions', () => {
    const payload = buildMemoryPagePayload(makeMemory());
    const edge = payload.graph.edges.find((item) => item.type === 'supports');

    expect(getMemoryGraphEdgeCoordinates(payload.graph, edge)).toEqual({
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
    });
  });

  it('places the seven public thoughts in the approved printed-map sequence', () => {
    expect(Array.from({ length: 7 }, (_, index) => getLiteraryMemoryMapPosition(index))).toEqual([
      { x: 44, y: 16 },
      { x: 16, y: 38 },
      { x: 68, y: 38 },
      { x: 42, y: 58 },
      { x: 14, y: 76 },
      { x: 68, y: 76 },
      { x: 45, y: 94 },
    ]);
  });

  it('uses the approved editorial sentence order without dropping unknown thoughts', () => {
    const thoughts = [
      { slug: 'ai-design-tools-need-judgment-loops' },
      { slug: 'unknown-future-thought' },
      { slug: 'local-agent-products-are-work-shells' },
      { slug: 'context-quality-is-routing-problem' },
    ];

    expect(sortLiteraryMemoryThoughts(thoughts).map((thought) => thought.slug)).toEqual([
      'context-quality-is-routing-problem',
      'local-agent-products-are-work-shells',
      'ai-design-tools-need-judgment-loops',
      'unknown-future-thought',
    ]);
  });

  it('formats source count labels', () => {
    expect(getMemorySourceCountLabel(1)).toBe('1 source');
    expect(getMemorySourceCountLabel(2)).toBe('2 sources');
  });
});
