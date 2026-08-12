import type { CollectionEntry } from 'astro:content';

export type RecordsArticle = CollectionEntry<'articles'>;

interface Heading {
  depth: number;
  slug: string;
  text: string;
}

const approvedLeadId = 'uncle-bob-ai-code-review-evidence';
const approvedEntryOrder = [
  'shared-ai-conversation-evidence-boundaries',
  'aws-static-frontend-serverless-bff',
  'agents-md-vs-agent-skills-evidence',
  'oh-my-pi-deep-review',
  'graphify-code-knowledge-graph-deep-dive',
] as const;
const approvedTopicOrder = ['AI', 'code-review', 'source-grounded', 'testing'] as const;

function articleBody(entry: RecordsArticle): string {
  return 'body' in entry && typeof entry.body === 'string' ? entry.body : '';
}

function evidenceState(status: RecordsArticle['data']['status']): string {
  if (status === 'review') return '검토 중';
  if (status === 'archived') return '보관';
  return '발행';
}

function extractEvidenceSignals(body: string): string[] {
  return [
    /^#{2,3}\s+실제 구조$/m.test(body) && '구현',
    body.includes('명세') && '명세',
    /한계|반대/.test(body) && '반례',
    /^#{2,3}\s+확인한 자료$/m.test(body) && '원출처 확인',
    body.includes('재현') && '재현 절차 있음',
  ].filter((signal): signal is string => Boolean(signal));
}

function extractInlineEvidence(body: string): string | undefined {
  const formula = body.match(/`([^`\n]*(?:=|×|→)[^`\n]*)`/);
  return formula?.[1].trim();
}

function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

function selectTopics(lead?: RecordsArticle): string[] {
  if (!lead) return [];
  return approvedTopicOrder.filter((topic) => lead.data.tags.includes(topic));
}

function orderEntries(entries: RecordsArticle[]): RecordsArticle[] {
  const rank = new Map<string, number>(approvedEntryOrder.map((id, index) => [id, index]));
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (
      (rank.get(a.entry.id) ?? Number.MAX_SAFE_INTEGER)
      - (rank.get(b.entry.id) ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index
    ))
    .map(({ entry }) => entry);
}

export function buildRecordsPresentation(entries: RecordsArticle[]) {
  const lead = entries.find((entry) => entry.id === approvedLeadId) ?? entries[0];
  const remaining = lead ? entries.filter((entry) => entry.id !== lead.id) : [];

  return {
    lead: lead && {
      ...lead,
      evidenceState: evidenceState(lead.data.status),
      evidenceSignals: extractEvidenceSignals(articleBody(lead)),
      excerpt: extractInlineEvidence(articleBody(lead)),
    },
    entries: orderEntries(remaining),
    topics: selectTopics(lead),
    years: uniqueInOrder(
      entries.map((entry) => String(entry.data.updatedAt.getFullYear())),
    ),
    states: uniqueInOrder(entries.map((entry) => evidenceState(entry.data.status))),
  };
}

export function buildArticlePresentation(
  entry: RecordsArticle,
  candidates: RecordsArticle[],
  headings: Heading[],
) {
  const tags = new Set(entry.data.tags);
  const related = candidates
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => ({
      entry: candidate,
      sharedTopics: candidate.data.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ sharedTopics }) => sharedTopics > 0)
    .sort((a, b) => (
      b.sharedTopics - a.sharedTopics
      || b.entry.data.updatedAt.getTime() - a.entry.data.updatedAt.getTime()
    ))
    .slice(0, 3)
    .map(({ entry: relatedEntry }) => relatedEntry);
  const words = articleBody(entry).trim().split(/\s+/).filter(Boolean).length;

  return {
    toc: headings
      .filter((heading) => heading.depth === 2 || heading.depth === 3)
      .map((heading) => ({
        depth: heading.depth,
        href: `#${heading.slug}`,
        label: heading.text,
      })),
    readingMinutes: Math.max(1, Math.round(words / 260)),
    related,
  };
}

export function resolveTocTargetId(hash: string): string {
  return decodeURIComponent(hash.replace(/^#/, ''));
}
