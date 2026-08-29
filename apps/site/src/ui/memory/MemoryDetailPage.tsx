import type { PublicRecord } from '@beyondwin/contracts';
import { DetailActionRail } from '../editorial/DetailActionRail';
import { EditorialDetailFrame } from '../editorial/EditorialDetailFrame';
import { ContextReturn } from '../reading/ContextReturn';

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;

export function MemoryDetailPage({ record }: { record: MemoryRecord }) {
  return (
    <EditorialDetailFrame
      title={record.claimKo}
      summary={record.claimEn}
      metadata={<span>남는 문장</span>}
      actions={(
        <>
          <ContextReturn collection="memory" />
          <DetailActionRail canonicalUrl={record.href} />
        </>
      )}
    >
      <div className="prose memory-thought__body" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      {record.sources.length > 0 && (
        <section className="memory-thought__sources">
          <h2>이 문장이 나온 글</h2>
          <ul>{record.sources.map((source) => <li key={source.href}><a href={source.href}>{source.title}</a></li>)}</ul>
        </section>
      )}
      {record.companions.length > 0 && (
        <section className="memory-thought__companions">
          <h2>같이 붙는 문장</h2>
          <ul>{record.companions.map((item) => <li key={item.href}><a href={item.href}>{item.claimKo}</a></li>)}</ul>
        </section>
      )}
    </EditorialDetailFrame>
  );
}
