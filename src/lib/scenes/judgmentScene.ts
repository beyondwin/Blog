import { getContentByCollection } from '../content';
import { resolveContentMedia } from '../content/mediaRegistry';
import { loadPublicMemoryData } from '../memory/publicData';
import {
  resolvePublicScene,
  type PublicSceneDefinition,
  type PublicSceneResolution,
} from './publicScene';

export const judgmentSceneDefinition: PublicSceneDefinition = {
  id: 'judgment',
  slug: 'judgment',
  title: '판단',
  atmosphere: '#F2F4F7',
  lead: {
    id: 'reading-desk-cobalt',
    kind: 'article-media',
    role: 'lead',
    collection: 'articles',
    slug: 'why-i-read-in-the-ai-era',
    mediaId: 'reading-desk-cobalt',
    relationReason: '판단 장면의 중심 글',
  },
  support: [
    {
      id: 'judgment-scale',
      kind: 'article-media',
      role: 'support',
      collection: 'articles',
      slug: 'why-i-read-in-the-ai-era',
      mediaId: 'judgment-scale',
      relationReason: '같은 글에 포함된 판단의 그림',
    },
    {
      id: 'black-swan',
      kind: 'review',
      role: 'support',
      collection: 'reviews',
      slug: 'black-swan',
      relationReason: '예측과 설명을 의심하는 책',
    },
  ],
  context: [
    {
      id: 'reading-excerpt',
      kind: 'article-excerpt',
      role: 'context',
      collection: 'articles',
      slug: 'why-i-read-in-the-ai-era',
      text: '요약은 결론을 주고, 독서는 그 결론까지 가는 시간을 준다.',
      relationReason: '이 글에서 직접 남긴 문장',
    },
    {
      id: 'shared-reading-table',
      kind: 'article-media',
      role: 'hint',
      collection: 'articles',
      slug: 'why-i-read-in-the-ai-era',
      mediaId: 'shared-reading-table',
      relationReason: '같은 글에 포함된 함께 읽기의 장면',
    },
  ],
  approvedAt: '2026-08-22',
  approvedBy: 'author',
  version: 1,
};

export async function loadJudgmentScene(): Promise<PublicSceneResolution> {
  const [articles, reviews] = await Promise.all([
    getContentByCollection('articles'),
    getContentByCollection('reviews'),
  ]);

  return resolvePublicScene(judgmentSceneDefinition, {
    entries: [...articles, ...reviews],
    thoughts: loadPublicMemoryData().thoughts,
    resolveMedia: resolveContentMedia,
  });
}
