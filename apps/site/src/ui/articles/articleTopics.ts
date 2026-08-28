import type { PublicRecord } from '@beyondwin/contracts';

export const ARTICLE_TOPICS = {
  'agents-md-vs-agent-skills-evidence': '검증',
  'ai-design-references': '디자인',
  'andrej-karpathy-skills-analysis': '에이전트',
  'aws-static-frontend-serverless-bff': '아키텍처',
  'codex-ui-mockup-workflow': '디자인',
  'context-refinement-system-design': '에이전트',
  'graphify-code-knowledge-graph-deep-dive': '데이터',
  'hermes-agent-persistent-worker-runtime': '에이전트',
  'karpathy-delete-everything-keep-graph': '아키텍처',
  'lazycodex-agent-harness-analysis': '에이전트',
  'oh-my-pi-deep-review': '검증',
  'open-design-repo-analysis': '디자인',
  'pgvector-hybrid-search': '데이터',
  'ponytail-agent-minimalism-analysis': '에이전트',
  'postgresql-bm25-pg-search': '데이터',
  'shared-ai-conversation-evidence-boundaries': '검증',
  'uncle-bob-ai-code-review-evidence': '검증',
} as const;

export type ArticleTopic = (typeof ARTICLE_TOPICS)[keyof typeof ARTICLE_TOPICS];
export type ArticleTopicFilter = ArticleTopic | '전체';
type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;

export const ARTICLE_TOPIC_FILTERS = [
  '전체',
  '에이전트',
  '디자인',
  '데이터',
  '아키텍처',
  '검증',
] as const satisfies readonly ArticleTopicFilter[];

export function articleTopic(id: string): ArticleTopic {
  const topic = ARTICLE_TOPICS[id as keyof typeof ARTICLE_TOPICS];
  if (!topic) throw new Error(`unclassified public article: ${id}`);
  return topic;
}

export function normalizeArticleTopic(value: string | null | undefined): ArticleTopicFilter {
  return ARTICLE_TOPIC_FILTERS.includes(value as ArticleTopicFilter)
    ? value as ArticleTopicFilter
    : '전체';
}

export function articleTopicHref(topic: ArticleTopicFilter): string {
  return topic === '전체' ? '/articles/' : `/articles/?topic=${encodeURIComponent(topic)}`;
}

export function assertCompleteArticleInventory(records: readonly ArticleRecord[]): void {
  const actual = new Set(records.map((record) => record.id));
  const expected = Object.keys(ARTICLE_TOPICS);
  const missing = expected.filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !Object.hasOwn(ARTICLE_TOPICS, id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`public article inventory must match the 17-topic map (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
  }
}
