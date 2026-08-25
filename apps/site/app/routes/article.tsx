import type { PublicRecord } from '@beyondwin/contracts';
import { SiteShell } from '../../src/ui/components/SiteShell';
import { type RouteCriticalCssHandle, DocumentMetadata, metadataForRecord } from '../root';
import { loadVerifiedRelease, recordForRoute } from '../release.server';

const [readingCss, articleCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../../src/ui/styles/route-reading.css?inline').then((module) => module.default),
      import('../../src/ui/styles/route-article.css?inline').then((module) => module.default),
    ])
  : ['', ''];

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
export interface ArticleData { record: ArticleRecord }

export const handle: RouteCriticalCssHandle = {
  criticalCss: `${readingCss}${articleCss}`,
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
      <SiteShell mode="reading" currentSection="articles">
      <article className="reading-sheet article-sheet">
        <header className="article-masthead">
          <p className="article-kicker">에세이</p>
          <h1>{data.record.title}</h1>
          <p className="article-judgment">{data.record.description}</p>
        </header>
        <div className="article-read">
          <div className="prose article-prose" dangerouslySetInnerHTML={{ __html: incumbentBodyHtml }} />
        </div>
      </article>
      </SiteShell>
    </>
  );
}

export default function ArticleRoute({ loaderData }: { loaderData: ArticleData }) {
  return <ArticlePresentation data={loaderData} />;
}
