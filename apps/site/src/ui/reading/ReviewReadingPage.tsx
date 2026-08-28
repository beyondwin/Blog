import type { PublicRecord } from '@beyondwin/contracts';
import type { ReactNode } from 'react';
import { DetailActionRail } from '../editorial/DetailActionRail';
import { formatReviewDate } from '../reviews/bookshelfPresentation';
import type { ContinuationItem } from './select-continuations';

type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;

const CONTINUATION_LABELS: Record<ContinuationItem['kind'], string> = {
  analysis: '조사',
  article: '아티클',
  idea: '아이디어',
  review: '서평',
  travel: '여행',
  thought: '생각',
  memory: '기억',
};

function reviewEdition(record: ReviewRecord): string | undefined {
  return record.editionLabel ?? record.publisher;
}

function coverRightsLabel(record: ReviewRecord, hasCover: boolean): string {
  if (record.coverState === 'hold') return '표지 공개 보류';
  if (!record.readEditionVerified) return '판본 미확인 · 표지 없음';
  return hasCover ? '판본 및 표지 공개 승인' : '판본 확인 · 표지 공개 권리 미확인';
}

function ReviewContinuation({ items }: { items: readonly ContinuationItem[] }) {
  const visibleItems = items.slice(0, 3);
  return (
    <section className="continue-reading" aria-labelledby="continue-reading-title">
      <h2 id="continue-reading-title">이어서 읽기</h2>
      {visibleItems.length > 0 ? (
        <ol>
          {visibleItems.map((item) => (
            <li key={item.href}>
              <a href={item.href}>
                <span>{CONTINUATION_LABELS[item.kind]}</span>
                <strong>{item.title}</strong>
                <small>{item.reason}</small>
              </a>
            </li>
          ))}
        </ol>
      ) : null}
      <a className="continue-reading__collection" href="/reviews/">서평 전체 보기</a>
    </section>
  );
}

export function ReviewReadingPage({
  continuations,
  cover,
  record,
}: {
  continuations: readonly ContinuationItem[];
  cover?: ReactNode;
  record: ReviewRecord;
}) {
  const edition = reviewEdition(record);
  const verdict = record.verdict ?? record.description;
  const completedAt = record.completedAt ?? record.createdAt;

  return (
    <>
      <article className={`review-detail${cover ? ' review-detail--image-led' : ' review-detail--text-led'}`}>
        <header className="review-detail__hero">
          {cover ? (
            <figure className="review-detail__cover-stage" data-media-fit="contain">
              {cover}
            </figure>
          ) : null}
          <div className="review-detail__introduction">
            <p className="review-detail__lane">서평</p>
            <h1>{record.title}</h1>
            <div className="review-detail__identity">
              {record.authors.length > 0 ? <p>{record.authors.join(' · ')}</p> : null}
              {edition ? <p>{edition}</p> : null}
              <time dateTime={completedAt}>{formatReviewDate(completedAt)}</time>
              <p className="review-detail__rights">{coverRightsLabel(record, Boolean(cover))}</p>
            </div>
          </div>
        </header>
        <div className="editorial-detail-frame__body review-detail__body">
          <div className="editorial-detail-frame__actions">
            <DetailActionRail canonicalUrl={record.href} />
          </div>
          <div className="editorial-detail-frame__prose review-detail__prose">
            <p className="review-detail__verdict">{verdict}</p>
            <div className="prose" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
          </div>
        </div>
      </article>
      <ReviewContinuation items={continuations} />
    </>
  );
}
