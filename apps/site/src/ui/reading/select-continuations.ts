import type { PublicRecord } from '@beyondwin/contracts';

export type ContinuationKind = 'analysis' | 'article' | 'idea' | 'review' | 'travel' | 'memory';

export interface ContinuationItem {
  href: string;
  title: string;
  reason: string;
  kind: ContinuationKind;
}

const KIND_BY_COLLECTION: Record<PublicRecord['collection'], ContinuationKind> = {
  analysis: 'analysis',
  articles: 'article',
  ideas: 'idea',
  reviews: 'review',
  travel: 'travel',
  memory: 'memory',
};

function recordKey(record: PublicRecord): string {
  return `${record.collection}/${record.id}`;
}

function itemFor(target: PublicRecord, reason: string): ContinuationItem {
  return {
    href: target.href,
    title: target.title,
    reason: reason.trim(),
    kind: KIND_BY_COLLECTION[target.collection],
  };
}

export function selectContinuations(
  record: PublicRecord,
  publicIndex: Readonly<Record<string, PublicRecord>>,
): ContinuationItem[] {
  const currentKey = recordKey(record);
  const seen = new Set<string>([currentKey]);
  const selected: ContinuationItem[] = [];

  const append = (targetKey: string, reason: unknown, expectedHref?: string) => {
    if (selected.length >= 3 || seen.has(targetKey) || typeof reason !== 'string' || reason.trim() === '') return;
    const target = publicIndex[targetKey];
    if (target === undefined || recordKey(target) !== targetKey || (expectedHref !== undefined && target.href !== expectedHref)) return;
    seen.add(targetKey);
    selected.push(itemFor(target, reason));
  };

  for (const relationship of record.relationships) {
    append(relationship.target, relationship.reason);
    if (selected.length >= 3) return selected;
  }

  for (const link of record.memoryLinks) {
    append(`memory/${link.slug}`, link.claimKo, link.href);
    if (selected.length >= 3) break;
  }

  return selected;
}
