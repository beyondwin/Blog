export interface MemoryPublicData {
  schemaVersion: number;
  generatedAt: string | null;
  counts: {
    thoughts: number;
    topics: number;
    edges: number;
    sources: number;
  };
  thoughts: Array<{
    slug: string;
    claimKo: string;
    claimEn: string;
    memoryType: string;
    origin: string;
    topics: string[];
    theses: string[];
    sources: string[];
    body: string;
    position: { x: number; y: number };
  }>;
  topics: Array<{
    id: string;
    slug: string;
    label: string;
    count: number;
    position: { x: number; y: number };
  }>;
  sources: Array<{
    id: string;
    kind: string;
    path?: string;
    url?: string;
    title: string;
    date?: string;
    count: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    confidence: number;
  }>;
  excluded: Record<string, number>;
}

export const emptyMemoryData: MemoryPublicData = {
  schemaVersion: 1,
  generatedAt: null,
  counts: { thoughts: 0, topics: 0, edges: 0, sources: 0 },
  thoughts: [],
  topics: [],
  sources: [],
  edges: [],
  excluded: {},
};

export function normalizeMemoryData(value: Partial<MemoryPublicData> | null | undefined): MemoryPublicData {
  return {
    schemaVersion: value?.schemaVersion ?? emptyMemoryData.schemaVersion,
    generatedAt: value?.generatedAt ?? emptyMemoryData.generatedAt,
    counts: {
      thoughts: value?.counts?.thoughts ?? 0,
      topics: value?.counts?.topics ?? 0,
      edges: value?.counts?.edges ?? 0,
      sources: value?.counts?.sources ?? 0,
    },
    thoughts: value?.thoughts ?? [],
    topics: value?.topics ?? [],
    sources: value?.sources ?? [],
    edges: value?.edges ?? [],
    excluded: value?.excluded ?? {},
  };
}

export type MemoryThought = MemoryPublicData['thoughts'][number];
export type MemoryTopic = MemoryPublicData['topics'][number];
export type MemorySource = MemoryPublicData['sources'][number];
export type MemoryEdge = MemoryPublicData['edges'][number];

export interface ResolvedMemorySource extends MemorySource {
  href: string | null;
  routeable: boolean;
}

export interface UnresolvedMemorySource {
  id: string;
  title: string;
  href: null;
  routeable: false;
  unresolved: true;
}

export interface MemoryLookup {
  thoughtsBySlug: Map<string, MemoryThought>;
  topicsById: Map<string, MemoryTopic>;
  topicsBySlug: Map<string, MemoryTopic>;
  sourcesById: Map<string, ResolvedMemorySource>;
  sourceRefsByThoughtSlug: Map<string, Array<ResolvedMemorySource | UnresolvedMemorySource>>;
  edgesByThoughtSlug: Map<string, MemoryEdge[]>;
}

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

const routeableSourcePrefixes = [
  ['src/content/articles/', '/articles/'],
  ['src/content/analysis/', '/analysis/'],
  ['src/content/ideas/', '/ideas/'],
  ['src/content/reviews/', '/reviews/'],
  ['src/content/travel/', '/travel/'],
] as const;

function slugFromContentPath(path: string): string {
  return path.split('/').pop()?.replace(/\.mdx?$/, '') ?? '';
}

export function resolveMemorySourceHref(source: Pick<MemorySource, 'path' | 'url'>): string | null {
  if (source.url) {
    return source.url;
  }

  if (!source.path) {
    return null;
  }

  for (const [prefix, routePrefix] of routeableSourcePrefixes) {
    if (source.path.startsWith(prefix)) {
      const slug = slugFromContentPath(source.path);
      return slug ? `${routePrefix}${slug}/` : null;
    }
  }

  return null;
}

function isKnownMemoryEndpoint(id: string, thoughtsBySlug: Map<string, MemoryThought>, topicsById: Map<string, MemoryTopic>): boolean {
  return thoughtsBySlug.has(id) || topicsById.has(id);
}

export function buildMemoryLookup(memory: MemoryPublicData): MemoryLookup {
  const thoughtsBySlug = new Map(memory.thoughts.map((thought) => [thought.slug, thought]));
  const topicsById = new Map(memory.topics.map((topic) => [topic.id, topic]));
  const topicsBySlug = new Map(memory.topics.map((topic) => [topic.slug, topic]));
  const sourcesById = new Map<string, ResolvedMemorySource>();
  const sourceRefsByThoughtSlug = new Map<string, Array<ResolvedMemorySource | UnresolvedMemorySource>>();
  const edgesByThoughtSlug = new Map<string, MemoryEdge[]>();

  for (const source of memory.sources) {
    const href = resolveMemorySourceHref(source);
    sourcesById.set(source.id, {
      ...source,
      href,
      routeable: href !== null,
    });
  }

  for (const thought of memory.thoughts) {
    sourceRefsByThoughtSlug.set(thought.slug, thought.sources.map((sourceId) => {
      const source = sourcesById.get(sourceId);

      if (source) {
        return source;
      }

      return {
        id: sourceId,
        title: 'Unresolved source',
        href: null,
        routeable: false,
        unresolved: true,
      };
    }));
  }

  for (const edge of memory.edges) {
    if (!isKnownMemoryEndpoint(edge.from, thoughtsBySlug, topicsById) || !isKnownMemoryEndpoint(edge.to, thoughtsBySlug, topicsById)) {
      continue;
    }

    if (thoughtsBySlug.has(edge.from)) {
      const edges = edgesByThoughtSlug.get(edge.from) ?? [];
      edges.push(edge);
      edgesByThoughtSlug.set(edge.from, edges);
    }

    if (thoughtsBySlug.has(edge.to)) {
      const edges = edgesByThoughtSlug.get(edge.to) ?? [];
      edges.push(edge);
      edgesByThoughtSlug.set(edge.to, edges);
    }
  }

  return {
    thoughtsBySlug,
    topicsById,
    topicsBySlug,
    sourcesById,
    sourceRefsByThoughtSlug,
    edgesByThoughtSlug,
  };
}

function graphThoughtId(slug: string): string {
  return `thought:${slug}`;
}

function graphSourceId(id: string): string {
  return `source:${id}`;
}

function clampGraphCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

function stableFallbackPosition(kind: MemoryGraphNodeKind, index: number): { x: number; y: number } {
  const offsets = {
    thought: { x: 0, y: 0 },
    topic: { x: 10, y: 0 },
    source: { x: 0, y: 20 },
  } satisfies Record<MemoryGraphNodeKind, { x: number; y: number }>;
  const offset = offsets[kind];

  return {
    x: Math.min(100, 50 + offset.x + (index % 6) * 6),
    y: Math.min(100, 50 + offset.y + Math.floor(index / 6) * 8),
  };
}

function graphPosition(
  item: { position?: { x?: number; y?: number } },
  kind: MemoryGraphNodeKind,
  index: number,
): { x: number; y: number } {
  const x = clampGraphCoordinate(item.position?.x);
  const y = clampGraphCoordinate(item.position?.y);

  if (x !== null && y !== null) {
    return { x, y };
  }

  return stableFallbackPosition(kind, index);
}

function countBy<T>(items: T[], getValue: (item: T) => string | undefined): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = getValue(item);

    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].map(([id, count]) => ({ id, label: id, count }));
}

function countEdgeTypes(edges: MemoryGraphEdge[]): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    counts.set(edge.type, (counts.get(edge.type) ?? 0) + 1);
  }

  return [...counts.entries()].map(([id, count]) => ({ id, label: id, count }));
}

function nodeSearchText(node: MemoryGraphNode): string {
  return [
    node.label,
    node.sublabel,
    node.memoryType,
    node.origin,
    ...node.topicIds,
    ...node.sourceIds,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function nodeMatchesLens(node: MemoryGraphNode, lens: string): boolean {
  if (lens === 'topics') {
    return node.kind === 'thought' || node.kind === 'topic';
  }

  if (lens === 'sources') {
    return node.kind === 'thought' || node.kind === 'source';
  }

  if (lens === 'theses') {
    return node.kind === 'thought' || node.kind === 'topic';
  }

  if (lens === 'external-vs-mine') {
    return node.kind === 'thought' || node.kind === 'source';
  }

  return true;
}

export function buildMemoryGraphModel(memory: MemoryPublicData): MemoryGraphModel {
  const lookup = buildMemoryLookup(memory);
  const nodes: MemoryGraphNode[] = [];
  const edges: MemoryGraphEdge[] = [];

  for (const [index, thought] of memory.thoughts.entries()) {
    nodes.push({
      id: graphThoughtId(thought.slug),
      kind: 'thought',
      label: thought.claimKo || thought.claimEn || thought.slug,
      sublabel: thought.claimEn,
      weight: thought.topics.length + thought.sources.length,
      memoryType: thought.memoryType,
      origin: thought.origin,
      topicIds: thought.topics.map((topicSlug) => lookup.topicsBySlug.get(topicSlug)?.id ?? `topic:${topicSlug}`),
      sourceIds: thought.sources.map(graphSourceId),
      position: graphPosition(thought, 'thought', index),
    });
  }

  for (const [index, topic] of memory.topics.entries()) {
    nodes.push({
      id: topic.id,
      kind: 'topic',
      label: topic.label || topic.slug,
      weight: topic.count,
      topicIds: [topic.id],
      sourceIds: [],
      position: graphPosition(topic, 'topic', index),
    });
  }

  for (const [index, source] of memory.sources.entries()) {
    const resolved = lookup.sourcesById.get(source.id);

    nodes.push({
      id: graphSourceId(source.id),
      kind: 'source',
      label: source.title || source.id,
      sublabel: source.kind,
      weight: source.count,
      topicIds: [],
      sourceIds: [graphSourceId(source.id)],
      href: resolved?.href ?? null,
      routeable: resolved?.routeable ?? false,
      date: source.date,
      position: graphPosition(source, 'source', index),
    });
  }

  for (const edge of memory.edges) {
    if (!isKnownMemoryEndpoint(edge.from, lookup.thoughtsBySlug, lookup.topicsById) || !isKnownMemoryEndpoint(edge.to, lookup.thoughtsBySlug, lookup.topicsById)) {
      continue;
    }

    const from = lookup.thoughtsBySlug.has(edge.from) ? graphThoughtId(edge.from) : edge.from;
    const to = lookup.thoughtsBySlug.has(edge.to) ? graphThoughtId(edge.to) : edge.to;
    edges.push({
      id: `explicit:${edge.from}:${edge.type}:${edge.to}`,
      from,
      to,
      type: edge.type,
      confidence: edge.confidence,
      derived: false,
    });
  }

  for (const thought of memory.thoughts) {
    const from = graphThoughtId(thought.slug);

    for (const topicSlug of thought.topics) {
      const topicId = lookup.topicsBySlug.get(topicSlug)?.id ?? `topic:${topicSlug}`;
      edges.push({
        id: `derived-topic:${thought.slug}:${topicId}`,
        from,
        to: topicId,
        type: 'topic',
        confidence: 1,
        derived: true,
      });
    }

    for (const sourceId of thought.sources) {
      edges.push({
        id: `derived-source:${thought.slug}:${sourceId}`,
        from,
        to: graphSourceId(sourceId),
        type: 'source',
        confidence: 1,
        derived: true,
      });
    }
  }

  const topicFacets = memory.topics.map((topic) => ({
    id: topic.id,
    label: topic.label || topic.slug,
    count: topic.count,
  }));
  const sourceFacets = memory.sources.map((source) => {
    const resolved = lookup.sourcesById.get(source.id);

    return {
      id: graphSourceId(source.id),
      label: source.title || source.id,
      count: source.count,
      routeable: resolved?.routeable ?? false,
    };
  });

  return {
    nodes,
    edges,
    facets: {
      lenses: [
        { id: 'all', label: 'All', count: nodes.length },
        { id: 'topics', label: 'Topics', count: memory.thoughts.filter((thought) => thought.topics.length > 0).length + memory.topics.length },
        { id: 'sources', label: 'Sources', count: memory.thoughts.filter((thought) => thought.sources.length > 0).length + memory.sources.length },
        { id: 'theses', label: 'Theses', count: memory.thoughts.filter((thought) => thought.theses.length > 0).length },
        { id: 'external-vs-mine', label: 'External vs Mine', count: memory.thoughts.length + memory.sources.filter((source) => source.kind === 'external').length },
      ],
      topics: topicFacets,
      sources: sourceFacets,
      memoryTypes: countBy(memory.thoughts, (thought) => thought.memoryType),
      edgeTypes: countEdgeTypes(edges),
    },
    selectedFallback: memory.thoughts[0] ? graphThoughtId(memory.thoughts[0].slug) : null,
  };
}

export function filterMemoryGraphModel(
  model: MemoryGraphModel,
  filters: MemoryGraphFilterState,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  const activeLens = filters.activeLens ?? 'all';
  const activeTopicIds = new Set(filters.activeTopicIds ?? []);
  const activeSourceIds = new Set(filters.activeSourceIds ?? []);
  const activeMemoryTypes = new Set(filters.activeMemoryTypes ?? []);
  const activeEdgeTypes = new Set(filters.activeEdgeTypes ?? []);
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of model.nodes) {
    if (!nodeMatchesLens(node, activeLens)) {
      continue;
    }

    if (query && !nodeSearchText(node).includes(query)) {
      continue;
    }

    if (activeTopicIds.size > 0) {
      const matchesTopic = node.kind === 'topic'
        ? activeTopicIds.has(node.id)
        : node.topicIds.some((topicId) => activeTopicIds.has(topicId));

      if (!matchesTopic) {
        continue;
      }
    }

    if (activeSourceIds.size > 0) {
      const matchesSource = node.kind === 'source'
        ? activeSourceIds.has(node.id)
        : node.sourceIds.some((sourceId) => activeSourceIds.has(sourceId));

      if (!matchesSource) {
        continue;
      }
    }

    if (activeMemoryTypes.size > 0 && node.kind === 'thought' && (!node.memoryType || !activeMemoryTypes.has(node.memoryType))) {
      continue;
    }

    nodeIds.add(node.id);
  }

  for (const edge of model.edges) {
    if (activeEdgeTypes.size > 0 && !activeEdgeTypes.has(edge.type)) {
      continue;
    }

    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    edgeIds.add(edge.id);
  }

  return { nodeIds, edgeIds };
}

export interface ArticleMemoryLink {
  slug: string;
  claimKo: string;
  claimEn: string;
  memoryType: string;
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
  return {
    slug: thought.slug,
    claimKo: thought.claimKo,
    claimEn: thought.claimEn,
    memoryType: thought.memoryType,
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

export function loadPublicMemoryData(): MemoryPublicData {
  const modules = import.meta.glob('../data/memory.public.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Partial<MemoryPublicData>>;

  return normalizeMemoryData(modules['../data/memory.public.json']);
}
