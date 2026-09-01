export const PERFORMANCE_ROUTE_SELECTOR_ENV = 'BEYONDWIN_PERFORMANCE_ROUTES';
const PERFORMANCE_COMMAND = 'npx playwright test tests/e2e/performance.spec.ts --project=chromium-151';
const NODE_24_PREFIX = 'PATH=/opt/homebrew/opt/node@24/bin:$PATH';
const ROUTES_BY_NAME = {
  home: '/',
  articles: '/articles/',
  reviews: '/reviews/',
  thoughts: '/thoughts/',
  search: '/search/',
  'article-detail': '/articles/graphify-code-knowledge-graph-deep-dive/',
  'review-detail': '/reviews/black-swan/',
  'thought-detail': '/thoughts/why-i-read-in-the-ai-era/',
} as const;

export const PERFORMANCE_ROUTES = Object.values(ROUTES_BY_NAME);

export const PERFORMANCE_BUDGETS = {
  lcpMsMax: 2_500,
  clsMax: 0.05,
  initialJsGzipBytesMax: 128 * 1024,
  fontBytesMax: 250 * 1024,
  firstFrameImageBytesMax: 512 * 1024,
} as const;

export const SEARCH_CRITICAL_CSS_BUDGETS = {
  rawBytesMax: 28 * 1024,
  gzipBytesMax: 6 * 1024,
} as const;

export const SEARCH_AVATAR_PERFORMANCE_BOUNDARY = {
  derivativeApproval: 'not_authorized',
  pictureSelection: 'not_measured',
  firstFrameImageBudget: 'not_measured',
} as const;

export type PerformanceRoute = (typeof PERFORMANCE_ROUTES)[number];

type PerformanceRouteName = keyof typeof ROUTES_BY_NAME;

const ALL_ROUTE_NAMES = Object.keys(ROUTES_BY_NAME) as PerformanceRouteName[];

export interface PerformanceRouteSelection {
  selector: string | null;
  routeNames: string[];
  routes: PerformanceRoute[];
  exactCommand: string;
  outputPath: string;
}

export function selectPerformanceRoutes(selector: string | undefined): PerformanceRouteSelection {
  if (selector === undefined) {
    return {
      selector: null,
      routeNames: [...ALL_ROUTE_NAMES],
      routes: [...PERFORMANCE_ROUTES],
      exactCommand: `${NODE_24_PREFIX} ${PERFORMANCE_COMMAND}`,
      outputPath: 'output/playwright/task14/performance-matrix.json',
    };
  }

  const rawNames = selector.split(',');
  const names = rawNames.map((name) => name.trim());
  if (names.some((name) => name.length === 0)) {
    throw new Error(`${PERFORMANCE_ROUTE_SELECTOR_ENV} contains an empty selector`);
  }
  for (const name of names) {
    if (!Object.hasOwn(ROUTES_BY_NAME, name)) {
      throw new Error(`${PERFORMANCE_ROUTE_SELECTOR_ENV} contains unknown selector: ${name}`);
    }
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`${PERFORMANCE_ROUTE_SELECTOR_ENV} contains a duplicate selector`);
  }

  const routeNames = names as PerformanceRouteName[];
  const normalizedSelector = routeNames.join(',');
  return {
    selector: normalizedSelector,
    routeNames,
    routes: routeNames.map((name) => ROUTES_BY_NAME[name]),
    exactCommand: `${NODE_24_PREFIX} ${PERFORMANCE_ROUTE_SELECTOR_ENV}=${normalizedSelector} ${PERFORMANCE_COMMAND}`,
    outputPath: `output/playwright/task14/performance-${routeNames.join('-')}.json`,
  };
}
