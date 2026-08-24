import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicRecord } from '@beyondwin/contracts';
import {
  loadVerifiedRelease,
  metadataForRecord,
  PageFrame,
  recordForRoute,
  staticParamsForCollection,
  type CandidateRelease,
} from '../../layout';

export const dynamicParams = false;

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
type RouteProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return staticParamsForCollection(await loadVerifiedRelease(), 'articles');
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const record = recordForRoute(await loadVerifiedRelease(), 'articles', slug);
  if (!record) notFound();
  return metadataForRecord(record);
}

export function ArticlePresentation({ record }: { record: ArticleRecord; release: CandidateRelease }) {
  const incumbentBodyHtml = record.bodyHtml.replace(
    /<small>beyondwin · <a href="[^"]+" rel="noreferrer">출처 · [^<]+<\/a><\/small>/gu,
    '',
  );
  return (
    <PageFrame currentPath={record.href} pageClass="press-page">
      <article className="press-sheet article-sheet">
        <header className="article-masthead">
          <p className="article-kicker">에세이</p>
          <h1>{record.title}</h1>
          <p className="article-judgment">{record.description}</p>
        </header>
        <div className="article-read">
          <div className="prose article-prose" dangerouslySetInnerHTML={{ __html: incumbentBodyHtml }} />
        </div>
      </article>
    </PageFrame>
  );
}

export default async function ArticlePage({ params }: RouteProps) {
  const { slug } = await params;
  const release = await loadVerifiedRelease();
  const record = recordForRoute(release, 'articles', slug);
  if (!record) notFound();
  return <ArticlePresentation record={record} release={release} />;
}
