import { join, resolve } from 'node:path';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { isPublicRecord, type PublicRecord } from '@beyondwin/contracts';
import {
  type PublicReleaseManifest,
  type VerifiedActivePublicRelease,
} from '@beyondwin/content/release';
import {
  PUBLIC_RELEASE_BINDING_ENV,
  readBoundActiveRelease,
} from '../release-binding';
import './current-parity.css';

export type CandidateRelease = Pick<VerifiedActivePublicRelease, 'manifest' | 'releasePath'>;
export type CandidateCollection = 'articles' | 'reviews' | 'memory';
export type CandidateRecord<C extends CandidateCollection> = Extract<PublicRecord, { collection: C }>;

const PUBLIC_NAV = [
  { href: '/', label: '장면' },
  { href: '/articles/', label: '글' },
  { href: '/reviews/', label: '책' },
  { href: '/search/', label: '찾기' },
] as const;

export const metadata: Metadata = {
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
};

function repositoryRoot(): string {
  const cwd = resolve(process.cwd());
  return cwd.endsWith('/spikes/site-next') ? resolve(cwd, '../..') : cwd;
}

let verifiedReleasePromise: Promise<VerifiedActivePublicRelease> | undefined;

export function loadVerifiedRelease(): Promise<VerifiedActivePublicRelease> {
  verifiedReleasePromise ??= readBoundActiveRelease(
    join(repositoryRoot(), 'build/public-releases'),
    process.env[PUBLIC_RELEASE_BINDING_ENV],
  );
  return verifiedReleasePromise;
}

function hasRawPublicationState(record: object): record is object & { status?: unknown; draft?: unknown } {
  return Object.hasOwn(record, 'status') || Object.hasOwn(record, 'draft');
}

function hasPublicPublicationState(record: PublicRecord): boolean {
  if (!hasRawPublicationState(record)) return true;
  const state = record as PublicRecord & { status?: unknown; draft?: unknown };
  return isPublicRecord({ status: state.status, draft: state.draft });
}

export function staticParamsForCollection(
  release: CandidateRelease,
  collection: CandidateCollection,
): Array<{ slug: string }> {
  return Object.values(release.manifest.records)
    .filter((record) => record.collection === collection)
    .filter(hasPublicPublicationState)
    .filter((record) => record.href === `/${collection}/${record.id}/`)
    .map((record) => ({ slug: record.id }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function recordForRoute<C extends CandidateCollection>(
  release: CandidateRelease,
  collection: C,
  slug: string,
): CandidateRecord<C> | null {
  const record = release.manifest.records[`${collection}/${slug}`];
  return record?.collection === collection && record.href === `/${collection}/${slug}/`
    ? record as CandidateRecord<C>
    : null;
}

export function metadataForRecord(record: PublicRecord): Metadata {
  return {
    title: `${record.title} · beyondwin`,
    description: record.description,
    alternates: { canonical: record.href },
  };
}

type ReleaseAsset = PublicReleaseManifest['assets'][string];

function srcSet(candidates: ReleaseAsset['fallback']['candidates']): string {
  return candidates.map((candidate) => `${candidate.src} ${candidate.width}w`).join(', ');
}

export function ResponsivePicture({
  asset,
  alt,
  className,
  eager = false,
  sizes,
}: {
  asset: ReleaseAsset;
  alt: string;
  className?: string;
  eager?: boolean;
  sizes: string;
}) {
  return (
    <picture>
      {asset.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={srcSet(source.candidates)} sizes={sizes} />
      ))}
      <img
        className={className}
        src={asset.fallback.src}
        srcSet={srcSet(asset.fallback.candidates)}
        sizes={sizes}
        width={asset.width}
        height={asset.height}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}

function isCurrent(currentPath: string, href: string): boolean {
  return href === '/' ? currentPath === href : currentPath.startsWith(href);
}

export function SiteHeader({ currentPath }: { currentPath: string }) {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <div className="site-header__lead">
          <a className="brand" href="/" aria-label="beyondwin home">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__text">beyondwin</span>
          </a>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {PUBLIC_NAV.map((item) => (
            <a key={item.href} href={item.href} aria-current={isCurrent(currentPath, item.href) ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <details className="nav-drawer">
          <summary aria-label="메뉴"><span aria-hidden="true" /></summary>
          <nav aria-label="모바일 주 탐색">
            {PUBLIC_NAV.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© beyondwin</span>
      <nav aria-label="하단 탐색">
        {PUBLIC_NAV.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
      </nav>
    </footer>
  );
}

export function PageFrame({
  currentPath,
  pageClass,
  children,
}: {
  currentPath: string;
  pageClass: 'press-page' | 'storyworld-page';
  children: ReactNode;
}) {
  return (
    <div className={`page-frame ${pageClass}`}>
      <SiteHeader currentPath={currentPath} />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
