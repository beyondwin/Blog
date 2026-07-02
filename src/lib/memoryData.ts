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
