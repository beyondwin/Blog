import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { useEffect, useState } from 'react';
import { ResponsivePicture } from '../../../app/root';
import { EditorialListRow } from '../editorial/EditorialListRow';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';
import { recordAnchor } from '../navigation/record-anchor';
import { formatArticleDate, type ArticleRecord } from './articlePresentation';
import {
  ARTICLE_TOPIC_FILTERS,
  articleTopic,
  articleTopicHref,
  normalizeArticleTopic,
  type ArticleTopicFilter,
} from './articleTopics';

type ReleaseAsset = PublicReleaseManifest['assets'][string];

export function browserArticleTopic(fallback: ArticleTopicFilter, search?: string): ArticleTopicFilter {
  if (search === undefined) return fallback;
  return normalizeArticleTopic(new URLSearchParams(search).get('topic'));
}

export function ArticleIndexPage({
  assets = new Map(),
  records,
  selectedTopic = '전체',
}: {
  assets?: ReadonlyMap<string, ReleaseAsset>;
  records: readonly ArticleRecord[];
  selectedTopic?: ArticleTopicFilter;
}) {
  const [visibleTopic, setVisibleTopic] = useState(selectedTopic);
  useEffect(() => {
    setVisibleTopic(browserArticleTopic(selectedTopic, window.location.search));
  }, [selectedTopic]);
  const classified = records.map((record) => ({ record, topic: articleTopic(record.id) }));
  const visible = visibleTopic === '전체'
    ? classified
    : classified.filter((item) => item.topic === visibleTopic);
  let renderedMedia = 0;

  return (
    <section className="article-index">
      <EditorialPageHeader
        title="아티클"
        description="기술과 디자인, 에이전트와 시스템을 실제 근거와 오래 남는 판단으로 다룹니다."
      >
        <nav className="article-topic-filter" aria-label="아티클 주제">
          {ARTICLE_TOPIC_FILTERS.map((topic) => (
            <a
              key={topic}
              href={articleTopicHref(topic)}
              aria-current={visibleTopic === topic ? 'page' : undefined}
            >
              {topic}
            </a>
          ))}
        </nav>
      </EditorialPageHeader>
      {visible.length > 0 ? (
        <ol className="article-index__ledger">
          {visible.map(({ record }) => {
            const asset = record.featuredMedia
              ? assets.get(`articles/${record.id}/${record.featuredMedia}`)
              : undefined;
            const eager = asset ? renderedMedia++ === 0 : false;
            const media = asset ? (
              <ResponsivePicture
                asset={asset}
                alt={asset.alt}
                eager={eager}
                sizes="(max-width: 767px) 100vw, (max-width: 1179px) 37vw, 430px"
              />
            ) : undefined;
            return (
              <li key={record.id} id={recordAnchor('articles', record.id)}>
                <EditorialListRow
                  href={record.href}
                  title={record.title}
                  description={record.description}
                  date={formatArticleDate(record.updatedAt)}
                  media={media}
                />
              </li>
            );
          })}
        </ol>
      ) : <p className="article-index__empty">이 주제에 공개된 아티클이 없습니다.</p>}
    </section>
  );
}
