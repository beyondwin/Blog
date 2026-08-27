import { OriginLink } from '../navigation/OriginLink';
import { recordAnchor } from '../navigation/record-anchor';
import {
  buildArticleIndex,
  type ArticleIndexItem,
  type ArticleRecord,
} from './articlePresentation';

function kindLabel(item: ArticleIndexItem): string {
  return item.hasEvidence ? '조사 · 근거' : '에세이';
}

export function ArticleIndexPage({ records }: { records: readonly ArticleRecord[] }) {
  const { lead, ledger } = buildArticleIndex(records);
  if (!lead) {
    return (
      <section className="reading-sheet article-index">
        <p>아직 공개한 글이 없습니다.</p>
      </section>
    );
  }

  const leadAnchorId = recordAnchor('articles', lead.id);
  return (
    <section className="reading-sheet article-index">
      <OriginLink
        className="article-lead"
        href={lead.href}
        id={leadAnchorId}
        origin={{ kind: 'articles', anchorId: leadAnchorId }}
      >
        <p className="article-kicker">{kindLabel(lead)}</p>
        <h1>{lead.title}</h1>
        <p>{lead.stake}</p>
      </OriginLink>
      {ledger.length > 0 ? (
        <ol className="article-ledger">
          {ledger.map((item) => {
            const anchorId = recordAnchor('articles', item.id);
            return (
              <li key={item.id} id={anchorId}>
                <OriginLink href={item.href} origin={{ kind: 'articles', anchorId }}>
                  <span className="article-ledger__month">{item.monthLabel}</span>
                  <span className="article-ledger__copy">
                    <span className="article-ledger__title">{item.title}</span>
                    <span className="article-ledger__stake">{item.stake}</span>
                  </span>
                  <span className="article-ledger__kind">{kindLabel(item)}</span>
                </OriginLink>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
