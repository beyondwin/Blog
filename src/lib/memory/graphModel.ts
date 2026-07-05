import type { MemoryPublicData } from './publicData';
import { buildMemoryLookup } from './lookup';

export type MemoryGraphNodeKind = 'thought' | 'topic' | 'source';

export interface MemoryGraphNode {
  id: string;
  kind: MemoryGraphNodeKind;
  label: string;
  sublabel?: string;
  weight: number;
  memoryType?: string;
  origin?: string;
  topicIds: string[];
  sourceIds: string[];
  href?: string | null;
  routeable?: boolean;
  date?: string;
  position: { x: number; y: number };
}

export interface MemoryGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
  derived: boolean;
}

export interface MemoryGraphFacets {
  lenses: Array<{ id: string; label: string; count: number }>;
  topics: Array<{ id: string; label: string; count: number }>;
  sources: Array<{ id: string; label: string; count: number; routeable: boolean }>;
  memoryTypes: Array<{ id: string; label: string; count: number }>;
  edgeTypes: Array<{ id: string; label: string; count: number }>;
}

export interface MemoryGraphModel {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  facets: MemoryGraphFacets;
  selectedFallback: string | null;
}

const graphLensDefinitions = [
  { id: 'all', label: 'All' },
  { id: 'topics', label: 'Topics' },
  { id: 'sources', label: 'Sources' },
  { id: 'theses', label: 'Theses' },
  { id: 'external-vs-mine', label: 'External vs Mine' },
] as const;

export function prefixedThoughtId(slug: string): string {
  return `thought:${slug}`;
}

export function prefixedSourceId(sourceId: string): string {
  return `source:${sourceId}`;
}

export function stableEdgePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sortedFacetEntries(counts: Map<string, number>): Array<{ id: string; label: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, label: id, count }));
}

function graphPosition(base: { x: number; y: number } | undefined, index: number, total: number, ring: number): { x: number; y: number } {
  if (base) {
    return {
      x: Math.min(100, Math.max(0, base.x)),
      y: Math.min(100, Math.max(0, base.y)),
    };
  }

  const angle = total <= 1 ? 0 : (Math.PI * 2 * index) / total;
  return {
    x: Math.round((50 + Math.cos(angle) * ring) * 100) / 100,
    y: Math.round((50 + Math.sin(angle) * ring) * 100) / 100,
  };
}

export function buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel {
  const lookup = buildMemoryLookup(memory);
  const nodes: MemoryGraphNode[] = [];
  const edges: MemoryGraphEdge[] = [];
  const nodeIds = new Set<string>();
  const memoryTypeCounts = new Map<string, number>();
  const edgeTypeCounts = new Map<string, number>();

  for (const thought of memory.thoughts) {
    const topicIds = thought.topics.map((topic) => {
      return lookup.topicsBySlug.get(topic)?.id ?? `topic:${stableEdgePart(topic)}`;
    });
    const sourceIds = thought.sources.map(prefixedSourceId);

    nodes.push({
      id: prefixedThoughtId(thought.slug),
      kind: 'thought',
      label: thought.claimKo,
      sublabel: thought.claimEn,
      weight: Math.max(1, thought.sources.length),
      memoryType: thought.memoryType,
      origin: thought.origin,
      topicIds,
      sourceIds,
      position: graphPosition(thought.position, nodes.length, Math.max(1, memory.thoughts.length), 34),
    });
    nodeIds.add(prefixedThoughtId(thought.slug));
    incrementCount(memoryTypeCounts, thought.memoryType);
  }

  for (const [index, topic] of memory.topics.entries()) {
    nodes.push({
      id: topic.id,
      kind: 'topic',
      label: topic.label,
      weight: Math.max(1, topic.count),
      topicIds: [topic.id],
      sourceIds: [],
      position: graphPosition(topic.position, index, Math.max(1, memory.topics.length), 42),
    });
    nodeIds.add(topic.id);
  }

  for (const [index, source] of memory.sources.entries()) {
    const resolved = lookup.sourcesById.get(source.id);
    nodes.push({
      id: prefixedSourceId(source.id),
      kind: 'source',
      label: source.title,
      sublabel: source.kind,
      weight: Math.max(1, source.count),
      topicIds: [],
      sourceIds: [prefixedSourceId(source.id)],
      href: resolved?.href ?? null,
      routeable: resolved?.routeable ?? false,
      date: source.date,
      position: graphPosition(undefined, index, Math.max(1, memory.sources.length), 46),
    });
    nodeIds.add(prefixedSourceId(source.id));
  }

  for (const edge of memory.edges) {
    if (edge.type === 'topic-tag') {
      continue;
    }

    const from = lookup.thoughtsBySlug.has(edge.from) ? prefixedThoughtId(edge.from) : edge.from;
    const to = lookup.thoughtsBySlug.has(edge.to) ? prefixedThoughtId(edge.to) : edge.to;

    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      continue;
    }

    edges.push({
      id: `explicit:${stableEdgePart(edge.from)}:${stableEdgePart(edge.type)}:${stableEdgePart(edge.to)}`,
      from,
      to,
      type: edge.type,
      confidence: edge.confidence,
      derived: false,
    });
    incrementCount(edgeTypeCounts, edge.type);
  }

  for (const thought of memory.thoughts) {
    const thoughtId = prefixedThoughtId(thought.slug);

    for (const topic of thought.topics) {
      const topicId = lookup.topicsBySlug.get(topic)?.id;
      if (!topicId || !nodeIds.has(topicId)) {
        continue;
      }

      const edgeId = `derived:thought-topic:${stableEdgePart(thought.slug)}:${stableEdgePart(topicId)}`;
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push({
          id: edgeId,
          from: thoughtId,
          to: topicId,
          type: 'topic-tag',
          confidence: 1,
          derived: true,
        });
        incrementCount(edgeTypeCounts, 'topic-tag');
      }
    }

    for (const sourceId of thought.sources) {
      const graphSourceId = prefixedSourceId(sourceId);
      if (!nodeIds.has(graphSourceId)) {
        continue;
      }

      edges.push({
        id: `derived:thought-source:${stableEdgePart(thought.slug)}:${stableEdgePart(sourceId)}`,
        from: thoughtId,
        to: graphSourceId,
        type: 'source-link',
        confidence: 1,
        derived: true,
      });
      incrementCount(edgeTypeCounts, 'source-link');
    }
  }

  return {
    nodes,
    edges,
    facets: {
      lenses: graphLensDefinitions.map((lens) => {
        const count = lens.id === 'all'
          ? nodes.length
          : lens.id === 'topics'
            ? memory.topics.length
            : lens.id === 'sources'
              ? memory.sources.length
              : lens.id === 'theses'
                ? memory.thoughts.filter((thought) => thought.theses.length > 0).length
                : new Set([
                  ...memory.thoughts.map((thought) => thought.origin),
                  ...memory.sources.filter((source) => source.kind === 'external').map((source) => source.kind),
                ]).size;
        return { ...lens, count };
      }),
      topics: memory.topics
        .map((topic) => ({ id: topic.id, label: topic.label, count: topic.count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      sources: memory.sources
        .map((source) => {
          const resolved = lookup.sourcesById.get(source.id);
          return {
            id: prefixedSourceId(source.id),
            label: source.title,
            count: source.count,
            routeable: resolved?.routeable ?? false,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
      memoryTypes: sortedFacetEntries(memoryTypeCounts),
      edgeTypes: sortedFacetEntries(edgeTypeCounts),
    },
    selectedFallback: memory.thoughts[0] ? prefixedThoughtId(memory.thoughts[0].slug) : null,
  };
}
