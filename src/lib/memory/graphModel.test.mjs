import { describe, expect, it } from 'vitest';
import { buildMemoryGraphModel } from './graphModel.ts';
import { makeMemory } from './testFixture.mjs';

describe('memory graph model', () => {
  it('builds thought, topic, and source graph nodes', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'thought:routing-problem',
      'thought:review-gates',
      'topic:ai-workflow',
      'topic:agent-workflows',
      'source:article-source',
      'source:docs-source',
      'source:external-source',
    ]));
    expect(graph.selectedFallback).toBe('thought:routing-problem');
  });

  it('skips explicit edges with unknown endpoints and derives topic/source edges', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'thought:routing-problem', to: 'thought:review-gates', type: 'supports', derived: false }),
      expect.objectContaining({ from: 'thought:routing-problem', to: 'topic:ai-workflow', type: 'topic-tag', derived: true }),
      expect.objectContaining({ from: 'thought:routing-problem', to: 'source:article-source', type: 'source-link', derived: true }),
    ]));
    expect(graph.edges.some((edge) => edge.to === 'missing-thought')).toBe(false);
  });

  it('builds stable facets for lenses, topics, sources, memory types, and edge types', () => {
    const graph = buildMemoryGraphModel(makeMemory());

    expect(graph.facets.lenses.map((lens) => lens.id)).toEqual(['all', 'topics', 'sources', 'theses', 'external-vs-mine']);
    expect(graph.facets.topics.map((topic) => topic.id)).toEqual(['topic:agent-workflows', 'topic:ai-workflow']);
    expect(graph.facets.memoryTypes.map((type) => type.id)).toEqual(['procedural', 'semantic']);
    expect(graph.facets.edgeTypes.map((type) => type.id)).toEqual(expect.arrayContaining(['source-link', 'supports', 'topic-tag']));
  });
});
