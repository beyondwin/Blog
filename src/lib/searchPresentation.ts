import type { ResolvedMedia } from './content/mediaRegistry';

export type SearchKind = 'writing' | 'book' | 'sentence' | 'topic';
export type LiteraryMatchedField = 'title' | 'description' | 'topic';

export const searchGroupLabel = {
  writing: '글',
  book: '책',
  sentence: '문장',
  topic: '주제',
} as const;

export interface SearchRecord {
  id: string;
  kind: SearchKind;
  title: string;
  description: string;
  topics: string[];
  href: string;
  date?: string;
  media?: ResolvedMedia;
  coverState?: 'verified' | 'hold';
}

export interface SearchMatch {
  record: SearchRecord;
  matchedField: LiteraryMatchedField;
  matchReason: string;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ko');
}

export function matchLiterarySearchFields(
  record: Pick<SearchRecord, 'title' | 'description' | 'topics'>,
  query: string,
): LiteraryMatchedField | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  if (normalize(record.title).includes(normalizedQuery)) return 'title';
  if (normalize(record.description).includes(normalizedQuery)) return 'description';
  if (record.topics.some((topic) => normalize(topic).includes(normalizedQuery))) return 'topic';
  return null;
}

function humanField(field: LiteraryMatchedField, kind: SearchKind): string {
  if (field === 'title' && kind === 'book') return '책 제목';
  if (field === 'title' && kind === 'sentence') return '문장';
  if (field === 'title') return '제목';
  if (field === 'description') return '설명';
  return '주제';
}

export function buildSearchInventory(records: SearchRecord[]): SearchRecord[] {
  return [...records];
}

export function buildSearchMatches(
  records: SearchRecord[],
  query: string,
): SearchMatch[] {
  if (!normalize(query)) return [];

  const matches: SearchMatch[] = [];
  for (const record of records) {
    const matchedField = matchLiterarySearchFields(record, query);

    if (matchedField) {
      matches.push({
        record,
        matchedField,
        matchReason: `${humanField(matchedField, record.kind)}에서 “${query.trim()}” 일치`,
      });
    }
  }
  return matches;
}

export function summarizeSearchMatches(matches: SearchMatch[]) {
  return matches.reduce(
    (summary, match) => {
      summary.total += 1;
      summary[match.record.kind] += 1;
      return summary;
    },
    { total: 0, writing: 0, book: 0, sentence: 0, topic: 0 },
  );
}
