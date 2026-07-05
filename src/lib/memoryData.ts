export * from './memory/publicData';
export * from './memory/lookup';

import type { MemoryPublicData, MemoryThought } from './memory/publicData';
import { buildMemoryLookup } from './memory/lookup';

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

export interface MemoryGraphFilterState {
  query?: string;
  activeLens?: string;
  activeTopicIds?: string[];
  activeSourceIds?: string[];
  activeMemoryTypes?: string[];
  activeEdgeTypes?: string[];
}

export interface MemoryDeepLinkState extends MemoryGraphFilterState {
  selectedNodeId?: string;
}

const graphLensDefinitions = [
  { id: 'all', label: 'All' },
  { id: 'topics', label: 'Topics' },
  { id: 'sources', label: 'Sources' },
  { id: 'theses', label: 'Theses' },
  { id: 'external-vs-mine', label: 'External vs Mine' },
] as const;

function prefixedThoughtId(slug: string): string {
  return `thought:${slug}`;
}

function prefixedSourceId(sourceId: string): string {
  return `source:${sourceId}`;
}

function stableEdgePart(value: string): string {
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

function normalizedQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function nodeSearchText(node: MemoryGraphNode): string {
  return [
    node.id,
    node.label,
    node.sublabel ?? '',
    node.memoryType ?? '',
    node.origin ?? '',
    ...node.topicIds,
    ...node.sourceIds,
  ].join(' ').toLocaleLowerCase();
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

function applyLens(nodes: MemoryGraphNode[], activeLens: string | undefined): MemoryGraphNode[] {
  if (!activeLens || activeLens === 'all') {
    return nodes;
  }

  if (activeLens === 'topics') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'topic');
  }

  if (activeLens === 'sources') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'source');
  }

  if (activeLens === 'theses') {
    return nodes.filter((node) => node.kind !== 'source');
  }

  if (activeLens === 'external-vs-mine') {
    return nodes.filter((node) => node.kind === 'thought' || node.kind === 'source');
  }

  return nodes;
}

export function filterMemoryGraphModel(
  model: MemoryGraphModel,
  filters: MemoryGraphFilterState = {},
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const query = normalizedQuery(filters.query);
  const activeTopicIds = new Set(filters.activeTopicIds ?? []);
  const activeSourceIds = new Set(filters.activeSourceIds ?? []);
  const activeMemoryTypes = new Set(filters.activeMemoryTypes ?? []);
  const activeEdgeTypes = new Set(filters.activeEdgeTypes ?? []);
  const activeEdgeNodeIds = activeEdgeTypes.size > 0
    ? new Set(model.edges.filter((edge) => activeEdgeTypes.has(edge.type)).flatMap((edge) => [edge.from, edge.to]))
    : null;

  const lensNodeIds = new Set(applyLens(model.nodes, filters.activeLens).map((node) => node.id));
  const visibleNodes = applyLens(model.nodes, filters.activeLens)
    .filter((node) => {
      if (query && !nodeSearchText(node).includes(query)) {
        return false;
      }

      if (activeTopicIds.size > 0 && !node.topicIds.some((topicId) => activeTopicIds.has(topicId))) {
        return false;
      }

      if (activeSourceIds.size > 0 && !node.sourceIds.some((sourceId) => activeSourceIds.has(sourceId))) {
        return false;
      }

      if (activeMemoryTypes.size > 0 && (!node.memoryType || !activeMemoryTypes.has(node.memoryType))) {
        return false;
      }

      if (activeEdgeNodeIds && !activeEdgeNodeIds.has(node.id)) {
        return false;
      }

      return true;
    });

  const nodeIds = new Set(visibleNodes.map((node) => node.id));

  for (const edge of model.edges) {
    const fromVisible = nodeIds.has(edge.from);
    const toVisible = nodeIds.has(edge.to);

    if (!fromVisible && !toVisible) {
      continue;
    }

    const fromNode = model.nodes.find((node) => node.id === edge.from);
    const toNode = model.nodes.find((node) => node.id === edge.to);
    const visibleThoughtContext = (fromNode?.kind === 'thought' && fromVisible) || (toNode?.kind === 'thought' && toVisible);

    if (visibleThoughtContext && edge.derived) {
      if (lensNodeIds.has(edge.from)) {
        nodeIds.add(edge.from);
      }
      if (lensNodeIds.has(edge.to)) {
        nodeIds.add(edge.to);
      }
    }
  }

  const orderedNodeIds = new Set(model.nodes.filter((node) => nodeIds.has(node.id)).map((node) => node.id));
  const edgeIds = new Set(
    model.edges
      .filter((edge) => {
        if (!orderedNodeIds.has(edge.from) || !orderedNodeIds.has(edge.to)) {
          return false;
        }

        if (activeEdgeTypes.size > 0 && !activeEdgeTypes.has(edge.type)) {
          return false;
        }

        return true;
      })
      .map((edge) => edge.id),
  );

  return { nodeIds: orderedNodeIds, edgeIds };
}

function appendParams(params: URLSearchParams, key: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    if (value) {
      params.append(key, value);
    }
  }
}

export function createMemoryFilterHref(filters: MemoryDeepLinkState): string {
  const params = new URLSearchParams();

  if (filters.selectedNodeId) {
    params.set('node', filters.selectedNodeId);
  }

  if (filters.query?.trim()) {
    params.set('q', filters.query.trim());
  }

  if (filters.activeLens && filters.activeLens !== 'all') {
    params.set('lens', filters.activeLens);
  }

  appendParams(params, 'topic', filters.activeTopicIds);
  appendParams(params, 'source', filters.activeSourceIds);
  appendParams(params, 'type', filters.activeMemoryTypes);
  appendParams(params, 'edge', filters.activeEdgeTypes);

  const query = params.toString();
  return query ? `/memory/?${query}` : '/memory/';
}

export function createMemoryNodeHref(nodeId: string): string {
  return createMemoryFilterHref({ selectedNodeId: nodeId });
}

function allowedParamValues(values: string[], allowed: Set<string>): string[] {
  return values.filter((value) => allowed.has(value));
}

export function parseMemoryDeepLinkParams(
  params: URLSearchParams,
  model: MemoryGraphModel,
): MemoryDeepLinkState {
  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const lensIds = new Set(model.facets.lenses.map((lens) => lens.id));
  const topicIds = new Set(model.facets.topics.map((topic) => topic.id));
  const sourceIds = new Set(model.facets.sources.map((source) => source.id));
  const memoryTypes = new Set(model.facets.memoryTypes.map((type) => type.id));
  const edgeTypes = new Set(model.facets.edgeTypes.map((type) => type.id));
  const selectedNodeId = params.get('node') ?? undefined;
  const activeLens = params.get('lens') ?? undefined;
  const query = params.get('q')?.trim() ?? '';
  const state: MemoryDeepLinkState = {};

  if (selectedNodeId && nodeIds.has(selectedNodeId)) {
    state.selectedNodeId = selectedNodeId;
  }

  if (query) {
    state.query = query;
  }

  if (activeLens && lensIds.has(activeLens)) {
    state.activeLens = activeLens;
  }

  const activeTopicIds = allowedParamValues(params.getAll('topic'), topicIds);
  const activeSourceIds = allowedParamValues(params.getAll('source'), sourceIds);
  const activeMemoryTypes = allowedParamValues(params.getAll('type'), memoryTypes);
  const activeEdgeTypes = allowedParamValues(params.getAll('edge'), edgeTypes);

  if (activeTopicIds.length > 0) {
    state.activeTopicIds = activeTopicIds;
  }
  if (activeSourceIds.length > 0) {
    state.activeSourceIds = activeSourceIds;
  }
  if (activeMemoryTypes.length > 0) {
    state.activeMemoryTypes = activeMemoryTypes;
  }
  if (activeEdgeTypes.length > 0) {
    state.activeEdgeTypes = activeEdgeTypes;
  }

  return state;
}

export interface ArticleMemoryLink {
  slug: string;
  claimKo: string;
  claimEn: string;
  memoryType: string;
  nodeId: string;
  memoryHref: string;
  topics: string[];
  sourceCount: number;
  matchCount: number;
}

export interface ArticleMemoryLinks {
  linked: ArticleMemoryLink[];
  related: ArticleMemoryLink[];
  total: number;
}

const defaultArticleMemoryLimit = 4;

function normalizeMemoryMatchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toArticleMemoryLink(thought: MemoryThought, matchCount: number): ArticleMemoryLink {
  const nodeId = prefixedThoughtId(thought.slug);

  return {
    slug: thought.slug,
    claimKo: thought.claimKo,
    claimEn: thought.claimEn,
    memoryType: thought.memoryType,
    nodeId,
    memoryHref: createMemoryNodeHref(nodeId),
    topics: thought.topics,
    sourceCount: thought.sources.length,
    matchCount,
  };
}

export function findArticleMemoryLinks(
  memory: MemoryPublicData,
  articlePath: string,
  articleTags: string[] = [],
  limit = defaultArticleMemoryLimit,
): ArticleMemoryLinks {
  const boundedLimit = Math.max(0, limit);

  if (boundedLimit === 0 || memory.thoughts.length === 0) {
    return { linked: [], related: [], total: 0 };
  }

  const linkedSourceIds = new Set(
    memory.sources
      .filter((source) => articlePath && source.path === articlePath)
      .map((source) => source.id),
  );
  const linkedThoughtSlugs = new Set<string>();
  const linked: ArticleMemoryLink[] = [];

  if (linkedSourceIds.size > 0) {
    for (const thought of memory.thoughts) {
      if (!thought.sources.some((sourceId) => linkedSourceIds.has(sourceId))) {
        continue;
      }

      linkedThoughtSlugs.add(thought.slug);
      linked.push(toArticleMemoryLink(thought, 0));

      if (linked.length === boundedLimit) {
        break;
      }
    }
  }

  const remainingLimit = boundedLimit - linked.length;

  if (remainingLimit === 0) {
    return { linked, related: [], total: linked.length };
  }

  const normalizedTags = new Set(articleTags.map(normalizeMemoryMatchValue).filter(Boolean));

  if (normalizedTags.size === 0) {
    return { linked, related: [], total: linked.length };
  }

  const related = memory.thoughts
    .map((thought, index) => {
      if (linkedThoughtSlugs.has(thought.slug)) {
        return null;
      }

      const normalizedTopics = new Set(thought.topics.map(normalizeMemoryMatchValue).filter(Boolean));
      const matchCount = [...normalizedTopics].filter((topic) => normalizedTags.has(topic)).length;

      if (matchCount === 0) {
        return null;
      }

      return { thought, index, matchCount };
    })
    .filter((candidate): candidate is { thought: MemoryThought; index: number; matchCount: number } => candidate !== null)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }

      return a.index - b.index;
    })
    .slice(0, remainingLimit)
    .map(({ thought, matchCount }) => toArticleMemoryLink(thought, matchCount));

  return {
    linked,
    related,
    total: linked.length + related.length,
  };
}
