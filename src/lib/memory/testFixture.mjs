import { normalizeMemoryData } from './publicData.ts';

export function makeMemory(overrides = {}) {
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
