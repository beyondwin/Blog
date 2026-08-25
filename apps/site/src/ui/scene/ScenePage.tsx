import type { PublicRecord } from '@beyondwin/contracts';
import type { PublicReleaseManifest } from '@beyondwin/content/release';
import { flushSync } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { OriginLink } from '../navigation/OriginLink';
import { SceneObject, type SceneObjectModel } from './SceneObject';
import {
  assertSceneInventory,
  initialSceneState,
  readSceneFocus,
  readSceneHistoryCheckpoint,
  reduceSceneState,
  sceneActionLabels,
  sceneFocusHref,
  sceneOverviewHref,
  type SceneObjectId,
  type SceneState,
} from './scene-state';

type ArticleRecord = Extract<PublicRecord, { collection: 'articles' }>;
type ReviewRecord = Extract<PublicRecord, { collection: 'reviews' }>;
type ReleaseAsset = PublicReleaseManifest['assets'][string];

export interface ScenePageData {
  article: Pick<ArticleRecord, 'createdAt' | 'description' | 'href' | 'title' | 'updatedAt'>;
  review: Pick<ReviewRecord, 'authors' | 'description' | 'href' | 'id' | 'title' | 'updatedAt' | 'verdict'>;
  assets: { judgment: ReleaseAsset; lead: ReleaseAsset; shared: ReleaseAsset };
}

const ARTICLE_EXCERPT = '요약은 결론을 주고, 독서는 그 결론까지 가는 시간을 준다.';
let sceneFocusStyles: Promise<unknown> | undefined;

interface PendingFocusRequest {
  animate: boolean;
  focusId: SceneObjectId;
  generation: number;
  pushHistory: boolean;
  scrollLeft: number;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function loadSceneFocusStyles(): Promise<unknown> {
  sceneFocusStyles ??= import('../styles/scene.css');
  return sceneFocusStyles;
}

function sceneDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error('Verified scene data has an invalid timestamp');
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

function sceneObjects(data: ScenePageData): SceneObjectModel[] {
  const articleBase = {
    recordKind: 'article' as const,
    title: data.article.title,
    href: data.article.href,
    sourceOwner: '직접 쓴 글',
  };
  return [
    {
      ...articleBase,
      id: 'reading-desk-cobalt',
      kind: 'article-media',
      role: 'lead',
      description: ARTICLE_EXCERPT,
      relationReason: '판단 장면의 중심 글',
      verifiedAt: data.assets.lead.verifiedAt,
      asset: data.assets.lead,
      showFolio: true,
    },
    {
      ...articleBase,
      id: 'judgment-scale',
      kind: 'article-media',
      role: 'support',
      description: data.assets.judgment.caption || data.article.description,
      relationReason: '같은 글에 포함된 판단의 그림',
      verifiedAt: data.assets.judgment.verifiedAt,
      asset: data.assets.judgment,
    },
    {
      id: 'black-swan',
      kind: 'review',
      recordKind: 'review',
      role: 'support',
      title: data.review.title,
      description: data.review.verdict ?? data.review.description,
      href: data.review.href,
      relationReason: '예측과 설명을 의심하는 책',
      sourceOwner: data.review.authors.join(' · ') || '책',
      verifiedAt: sceneDate(data.review.updatedAt),
      authors: data.review.authors,
    },
    {
      ...articleBase,
      id: 'reading-excerpt',
      kind: 'article-excerpt',
      role: 'context',
      title: ARTICLE_EXCERPT,
      description: ARTICLE_EXCERPT,
      relationReason: '이 글에서 직접 남긴 문장',
      verifiedAt: sceneDate(data.article.updatedAt),
      text: ARTICLE_EXCERPT,
    },
    {
      ...articleBase,
      id: 'shared-reading-table',
      kind: 'article-media',
      role: 'hint',
      description: data.assets.shared.caption || data.article.description,
      relationReason: '같은 글에 포함된 함께 읽기의 장면',
      verifiedAt: data.assets.shared.verifiedAt,
      asset: data.assets.shared,
    },
  ];
}

function plainHistoryState(): Record<string, unknown> {
  return typeof history.state === 'object' && history.state !== null && !Array.isArray(history.state)
    ? { ...history.state as Record<string, unknown> }
    : {};
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function ScenePage({ data }: { data: ScenePageData }) {
  const objects = useMemo(() => sceneObjects(data), [data]);
  assertSceneInventory(objects.map((object) => object.id));
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
  const [sceneState, setSceneState] = useState<SceneState>(initialSceneState);
  const [focusRevealed, setFocusRevealed] = useState(false);
  const [railExplored, setRailExplored] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const objectRefs = useRef(new Map<SceneObjectId, HTMLAnchorElement>());
  const focusPanelRef = useRef<HTMLElement>(null);
  const stateRef = useRef(sceneState);
  const revealTimerRef = useRef<number | undefined>(undefined);
  const focusRequestGenerationRef = useRef(0);
  const pendingFocusRef = useRef<PendingFocusRequest | undefined>(undefined);

  const reducedMotion = useCallback(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), []);

  const transitionState = useCallback((
    next: SceneState,
    object?: HTMLAnchorElement,
    duration = 480,
  ): Promise<void> => {
    stateRef.current = next;
    const apply = () => flushSync(() => setSceneState(next));
    if (reducedMotion() || !object) {
      apply();
      return Promise.resolve();
    }

    const startViewTransition = (document as TransitionDocument).startViewTransition;
    if (typeof startViewTransition === 'function') {
      return startViewTransition.call(document, apply).finished.then(() => undefined, () => undefined);
    }

    const first = object.getBoundingClientRect();
    apply();
    const last = object.getBoundingClientRect();
    if (first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) {
      return Promise.resolve();
    }
    const animation = object.animate(
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${first.left - last.left}px,${first.top - last.top}px) scale(${first.width / last.width},${first.height / last.height})`,
        },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return animation.finished.then(() => undefined, () => undefined);
  }, [reducedMotion]);

  const requestFocus = useCallback((
    focusId: SceneObjectId,
    pushHistory: boolean,
    scrollLeft: number,
    animate = true,
  ) => {
    const current = stateRef.current;
    const pending = pendingFocusRef.current;
    if (current.mode === 'focus' && current.focusId === focusId) {
      if (pending && pending.focusId !== focusId) {
        focusRequestGenerationRef.current += 1;
        pendingFocusRef.current = undefined;
      }
      return;
    }
    if (pending?.focusId === focusId) return;

    const request: PendingFocusRequest = {
      animate,
      focusId,
      generation: focusRequestGenerationRef.current + 1,
      pushHistory,
      scrollLeft,
    };
    focusRequestGenerationRef.current = request.generation;
    pendingFocusRef.current = request;

    void loadSceneFocusStyles().then(() => {
      if (pendingFocusRef.current?.generation !== request.generation) return;
      pendingFocusRef.current = undefined;
      const next = reduceSceneState(stateRef.current, {
        type: 'focus',
        focusId: request.focusId,
        scrollLeft: request.scrollLeft,
      });
      if (request.pushHistory) {
        history.pushState(
          { ...plainHistoryState(), bwScene: next.mode === 'focus' ? next.returnCheckpoint : undefined },
          '',
          sceneFocusHref(location.href, request.focusId),
        );
      }
      const reduce = reducedMotion();
      setFocusRevealed(reduce || !request.animate);
      void transitionState(
        next,
        request.animate ? objectRefs.current.get(request.focusId) : undefined,
        480,
      );
      window.clearTimeout(revealTimerRef.current);
      if (!reduce && request.animate) {
        revealTimerRef.current = window.setTimeout(() => {
          if (stateRef.current.mode === 'focus' && stateRef.current.focusId === request.focusId) {
            setFocusRevealed(true);
          }
        }, 336);
      }
    });
  }, [reducedMotion, transitionState]);

  const centerStageOn = useCallback((focusId: SceneObjectId): number => {
    const stage = stageRef.current;
    const object = objectRefs.current.get(focusId);
    if (!stage || !object) return stage?.scrollLeft ?? 0;
    const stageRect = stage.getBoundingClientRect();
    const objectRect = object.getBoundingClientRect();
    stage.scrollLeft += objectRect.left + objectRect.width / 2
      - (stageRect.left + stageRect.width / 2);
    return stage.scrollLeft;
  }, []);

  const returnToOverview = useCallback((fromHistory = false) => {
    const current = stateRef.current;
    if (current.mode !== 'focus') return;
    focusRequestGenerationRef.current += 1;
    pendingFocusRef.current = undefined;
    setFocusRevealed(false);
    if (!fromHistory && readSceneHistoryCheckpoint(history.state)?.focusId === current.focusId) {
      history.back();
      return;
    }
    if (!fromHistory) {
      const nextHistory = plainHistoryState();
      delete nextHistory.bwScene;
      history.replaceState(nextHistory, '', sceneOverviewHref(location.href));
    }
    void transitionState(
      reduceSceneState(current, { type: 'return' }),
      objectRefs.current.get(current.focusId),
      360,
    );
  }, [transitionState]);

  useEffect(() => {
    const syncFromLocation = (animate = false) => {
      const focusId = readSceneFocus(location.search);
      if (focusId) {
        const checkpoint = readSceneHistoryCheckpoint(history.state);
        let scrollLeft: number;
        if (checkpoint?.focusId === focusId && stageRef.current) {
          stageRef.current.scrollLeft = checkpoint.scrollLeft;
          scrollLeft = stageRef.current.scrollLeft;
        } else {
          scrollLeft = centerStageOn(focusId);
        }
        requestFocus(focusId, false, scrollLeft, animate);
      } else if (new URLSearchParams(location.search).has('focus')) {
        focusRequestGenerationRef.current += 1;
        pendingFocusRef.current = undefined;
        history.replaceState(plainHistoryState(), '', sceneOverviewHref(location.href));
      } else if (stateRef.current.mode === 'focus') {
        returnToOverview(true);
      } else {
        focusRequestGenerationRef.current += 1;
        pendingFocusRef.current = undefined;
      }
    };
    syncFromLocation();
    const onPopState = () => syncFromLocation(true);
    addEventListener('popstate', onPopState);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stateRef.current.mode === 'focus') returnToOverview();
    };
    addEventListener('keydown', onKeyDown);
    return () => {
      removeEventListener('popstate', onPopState);
      removeEventListener('keydown', onKeyDown);
      window.clearTimeout(revealTimerRef.current);
      focusRequestGenerationRef.current += 1;
      pendingFocusRef.current = undefined;
    };
  }, [centerStageOn, requestFocus, returnToOverview]);

  useEffect(() => {
    if (sceneState.mode !== 'focus' || !focusRevealed) return;
    const delay = reducedMotion() ? 0 : 144;
    const timer = window.setTimeout(() => {
      focusPanelRef.current?.querySelector<HTMLAnchorElement>('[data-scene-read]')?.focus({ preventScroll: true });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [focusRevealed, reducedMotion, sceneState.mode]);

  useLayoutEffect(() => {
    if (sceneState.mode !== 'overview' || !sceneState.restore) return;
    const { focusId, scrollLeft } = sceneState.restore;
    const restore = () => {
      if (stageRef.current) stageRef.current.scrollLeft = scrollLeft;
      objectRefs.current.get(focusId)?.focus({ preventScroll: true });
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [sceneState]);

  const inspectObject = (event: MouseEvent<HTMLAnchorElement>, object: SceneObjectModel) => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    event.preventDefault();
    requestFocus(object.id, true, stageRef.current?.scrollLeft ?? 0);
  };

  const selected = sceneState.mode === 'focus' ? byId.get(sceneState.focusId) : undefined;
  const lead = objects[0];
  const titleBreak = data.article.title.match(/^(.+?,)\s+(.+)$/u);
  const leadLabels = sceneActionLabels('article');

  return (
    <section
      className="public-scene"
      data-focus-revealed={focusRevealed ? 'true' : undefined}
      data-mode={sceneState.mode}
      data-rail-explored={railExplored ? 'true' : undefined}
      data-scene-id="judgment"
      data-scene-version="2026-08-22"
    >
      <header className="scene-heading">
        <p className="visually-hidden">판단</p>
        <h1>{titleBreak ? <>{titleBreak[1]}<br />{titleBreak[2]}</> : data.article.title}</h1>
        <span>에세이 · {sceneDate(data.article.createdAt)}</span>
      </header>
      <div className="scene-stage" aria-label="판단 장면">
        <div className="scene-edge-echoes" aria-hidden="true">
          <SceneObject object={objects[1]} decorative />
          <SceneObject object={objects[2]} decorative />
        </div>
        <div
          className="scene-stage__objects"
          onScroll={(event) => {
            if (Math.abs(event.currentTarget.scrollLeft) > 6) setRailExplored(true);
          }}
          ref={stageRef}
        >
          {objects.map((object, index) => (
            <SceneObject
              eager={index === 0}
              key={object.id}
              object={object}
              onInspect={inspectObject}
              ref={(anchor) => {
                if (anchor) objectRefs.current.set(object.id, anchor);
                else objectRefs.current.delete(object.id);
              }}
              selected={selected?.id === object.id}
            />
          ))}
        </div>
      </div>
      <nav className="scene-overview-actions" aria-label="중심 글 선택">
        <OriginLink
          data-scene-overview-read
          href={lead.href}
          origin={{ kind: 'scene', focusId: lead.id }}
        >
          {leadLabels.read}
          <svg aria-hidden="true" viewBox="0 0 20 16"><path d="M2 8h15M12 3l5 5-5 5" /></svg>
        </OriginLink>
        <a
          data-scene-enter-focus
          href={sceneFocusHref('/', lead.id)}
          onClick={(event) => {
            if (!isUnmodifiedPrimaryClick(event)) return;
            event.preventDefault();
            requestFocus(lead.id, true, stageRef.current?.scrollLeft ?? 0);
          }}
        >
          {leadLabels.inspect}
          <svg aria-hidden="true" viewBox="0 0 20 16"><path d="M2 8h15M12 3l5 5-5 5" /></svg>
        </a>
      </nav>
      <aside
        aria-label={selected ? `${selected.title} 포커스. ${sceneActionLabels(selected.recordKind).read} 또는 장면으로 돌아가기.` : undefined}
        aria-live="polite"
        className="scene-focus"
        hidden={!selected}
        ref={focusPanelRef}
      >
        {selected && (
          <>
            <span className="scene-focus__marker" aria-hidden="true" />
            <h2>{selected.title}</h2>
            <blockquote>{selected.description}</blockquote>
            <OriginLink
              data-scene-read
              href={selected.href}
              origin={{ kind: 'scene', focusId: selected.id }}
            >
              {sceneActionLabels(selected.recordKind).read}
            </OriginLink>
            <button data-scene-overview onClick={() => returnToOverview()} type="button">
              <svg aria-hidden="true" viewBox="0 0 20 16"><path d="M18 8H3M8 3 3 8l5 5" /></svg>
              {sceneActionLabels(selected.recordKind).return}
            </button>
            <dl className="scene-focus__provenance">
              <div><dt>관계</dt><dd>{selected.relationReason}</dd></div>
              <div><dt>출처</dt><dd>{[selected.sourceOwner, selected.verifiedAt].filter(Boolean).join(' · ')}</dd></div>
            </dl>
          </>
        )}
      </aside>
      <p className="scene-swipe-cue">좌우로 스와이프</p>
    </section>
  );
}
