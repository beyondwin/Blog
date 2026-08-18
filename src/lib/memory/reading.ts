import { memoryThoughtHref } from '../siteChrome';
import { buildMemoryLookup, type ResolvedMemorySource, type UnresolvedMemorySource } from './lookup';
import type { MemoryPublicData, MemoryThought } from './publicData';

export interface MemoryReadingEntry {
  slug: string;
  claimKo: string;
  body: string;
  href: string;
  cluster: 'habit' | 'record';
}

export interface MemoryThoughtPage {
  slug: string;
  claimKo: string;
  claimEn?: string;
  body: string;
  sourceWritings: Array<{ title: string; href: string }>;
  companionSentences: Array<{ slug: string; claimKo: string; href: string }>;
}

const habitSlugs = [
  'agent-harnesses-are-operating-systems',
  'agent-workflows-need-review-gates',
  'context-quality-is-routing-problem',
  'local-agent-products-are-work-shells',
] as const;

const recordSlugs = [
  'ai-design-tools-need-judgment-loops',
  'memory-needs-retrieval-not-decoration',
  'personal-sites-should-show-records-first',
] as const;

const habitSlugSet = new Set<string>(habitSlugs);
const readingRank = new Map<string, number>(
  [...habitSlugs, ...recordSlugs].map((slug, index) => [slug, index]),
);

function readingCluster(slug: string): 'habit' | 'record' {
  return habitSlugSet.has(slug) ? 'habit' : 'record';
}

export function sortMemoryReading(thoughts: MemoryThought[]): MemoryReadingEntry[] {
  return thoughts
    .map((thought, index) => ({ thought, index }))
    .sort((a, b) => {
      const aCluster = readingCluster(a.thought.slug);
      const bCluster = readingCluster(b.thought.slug);

      if (aCluster !== bCluster) {
        return aCluster === 'habit' ? -1 : 1;
      }

      const aRank = readingRank.get(a.thought.slug) ?? Number.POSITIVE_INFINITY;
      const bRank = readingRank.get(b.thought.slug) ?? Number.POSITIVE_INFINITY;

      if (aRank !== bRank) {
        return aRank - bRank;
      }

      return a.index - b.index;
    })
    .map(({ thought }) => ({
      slug: thought.slug,
      claimKo: thought.claimKo,
      body: thought.body,
      href: memoryThoughtHref(thought.slug),
      cluster: readingCluster(thought.slug),
    }));
}

function isExcludedWritingPath(path: string | undefined): boolean {
  if (!path) {
    return false;
  }

  if (path === 'DESIGN.md' || path.startsWith('docs/')) {
    return true;
  }

  return path.startsWith('src/') && !path.startsWith('src/content/');
}

function toSourceWriting(
  source: ResolvedMemorySource | UnresolvedMemorySource,
): { title: string; href: string } | null {
  if (!source.routeable || !source.href?.startsWith('/')) {
    return null;
  }

  if ('path' in source && isExcludedWritingPath(source.path)) {
    return null;
  }

  return {
    title: source.title,
    href: source.href,
  };
}

export function buildMemoryThoughtPage(
  memory: MemoryPublicData,
  slug: string,
): MemoryThoughtPage | null {
  const lookup = buildMemoryLookup(memory);
  const thought = lookup.thoughtsBySlug.get(slug);

  if (!thought) {
    return null;
  }

  const sourceWritings = (lookup.sourceRefsByThoughtSlug.get(slug) ?? [])
    .map(toSourceWriting)
    .filter((source): source is { title: string; href: string } => source !== null);

  const companionSentences: MemoryThoughtPage['companionSentences'] = [];
  const seenCompanions = new Set<string>();

  for (const edge of lookup.edgesByThoughtSlug.get(slug) ?? []) {
    const companionSlug = edge.from === slug ? edge.to : edge.from;

    if (companionSlug === slug || seenCompanions.has(companionSlug)) {
      continue;
    }

    const companion = lookup.thoughtsBySlug.get(companionSlug);

    if (!companion) {
      continue;
    }

    seenCompanions.add(companionSlug);
    companionSentences.push({
      slug: companion.slug,
      claimKo: companion.claimKo,
      href: memoryThoughtHref(companion.slug),
    });
  }

  const page: MemoryThoughtPage = {
    slug: thought.slug,
    claimKo: thought.claimKo,
    body: thought.body,
    sourceWritings,
    companionSentences,
  };

  if (thought.claimEn) {
    page.claimEn = thought.claimEn;
  }

  return page;
}
