import type { PublicRecord } from '@beyondwin/contracts';
import { type CriticalCssHandle, DocumentMetadata, metadataForRecord, PageFrame } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [
  currentParityDetailCss,
  currentParityArticleCss,
  currentParityDetailMobileCss,
  currentParityArticleMobileCss,
] = import.meta.env.SSR
  ? await Promise.all([
      import('../current-parity.detail.css?inline').then((module) => module.default),
      import('../current-parity.article.css?inline').then((module) => module.default),
      import('../current-parity.detail-mobile.css?inline').then((module) => module.default),
      import('../current-parity.article-mobile.css?inline').then((module) => module.default),
    ])
  : ['', '', '', ''];

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
export interface ArticleData { record: ArticleRecord }

export const handle: CriticalCssHandle = {
  currentParityCss: `${currentParityDetailCss}${currentParityArticleCss}${currentParityDetailMobileCss}${currentParityArticleMobileCss}`,
};

export async function loader({ params }: { params: { slug?: string } }): Promise<ArticleData> {
  const record = params.slug
    ? recordForRoute(await loadVerifiedRelease(), 'articles', params.slug)
    : null;
  if (!record) throw new Response('Not Found', { status: 404 });
  return { record };
}

export function meta({ data }: { data?: ArticleData }) {
  return data ? metadataForRecord(data.record) : [];
}

export function ArticlePresentation({ data }: { data: ArticleData }) {
  const incumbentBodyHtml = data.record.bodyHtml.replace(
    /<small>beyondwin · <a href="[^"]+" rel="noreferrer">출처 · [^<]+<\/a><\/small>/gu,
    '',
  );
  return (
    <>
      <DocumentMetadata
        canonical={data.record.href}
        description={data.record.description}
        title={`${data.record.title} · beyondwin`}
      />
      <PageFrame currentPath={data.record.href} pageClass="press-page">
      <article className="press-sheet article-sheet">
        <header className="article-masthead">
          <p className="article-kicker">에세이</p>
          <h1>{data.record.title}</h1>
          <p className="article-judgment">{data.record.description}</p>
        </header>
        <div className="article-read">
          <div className="prose article-prose" dangerouslySetInnerHTML={{ __html: incumbentBodyHtml }} />
        </div>
      </article>
      </PageFrame>
    </>
  );
}

export default function ArticleRoute({ loaderData }: { loaderData: ArticleData }) {
  return <ArticlePresentation data={loaderData} />;
}
