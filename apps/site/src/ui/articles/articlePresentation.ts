import type { PublicRecord } from '@beyondwin/contracts';

export const PREFERRED_PUBLIC_ARTICLE_LEAD_ID = 'graphify-code-knowledge-graph-deep-dive';
export type ArticleSpecies = '조사' | '에세이';
export type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
export interface ArticleTocItem { href: string; label: string }
export interface ArticleIndexItem {
  id: string;
  href: string;
  title: string;
  stake: string;
  monthLabel: string;
  species: ArticleSpecies;
  hasEvidence: boolean;
}
export interface ArticleReadingPresentation {
  species: ArticleSpecies;
  kicker: string;
  stake: string;
  toc: ArticleTocItem[];
  proseHtml: string;
  colophonHtml?: string;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

export function articleSpecies(record: Pick<ArticleRecord, 'evidenceState' | 'tags'>): ArticleSpecies {
  return record.evidenceState === 'source-grounded' || record.tags.includes('source-grounded')
    ? '조사'
    : '에세이';
}

export function articleStake(record: Pick<ArticleRecord, 'bodyHtml' | 'description'>): string {
  const firstParagraph = record.bodyHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  const emphasis = firstParagraph.match(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  return (emphasis ? stripTags(emphasis) : '') || record.description;
}

export function articleReadingMinutes(bodyHtml: string): number {
  const words = stripTags(bodyHtml).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 260));
}

export function splitArticleBody(bodyHtml: string): {
  proseHtml: string;
  toc: ArticleTocItem[];
  colophonHtml?: string;
} {
  const heading = /<h2 id="([^"]*)">([\s\S]*?)<\/h2>/gi;
  let colophonAt = -1;
  for (const match of bodyHtml.matchAll(heading)) {
    const id = match[1] ?? '';
    const label = stripTags(match[2] ?? '');
    if (id === '확인한-자료' || label === '확인한 자료') {
      colophonAt = match.index ?? -1;
      break;
    }
  }
  const proseHtml = colophonAt >= 0 ? bodyHtml.slice(0, colophonAt) : bodyHtml;
  const colophonHtml = colophonAt >= 0 ? bodyHtml.slice(colophonAt) : undefined;
  const toc = [...proseHtml.matchAll(/<h2 id="([^"]*)">([\s\S]*?)<\/h2>/gi)]
    .map((match) => ({ href: `#${match[1]}`, label: stripTags(match[2] ?? '') }))
    .filter((item) => item.href.length > 1 && item.label.length > 0);
  return colophonHtml === undefined ? { proseHtml, toc } : { proseHtml, toc, colophonHtml };
}

export function buildArticleIndex(records: readonly ArticleRecord[]): {
  lead?: ArticleIndexItem;
  ledger: ArticleIndexItem[];
} {
  if (records.length === 0) return { ledger: [] };
  const preferred = records.find((record) => record.id === PREFERRED_PUBLIC_ARTICLE_LEAD_ID);
  const leadRecord = preferred ?? [...records].sort((left, right) => {
    const date = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return date || left.id.localeCompare(right.id);
  })[0];
  const toItem = (record: ArticleRecord): ArticleIndexItem => {
    const species = articleSpecies(record);
    return {
      id: record.id,
      href: record.href,
      title: record.title,
      stake: articleStake(record),
      monthLabel: `${new Date(record.updatedAt).getUTCMonth() + 1}월`,
      species,
      hasEvidence: species === '조사',
    };
  };
  return {
    lead: toItem(leadRecord),
    ledger: records.filter((record) => record.id !== leadRecord.id).map(toItem),
  };
}

export function articleReadingPresentation(record: ArticleRecord): ArticleReadingPresentation {
  const species = articleSpecies(record);
  const split = splitArticleBody(record.bodyHtml);
  return {
    species,
    kicker: species === '조사' ? `조사 · ${articleReadingMinutes(record.bodyHtml)}분` : species,
    stake: articleStake(record),
    toc: species === '조사' && split.toc.length >= 2 ? split.toc : [],
    proseHtml: split.proseHtml,
    ...(split.colophonHtml ? { colophonHtml: split.colophonHtml } : {}),
  };
}
