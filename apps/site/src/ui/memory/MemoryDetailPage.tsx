import type { PublicRecord } from '@beyondwin/contracts';
import { ReadingThreshold } from '../reading/ReadingThreshold';

type MemoryRecord = Extract<PublicRecord, { collection: 'memory' }>;

export function MemoryDetailPage({ record }: { record: MemoryRecord }) {
  return (
    <article className="reading-sheet reading-detail memory-thought">
      <ReadingThreshold collection="memory" kindLabel="문장" title={record.claimKo} />
      <div className="reading-detail__body">
        {record.claimEn && <p className="memory-thought__en">{record.claimEn}</p>}
        <div className="reading-prose memory-thought__body" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
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
      </div>
    </article>
  );
}
