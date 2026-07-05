import type { MemoryGraphModel, MemoryGraphNode } from './graphModel';

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
    const activeEdgeTypeContext = activeEdgeTypes.size > 0 && activeEdgeTypes.has(edge.type) && (fromVisible || toVisible);

    if (activeEdgeTypeContext || (visibleThoughtContext && edge.derived)) {
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
