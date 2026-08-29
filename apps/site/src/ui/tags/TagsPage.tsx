import { RecordRow, type RecordSummary } from '../collections/RecordRow';
import { EditorialPageHeader } from '../editorial/EditorialPageHeader';

export interface PublicTag { label: string; href: string; count: number }

type TagsPageProps = {
  records?: readonly RecordSummary[];
  selectedTag: string;
  tags?: never;
} | {
  records?: never;
  selectedTag?: never;
  tags: readonly PublicTag[];
};

export function TagsPage(props: TagsPageProps) {
  if (props.selectedTag !== undefined) {
    const { records = [], selectedTag } = props;
    return (
      <section className="secondary-index tags-page tags-page--detail" aria-label={`${selectedTag} 태그`}>
        <EditorialPageHeader title={selectedTag} description={`${selectedTag}로 이어진 공개 기록.`} />
        {records.length > 0 ? (
          <ol className="secondary-index__ledger record-list">
            {records.map((record) => <RecordRow key={`${record.collection}/${record.id}`} record={record} originKind="tags" />)}
          </ol>
        ) : <p className="collection-page__empty">이 단어로 이어진 글이 없습니다.</p>}
        <a className="tags-page__back" href="/tags/">태그 전체 보기</a>
      </section>
    );
  }
  const { tags } = props;
  return (
    <section className="secondary-index tags-page" aria-label="이어진 단어">
      <EditorialPageHeader title="이어진 단어" description="공개한 기록에서 실제로 쓰인 태그입니다." />
      <ul className="tags-page__index">
        {tags.map((tag) => <li key={tag.label}><a href={tag.href}>{tag.label}<span>{tag.count}</span></a></li>)}
      </ul>
      <p className="tags-page__sentences"><a href="/memory/">남는 문장</a></p>
    </section>
  );
}
