import * as React from 'react';
import { createElement, type ReactNode } from 'react';
import type { ReleaseMediaAsset } from '../media/build-responsive-media';

export interface TrustedMdxComponentOptions {
  media: ReadonlyMap<string, ReleaseMediaAsset>;
}

function srcSet(candidates: ReleaseMediaAsset['fallback']['candidates']): string {
  return candidates.map((candidate) => `${candidate.src} ${candidate.width}w`).join(', ');
}

function Callout({ title = 'Note', children }: { title?: string; children?: ReactNode }) {
  const content = typeof children === 'string' ? createElement('p', null, children) : children;
  return <aside className="callout"><strong>{title}</strong>{content}</aside>;
}

export function createTrustedMdxComponents(options: TrustedMdxComponentOptions) {
  function Figure({ media }: { media: string }) {
    const asset = options.media.get(media);
    if (!asset) throw new Error(`trusted MDX references unknown public media: ${media}`);

    const caption = asset.caption ?? asset.alt;
    return (
      <figure className="content-figure" data-source-checksum={asset.sourceChecksum}>
        <picture>
          {asset.sources.map((source) => (
            <source
              key={source.type}
              type={source.type}
              srcSet={srcSet(source.candidates)}
            />
          ))}
          <img
            src={asset.fallback.src}
            srcSet={srcSet(asset.fallback.candidates)}
            sizes="(max-width: 760px) calc(100vw - 40px), min(42em, 100vw - 80px)"
            width={asset.width}
            height={asset.height}
            alt={asset.alt}
            loading="lazy"
            decoding="async"
          />
        </picture>
        <figcaption>
          <span>{caption}</span>
          <small>
            {asset.credit}{' · '}
            <a href={asset.provenanceUrl} rel="noreferrer">출처 · {asset.verifiedAt}</a>
          </small>
        </figcaption>
      </figure>
    );
  }

  return { Callout, Figure };
}
