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

export function loadPublicMemoryData(): MemoryPublicData {
  const modules = import.meta.glob('../data/memory.public.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Partial<MemoryPublicData>>;

  return normalizeMemoryData(modules['../data/memory.public.json']);
}
