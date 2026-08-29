import { Children, isValidElement, type ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts as ReactRouterScripts, useMatches } from 'react-router';
import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { absolutePublicUrl, currentSiteOrigin } from './delivery';

const [tokensCss, shellCss] = import.meta.env.SSR
  ? await Promise.all([
      import('../src/ui/styles/tokens.css?inline').then((module) => module.default),
      import('../src/ui/styles/shell.css?inline').then((module) => module.default),
    ])
  : ['', ''];

export interface RouteCriticalCssHandle {
  criticalCss: string;
}

export const PUBLIC_METADATA_BRAND = 'FORM & THOUGHT';

export function absoluteCanonical(path: string): string {
  return absolutePublicUrl(path, currentSiteOrigin());
}

export function publicMetadataTitle(title?: string): string {
  return title ? `${title} · ${PUBLIC_METADATA_BRAND}` : PUBLIC_METADATA_BRAND;
}

export function resolveCriticalCssForRender(
  routeCss: string,
  existingCss: string | null,
  sharedTokensCss: string,
  sharedShellCss: string,
): string {
  if (routeCss) return `${sharedTokensCss}${sharedShellCss}${routeCss}`;
  if (existingCss) return existingCss;
  throw new Error('Route-scoped critical CSS is unavailable');
}

function isCriticalCssHandle(handle: unknown): handle is RouteCriticalCssHandle {
  return typeof handle === 'object'
    && handle !== null
    && 'criticalCss' in handle
    && typeof handle.criticalCss === 'string';
}

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
  const absolute = absoluteCanonical(canonical);
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={absolute} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={PUBLIC_METADATA_BRAND} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={absolute} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
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
    : document.querySelector<HTMLStyleElement>('style[data-critical-css]')?.textContent ?? null;
  return (
    <style
      data-critical-css
      dangerouslySetInnerHTML={{
        __html: resolveCriticalCssForRender(
          routeMatch.handle.criticalCss,
          existingCss,
          tokensCss,
          shellCss,
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
  const canonical = absoluteCanonical(record.href);
  return [
    { title: publicMetadataTitle(record.title) },
    { name: 'description', content: record.description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:title', content: publicMetadataTitle(record.title) },
    { property: 'og:description', content: record.description },
    { property: 'og:url', content: canonical },
    { name: 'twitter:card', content: 'summary' },
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

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#F2EFE9" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/form-thought-display-ko.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/form-thought-wordmark.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/form-thought-ui-ko.woff2" crossOrigin="anonymous" />
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
