import type { MemoryEdge, MemoryPublicData, MemorySource, MemoryThought, MemoryTopic } from './publicData';

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
