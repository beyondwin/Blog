import { Children, isValidElement, type ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts as ReactRouterScripts, useMatches } from 'react-router';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';

const [currentParitySharedCss, currentParityFocusCss, currentParityMotionCss] = import.meta.env.SSR
  ? await Promise.all([
      import('./current-parity.shared.css?inline').then((module) => module.default),
      import('./current-parity.focus.css?inline').then((module) => module.default),
      import('./current-parity.motion.css?inline').then((module) => module.default),
    ])
  : ['', '', ''];

interface CriticalCssSources {
  article: string;
  articleMobile: string;
  detail: string;
  detailMobile: string;
  home: string;
  homeAccessibility: string;
  memory: string;
  motion: string;
  focus: string;
  review: string;
  reviewMobile: string;
  shared: string;
}

export function criticalCssForPath(
  pathname: string,
  sources: CriticalCssSources,
): string {
  let routeCss = `${sources.detail}${sources.detailMobile}`;
  let routePreludeCss = '';
  if (pathname === '/') {
    routePreludeCss = sources.homeAccessibility;
    routeCss = sources.home;
  }
  else if (pathname.startsWith('/articles/')) {
    routeCss = `${sources.detail}${sources.article}${sources.detailMobile}${sources.articleMobile}`;
  } else if (pathname.startsWith('/reviews/')) {
    routeCss = `${sources.detail}${sources.review}${sources.detailMobile}${sources.reviewMobile}`;
  } else if (pathname.startsWith('/memory/')) {
    routeCss = `${sources.detail}${sources.memory}${sources.detailMobile}`;
  }
  return `${sources.shared}${routePreludeCss}${sources.focus}${routeCss}${sources.motion}`;
}

export interface CriticalCssHandle {
  currentParityCss: string;
  currentParityPreludeCss?: string;
}

export function resolveCriticalCssForRender(
  routePreludeCss: string,
  routeCss: string,
  existingCss: string | null,
  sharedCss: string,
  focusCss: string,
  motionCss: string,
): string {
  if (routeCss) return `${sharedCss}${routePreludeCss}${focusCss}${routeCss}${motionCss}`;
  if (existingCss) return existingCss;
  throw new Error('Route-scoped critical CSS is unavailable');
}

function isCriticalCssHandle(handle: unknown): handle is CriticalCssHandle {
  return typeof handle === 'object'
    && handle !== null
    && 'currentParityCss' in handle
    && typeof handle.currentParityCss === 'string';
}

const PUBLIC_NAV = [
  { href: '/', label: '장면' },
  { href: '/articles/', label: '글' },
  { href: '/reviews/', label: '책' },
  { href: '/search/', label: '찾기' },
] as const;

type ReleaseAsset = PublicReleaseManifest['assets'][string];

export function DocumentMetadata({
  canonical,
  description,
  title,
}: {
  canonical: string;
  description: string;
  title: string;
}) {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

export function CriticalStyles() {
  const matches = useMatches();
  const routeMatch = [...matches].reverse().find((match) => isCriticalCssHandle(match.handle));
  if (!routeMatch || !isCriticalCssHandle(routeMatch.handle)) {
    throw new Error('Matched route is missing route-scoped critical CSS');
  }
  const existingCss = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLStyleElement>('style[data-current-parity]')?.textContent ?? null;
  return (
    <style
      data-current-parity
      dangerouslySetInnerHTML={{
        __html: resolveCriticalCssForRender(
          routeMatch.handle.currentParityPreludeCss ?? '',
          routeMatch.handle.currentParityCss,
          existingCss,
          currentParitySharedCss,
          currentParityFocusCss,
          currentParityMotionCss,
        ),
      }}
    />
  );
}

export function withoutModulePreloads(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => !(
    isValidElement<{ rel?: string }>(child)
    && child.type === 'link'
    && child.props.rel === 'modulepreload'
  ));
}

export function CriticalScripts() {
  const rendered = ReactRouterScripts({});
  if (!isValidElement<{ children?: ReactNode }>(rendered)) return rendered;
  return <>{withoutModulePreloads(rendered.props.children)}</>;
}

export function metadataForRecord(record: PublicRecord) {
  return [
    { title: `${record.title} · beyondwin` },
    { name: 'description', content: record.description },
    { tagName: 'link', rel: 'canonical', href: record.href },
  ] as const;
}

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

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f2f4f7" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <CriticalStyles />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <CriticalScripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
