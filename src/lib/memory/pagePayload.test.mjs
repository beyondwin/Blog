import { describe, expect, it } from 'vitest';
import {
  buildMemoryPagePayload,
  getMemoryGraphEdgeCoordinates,
  getMemorySourceCountLabel,
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
      origin: 'author',
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

  it('formats source count labels', () => {
    expect(getMemorySourceCountLabel(1)).toBe('1 source');
    expect(getMemorySourceCountLabel(2)).toBe('2 sources');
  });
});
