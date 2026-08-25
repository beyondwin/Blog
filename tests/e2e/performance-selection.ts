import { DECISION_ROUTES, type DecisionRoute } from '../../tools/parity/src/compare-contracts';

export const PERFORMANCE_ROUTE_SELECTOR_ENV = 'BEYONDWIN_PERFORMANCE_ROUTES';
const PERFORMANCE_COMMAND = 'npx playwright test tests/e2e/performance.spec.ts --project=chromium-151';
const NODE_24_PREFIX = 'PATH=/opt/homebrew/opt/node@24/bin:$PATH';
const ROUTES_BY_NAME = {
  home: '/',
  article: '/articles/why-i-read-in-the-ai-era/',
  review: '/reviews/black-swan/',
  memory: '/memory/agent-harnesses-are-operating-systems/',
} as const satisfies Record<string, DecisionRoute>;

type PerformanceRouteName = keyof typeof ROUTES_BY_NAME;

const ALL_ROUTE_NAMES = Object.keys(ROUTES_BY_NAME) as PerformanceRouteName[];

export interface PerformanceRouteSelection {
  selector: string | null;
  routeNames: string[];
  routes: DecisionRoute[];
  exactCommand: string;
  outputPath: string;
}

export function selectPerformanceRoutes(selector: string | undefined): PerformanceRouteSelection {
  if (selector === undefined) {
    return {
      selector: null,
      routeNames: [...ALL_ROUTE_NAMES],
      routes: [...DECISION_ROUTES],
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
