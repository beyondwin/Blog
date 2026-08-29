import { useEffect, useState, type MouseEvent } from 'react';
import { navigateToReadingOrigin, safeReadingFallback, type ReadingCollection } from '../navigation/fallback';
import { parseOrigin, type ReadingOrigin } from '../navigation/origin';
import { bootstrapReadingOrigin, requestReadingOriginFocus } from '../navigation/transport';

export type DetailCollection = ReadingCollection;

const DIRECT_LABELS: Record<DetailCollection, string> = {
  articles: '글 목록으로',
  reviews: '책 목록으로',
  analysis: '조사 목록으로',
  ideas: '아이디어 목록으로',
  travel: '여행 목록으로',
  memory: '문장 목록으로',
};

const ORIGIN_LABELS = {
  articles: '글 목록으로',
  reviews: '책 목록으로',
  analysis: '조사 목록으로',
  ideas: '아이디어 목록으로',
  travel: '여행 목록으로',
  tags: '태그 목록으로',
} as const;

export interface ContextReturnPresentation {
  label: string;
  href: string;
}

export function contextReturnPresentation(
  originInput: unknown,
  collection: DetailCollection,
): ContextReturnPresentation {
  const origin = parseOrigin(originInput);
  if (origin === null) return { label: DIRECT_LABELS[collection], href: safeReadingFallback(null, collection) };
  const label = origin.kind === 'search'
      ? `“${origin.query}” 결과로`
      : ORIGIN_LABELS[origin.kind];
  return { label, href: safeReadingFallback(origin, collection) };
}

function bootstrapLiveOrigin(): ReadingOrigin | null {
  try {
    return bootstrapReadingOrigin({
      location: { href: window.location.href },
      history: {
        state: window.history.state,
        replaceState: (state, unused, url) => window.history.replaceState(state, unused, url),
      },
      sessionStorage: window.sessionStorage,
      now: () => Date.now(),
      referrer: document.referrer,
    });
  } catch {
    return null;
  }
}

function isPlainActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function ContextReturn({ collection }: { collection: DetailCollection }) {
  const fallback = contextReturnPresentation(null, collection);
  const [origin, setOrigin] = useState<ReadingOrigin | null>(null);

  useEffect(() => {
    setOrigin(bootstrapLiveOrigin());
  }, []);

  const presentation = origin === null ? fallback : contextReturnPresentation(origin, collection);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (origin === null || !isPlainActivation(event)) return;
    event.preventDefault();
    try {
      requestReadingOriginFocus(origin, {
        sessionStorage: window.sessionStorage,
        now: () => Date.now(),
      });
    } catch {
      // A denied session store must not block the safe return navigation.
    }
    navigateToReadingOrigin({
      history: { state: window.history.state, back: () => window.history.back() },
      location: { assign: (url) => window.location.assign(url) },
    }, collection);
  };

  return <a className="context-return" href={presentation.href} onClick={onClick}>{presentation.label}</a>;
}
