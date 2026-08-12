import type { ResolvedMedia } from './content/mediaRegistry';

export type LiterarySearchKind = 'technical' | 'reading' | 'memory' | 'topic';
export type LiteraryMatchedField = 'title' | 'description' | 'topic';

export interface LiterarySearchRecord {
  id: string;
  kind: LiterarySearchKind;
  title: string;
  description: string;
  topics: string[];
  href: string;
  date?: string;
  media?: ResolvedMedia;
  coverState?: 'verified' | 'hold';
}

export interface LiterarySearchMatch {
  record: LiterarySearchRecord;
  matchedField: LiteraryMatchedField;
  matchReason: string;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ko');
}

function humanField(field: LiteraryMatchedField, kind: LiterarySearchKind): string {
  if (field === 'title' && kind === 'reading') return '책 제목';
  if (field === 'title' && kind === 'memory') return '기억 문장';
  if (field === 'title') return '제목';
  if (field === 'description') return '설명';
  return '주제';
}

export function buildSearchMatches(
  records: LiterarySearchRecord[],
  query: string,
): LiterarySearchMatch[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const matches: LiterarySearchMatch[] = [];
  for (const record of records) {
    let matchedField: LiteraryMatchedField | null = null;
    if (normalize(record.title).includes(normalizedQuery)) {
      matchedField = 'title';
    } else if (normalize(record.description).includes(normalizedQuery)) {
      matchedField = 'description';
    } else if (record.topics.some((topic) => normalize(topic).includes(normalizedQuery))) {
      matchedField = 'topic';
    }

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

export function summarizeSearchMatches(matches: LiterarySearchMatch[]) {
  return matches.reduce(
    (summary, match) => {
      summary.total += 1;
      summary[match.record.kind] += 1;
      return summary;
    },
    { total: 0, technical: 0, reading: 0, memory: 0, topic: 0 },
  );
}
