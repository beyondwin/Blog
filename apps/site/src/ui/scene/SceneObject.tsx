import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { forwardRef, type MouseEvent } from 'react';
import { ResponsivePicture } from '../../../app/root';
import { type SceneObjectId, sceneActionLabels, type SceneRecordKind } from './scene-state';

type ReleaseAsset = PublicReleaseManifest['assets'][string];

export interface SceneObjectModel {
  id: SceneObjectId;
  kind: 'article-media' | 'article-excerpt' | 'review';
  recordKind: SceneRecordKind;
  role: 'lead' | 'support' | 'context' | 'hint';
  title: string;
  description: string;
  href: string;
  relationReason: string;
  sourceOwner: string;
  verifiedAt: string;
  authors?: string[];
  asset?: ReleaseAsset;
  text?: string;
  showFolio?: boolean;
}

function SceneObjectContent({ eager, object }: { eager: boolean; object: SceneObjectModel }) {
  if (object.kind === 'review') {
    return (
      <>
        <span className="visually-hidden">책</span>
        <span className="scene-object__review">
          <strong className="scene-object__title">{object.title}</strong>
          {object.authors && object.authors.length > 0 && (
            <span className="scene-object__author">{object.authors.join(' · ')}</span>
          )}
          <span className="scene-object__rule" aria-hidden="true" />
          <span className="scene-object__verdict">{object.description}</span>
        </span>
      </>
    );
  }

  if (object.kind === 'article-excerpt') {
    return (
      <>
        <span className="visually-hidden">문장</span>
        <blockquote>{object.text}</blockquote>
      </>
    );
  }

  if (!object.asset) return null;
  return (
    <>
      <span className="visually-hidden">그림</span>
      <ResponsivePicture
        asset={object.asset}
        alt={object.asset.alt}
        className="scene-object__image"
        eager={eager}
        sizes={object.role === 'lead'
          ? '(max-width: 720px) 70vw, (max-width: 1540px) 61vw, 940px'
          : '(max-width: 720px) 72vw, 61vw'}
      />
      {object.showFolio && (
        <span className="scene-object__folio" aria-hidden="true">
          <span className="scene-object__folio-scene">
            <strong>장면 기록</strong>
            <span>{object.asset.caption}</span>
          </span>
          <span className="scene-object__folio-fact"><span>제작</span><strong>{object.asset.credit}</strong></span>
          <span className="scene-object__folio-fact"><span>검증</span><strong>{object.asset.verifiedAt.replaceAll('-', '.')}</strong></span>
          <span className="scene-object__folio-fact">
            <span>원본</span>
            <strong>{object.asset.width} × {object.asset.height} · {object.asset.fallback.format.toUpperCase()}</strong>
          </span>
        </span>
      )}
    </>
  );
}

export const SceneObject = forwardRef<HTMLAnchorElement, {
  decorative?: boolean;
  eager?: boolean;
  object: SceneObjectModel;
  onInspect?: (event: MouseEvent<HTMLAnchorElement>, object: SceneObjectModel) => void;
  selected?: boolean;
}>(function SceneObject({
  decorative = false,
  eager = false,
  object,
  onInspect,
  selected = false,
}, ref) {
  const className = `scene-object scene-object--${object.role} scene-object--${object.kind}`;
  if (decorative) {
    return (
      <span className={className} data-scene-echo={object.id} aria-hidden="true">
        <SceneObjectContent eager={false} object={object} />
      </span>
    );
  }

  return (
    <a
      aria-label={`${object.title} ${sceneActionLabels(object.recordKind).inspect}`}
      className={className}
      data-scene-kind={object.kind}
      data-scene-object={object.id}
      data-selected={selected ? 'true' : undefined}
      href={object.href}
      onClick={(event) => onInspect?.(event, object)}
      ref={ref}
      style={{ viewTransitionName: `scene-${object.id}` }}
      tabIndex={selected ? -1 : undefined}
    >
      <SceneObjectContent eager={eager} object={object} />
    </a>
  );
});
