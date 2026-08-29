import { parseOrigin, type ReadingOrigin } from './origin';

export type ReadingCollection = 'articles' | 'reviews' | 'analysis' | 'ideas' | 'travel' | 'memory';

const COLLECTION_ROOTS: Record<ReadingCollection, string> = {
  articles: '/articles/',
  reviews: '/reviews/',
  analysis: '/analysis/',
  ideas: '/ideas/',
  travel: '/travel/',
  memory: '/memory/',
};

function withAnchor(root: string, anchorId: string | undefined): string {
  return anchorId === undefined ? root : `${root}#${anchorId}`;
}

export function safeReadingFallback(
  originInput: unknown,
  recordCollection: ReadingCollection,
): string {
  const origin = parseOrigin(originInput);
  if (origin === null) return COLLECTION_ROOTS[recordCollection];

  switch (origin.kind) {
    case 'articles':
    case 'reviews':
      return withAnchor(COLLECTION_ROOTS[origin.kind], origin.anchorId);
    case 'search': {
      const search = new URLSearchParams({ q: origin.query });
      return `/search/?${search.toString()}#${origin.anchorId}`;
    }
    case 'analysis':
    case 'ideas':
    case 'travel':
      return withAnchor(COLLECTION_ROOTS[origin.kind], origin.anchorId);
    case 'tags':
      return withAnchor('/tags/', origin.anchorId);
  }
}

interface ReturnBrowser {
  history: {
    state: unknown;
    back(): void;
  };
  location: {
    assign(url: string): void;
  };
}

function stateRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function navigateToReadingOrigin(
  browser: ReturnBrowser,
  recordCollection: ReadingCollection,
): 'back' | 'fallback' {
  const state = stateRecord(browser.history.state);
  const origin: ReadingOrigin | null = parseOrigin(state?.bwOrigin);
  if (origin !== null && state?.bwHistoryReturnEligible === true) {
    browser.history.back();
    return 'back';
  }

  browser.location.assign(safeReadingFallback(origin, recordCollection));
  return 'fallback';
}
