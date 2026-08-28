import type { SearchInventoryItem } from './SearchPage';

export interface PopularKeyword {
  count: number;
  href: string;
  label: string;
}

const MAX_PUBLIC_KEYWORDS = 8;
const EXCLUDED_TAGS = new Set(['published', 'review', 'source-grounded']);
const KOREAN_TAG_LABELS: Readonly<Record<string, string>> = {
  agent: '에이전트',
  agents: '에이전트',
  'ai-agent': 'AI 에이전트',
  architecture: '아키텍처',
  automation: '자동화',
  book: '독서',
  coding: '코딩',
  database: '데이터베이스',
  design: '디자인',
  essay: '에세이',
  evidence: '근거',
  frontend: '프론트엔드',
  judgment: '판단',
  'naver-archive': '서평',
  reading: '읽기',
  reference: '레퍼런스',
  research: '리서치',
  search: '검색',
  security: '보안',
  'system-design': '시스템 설계',
  testing: '검증',
  workflow: '워크플로',
};

export interface NormalizedPublicSearchTag {
  key: string;
  label: string;
  raw: string;
}

export function normalizePublicSearchTag(tag: string): NormalizedPublicSearchTag | null {
  const raw = tag.trim();
  const key = raw.toLocaleLowerCase('en-US');
  if (!key || EXCLUDED_TAGS.has(key)) return null;
  return { key, label: KOREAN_TAG_LABELS[key] ?? raw, raw };
}

function keywordHref(label: string): string {
  return `/search/?${new URLSearchParams({ q: label }).toString()}`;
}

export function popularKeywords(
  inventory: readonly SearchInventoryItem[],
  limit = MAX_PUBLIC_KEYWORDS,
): PopularKeyword[] {
  const counts = new Map<string, number>();
  for (const item of inventory) {
    const labelsForRecord = new Set<string>();
    for (const tag of item.topics) {
      const normalized = normalizePublicSearchTag(tag);
      if (!normalized) continue;
      labelsForRecord.add(normalized.label);
    }
    for (const label of labelsForRecord) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([label, count]) => ({ count, href: keywordHref(label), label }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ko'))
    .slice(0, Math.max(0, Math.min(MAX_PUBLIC_KEYWORDS, limit)));
}
