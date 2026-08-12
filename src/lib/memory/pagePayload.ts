import type { MemoryPublicData } from './publicData';
import { buildMemoryGraphModel, prefixedSourceId, prefixedThoughtId, type MemoryGraphModel } from './graphModel';
import { buildMemoryLookup, type ResolvedMemorySource } from './lookup';

export interface MemoryDetailSource {
  id: string;
  title: string;
  href: string | null;
  routeable: boolean;
  unresolved?: boolean;
}

export interface MemoryDirectConnection {
  type: string;
  direction: 'inbound' | 'outbound';
  thought: {
    id: string;
    title: string;
  };
}

export interface MemoryPageDetail {
  id: string;
  kind: 'thought' | 'topic' | 'source';
  title: string;
  body: string;
  sublabel?: string;
  memoryType?: string;
  origin?: string;
  topics?: string[];
  theses?: string[];
  sources?: MemoryDetailSource[];
  relationships?: string[];
  directConnections?: MemoryDirectConnection[];
  href?: string | null;
  routeable?: boolean;
  sourceKind?: string;
  date?: string;
  thoughts?: Array<{ id: string; title: string }>;
}

export interface MemoryPagePayload {
  graph: MemoryGraphModel;
  details: Record<string, MemoryPageDetail>;
  fallbackRelationships: string[];
  topicIdsByLabel: Record<string, string>;
  sourcesById: Record<string, Pick<ResolvedMemorySource, 'href' | 'routeable'>>;
}

function relationshipLabel(edge: { from: string; to: string; type: string }, thoughtLabels: Map<string, string>, topicLabels: Map<string, string>): string {
  return `${edge.type}: ${memoryNodeLabel(edge.from, thoughtLabels, topicLabels)} -> ${memoryNodeLabel(edge.to, thoughtLabels, topicLabels)}`;
}

function memoryNodeLabel(id: string, thoughtLabels: Map<string, string>, topicLabels: Map<string, string>): string {
  return thoughtLabels.get(id) ?? topicLabels.get(id) ?? id;
}

export function buildMemoryPagePayload(memory: MemoryPublicData): MemoryPagePayload {
  const lookup = buildMemoryLookup(memory);
  const graph = buildMemoryGraphModel(memory);
  const thoughtLabels = new Map(memory.thoughts.map((thought) => [thought.slug, thought.claimKo]));
  const topicLabels = new Map(memory.topics.map((topic) => [topic.id, topic.label]));
  const strongestEdges = memory.edges
    .filter((edge) => edge.type !== 'topic-tag')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
  const thoughtDetails = Object.fromEntries(memory.thoughts.map((thought) => [
    prefixedThoughtId(thought.slug),
    {
      id: prefixedThoughtId(thought.slug),
      kind: 'thought',
      title: thought.claimKo,
      body: thought.body || thought.claimEn,
      sublabel: thought.claimEn,
      memoryType: thought.memoryType,
      origin: thought.origin,
      topics: thought.topics,
      theses: thought.theses,
      sources: (lookup.sourceRefsByThoughtSlug.get(thought.slug) ?? []).map((source) => ({
        id: source.id,
        title: source.title,
        href: source.href,
        routeable: source.routeable,
        unresolved: 'unresolved' in source ? source.unresolved : false,
      })),
      relationships: (lookup.edgesByThoughtSlug.get(thought.slug) ?? [])
        .filter((edge) => edge.type !== 'topic-tag')
        .map((edge) => relationshipLabel(edge, thoughtLabels, topicLabels)),
      directConnections: (lookup.edgesByThoughtSlug.get(thought.slug) ?? [])
        .flatMap((edge) => {
          const connectedSlug = edge.from === thought.slug ? edge.to : edge.from;
          const connectedThought = lookup.thoughtsBySlug.get(connectedSlug);

          if (!connectedThought) {
            return [];
          }

          return [{
            type: edge.type,
            direction: edge.from === thought.slug ? 'outbound' : 'inbound',
            thought: {
              id: prefixedThoughtId(connectedThought.slug),
              title: connectedThought.claimKo,
            },
          } satisfies MemoryDirectConnection];
        }),
    },
  ])) as Record<string, MemoryPageDetail>;
  const topicDetails = Object.fromEntries(memory.topics.map((topic) => [
    topic.id,
    {
      id: topic.id,
      kind: 'topic',
      title: topic.label,
      body: `${topic.count} public thoughts`,
      thoughts: memory.thoughts
        .filter((thought) => thought.topics.includes(topic.label))
        .map((thought) => ({
          id: prefixedThoughtId(thought.slug),
          title: thought.claimKo,
        })),
    },
  ])) as Record<string, MemoryPageDetail>;
  const sourceDetails = Object.fromEntries(memory.sources.map((source) => {
    const resolved = lookup.sourcesById.get(source.id);
    return [
      prefixedSourceId(source.id),
      {
        id: prefixedSourceId(source.id),
        kind: 'source',
        title: source.title,
        body: source.path ?? source.url ?? source.kind,
        href: resolved?.href ?? null,
        routeable: resolved?.routeable ?? false,
        sourceKind: source.kind,
        date: source.date,
        thoughts: memory.thoughts
          .filter((thought) => thought.sources.includes(source.id))
          .map((thought) => ({
            id: prefixedThoughtId(thought.slug),
            title: thought.claimKo,
          })),
      },
    ];
  })) as Record<string, MemoryPageDetail>;
  const topicIdsByLabel = Object.fromEntries(memory.topics.map((topic) => [topic.label, topic.id]));
  const sourcesById = Object.fromEntries(memory.sources.map((source) => {
    const resolved = lookup.sourcesById.get(source.id);
    return [source.id, { href: resolved?.href ?? null, routeable: resolved?.routeable ?? false }];
  }));

  return {
    graph,
    details: {
      ...thoughtDetails,
      ...topicDetails,
      ...sourceDetails,
    },
    fallbackRelationships: strongestEdges.map((edge) => relationshipLabel(edge, thoughtLabels, topicLabels)),
    topicIdsByLabel,
    sourcesById,
  };
}

export function getMemorySourceCountLabel(count: number): string {
  return count === 1 ? '1 source' : `${count} sources`;
}

export function getMemoryGraphEdgeCoordinates(
  graph: MemoryGraphModel,
  edge: { from: string; to: string } | undefined,
): { x1: number; y1: number; x2: number; y2: number } {
  const from = edge ? graph.nodes.find((node) => node.id === edge.from) : undefined;
  const to = edge ? graph.nodes.find((node) => node.id === edge.to) : undefined;

  return {
    x1: from?.position.x ?? 50,
    y1: from?.position.y ?? 50,
    x2: to?.position.x ?? 50,
    y2: to?.position.y ?? 50,
  };
}

const literaryMemoryMapPositions = [
  { x: 44, y: 16 },
  { x: 16, y: 38 },
  { x: 68, y: 38 },
  { x: 42, y: 58 },
  { x: 14, y: 76 },
  { x: 68, y: 76 },
  { x: 45, y: 94 },
] as const;

const literaryMemoryThoughtOrder = [
  'agent-harnesses-are-operating-systems',
  'agent-workflows-need-review-gates',
  'context-quality-is-routing-problem',
  'local-agent-products-are-work-shells',
  'ai-design-tools-need-judgment-loops',
  'memory-needs-retrieval-not-decoration',
  'personal-sites-should-show-records-first',
] as const;

export function getLiteraryMemoryMapPosition(index: number): { x: number; y: number } {
  return literaryMemoryMapPositions[index] ?? { x: 50, y: 50 };
}

export function sortLiteraryMemoryThoughts<T extends { slug: string }>(thoughts: T[]): T[] {
  const rank = new Map<string, number>(literaryMemoryThoughtOrder.map((slug, index) => [slug, index]));

  return thoughts
    .map((thought, index) => ({ thought, index }))
    .sort((a, b) => {
      const aRank = rank.get(a.thought.slug) ?? literaryMemoryThoughtOrder.length + a.index;
      const bRank = rank.get(b.thought.slug) ?? literaryMemoryThoughtOrder.length + b.index;
      return aRank - bRank;
    })
    .map(({ thought }) => thought);
}
