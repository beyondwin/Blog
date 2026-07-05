import { describe, expect, it } from 'vitest';
import { buildMemoryGraphModel } from './graphModel.ts';
import {
  createMemoryFilterHref,
  createMemoryNodeHref,
  filterMemoryGraphModel,
  parseMemoryDeepLinkParams,
} from './filters.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory graph filters and deep links', () => {
  it('filters graph nodes by query, topic, source, memory type, and edge type', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const result = filterMemoryGraphModel(graph, {
      query: 'routing',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    });

    expect([...result.nodeIds]).toContain('thought:routing-problem');
    expect([...result.edgeIds]).toEqual(['explicit:routing-problem:supports:review-gates']);
  });

  it('creates stable memory node and filter hrefs', () => {
    expect(createMemoryNodeHref('thought:routing-problem')).toBe('/memory/?node=thought%3Arouting-problem');
    expect(createMemoryFilterHref({
      selectedNodeId: 'thought:routing-problem',
      query: 'workflow',
      activeLens: 'sources',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    })).toBe('/memory/?node=thought%3Arouting-problem&q=workflow&lens=sources&topic=topic%3Aai-workflow&source=source%3Aarticle-source&type=semantic&edge=supports');
  });

  it('parses only valid deep-link params for the current graph', () => {
    const graph = buildMemoryGraphModel(makeMemory());
    const params = new URLSearchParams('node=thought:routing-problem&node=missing&q=workflow&lens=sources&topic=topic:ai-workflow&topic=missing&source=source:article-source&type=semantic&type=missing&edge=supports&edge=missing');

    expect(parseMemoryDeepLinkParams(params, graph)).toEqual({
      selectedNodeId: 'thought:routing-problem',
      query: 'workflow',
      activeLens: 'sources',
      activeTopicIds: ['topic:ai-workflow'],
      activeSourceIds: ['source:article-source'],
      activeMemoryTypes: ['semantic'],
      activeEdgeTypes: ['supports'],
    });
  });
});
