import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { arch, platform, release as osRelease } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  DECISION_ROUTES,
  MANDATORY_BUDGETS,
  type BrowserMeasurement,
  type DecisionRoute,
  type RendererCaptureReport,
  type ViewportName,
} from '../../tools/parity/src/compare-contracts';
import { measureBrowserPage } from '../../tools/parity/src/measure-browser';
import {
  PERFORMANCE_ROUTE_SELECTOR_ENV,
  selectPerformanceRoutes,
} from './performance-selection';
import { OFFICIAL_BASE_URL } from './support';

const routeSelection = selectPerformanceRoutes(process.env[PERFORMANCE_ROUTE_SELECTOR_ENV]);
const outputPath = routeSelection.outputPath;
const baselinePath = 'tests/fixtures/parity/astro-renderer-baseline.json';
const routeSourcePaths: Record<DecisionRoute, string[]> = {
  '/': [
    'apps/site/app/routes/home.tsx',
    'apps/site/src/ui/scene/SceneObject.tsx',
    'apps/site/src/ui/scene/ScenePage.tsx',
    'apps/site/src/ui/styles/route-scene.css',
  ],
  '/articles/why-i-read-in-the-ai-era/': [
    'apps/site/app/routes/article.tsx',
    'apps/site/src/ui/reading/ArticleReadingPage.tsx',
    'apps/site/src/ui/styles/route-article.css',
  ],
  '/reviews/black-swan/': [
    'apps/site/app/routes/review.tsx',
    'apps/site/src/ui/reading/ReviewReadingPage.tsx',
    'apps/site/src/ui/styles/route-review.css',
  ],
  '/memory/agent-harnesses-are-operating-systems/': [
    'apps/site/app/routes/memory.tsx',
    'apps/site/src/ui/memory/MemoryDetailPage.tsx',
    'apps/site/src/ui/styles/route-memory.css',
  ],
};

async function hashFiles(paths: readonly string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    const bytes = await readFile(path);
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

test('one warmup plus five cold contexts meets the selected accepted Task 14 cells', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const packageLock = await json<{
    packages: Record<string, { version?: string }>;
  }>('package-lock.json');
  const browsers = await json<{
    browsers: Array<{ name: string; revision: string; browserVersion: string }>;
  }>('node_modules/playwright-core/browsers.json');
  const chromiumPin = browsers.browsers.find((entry) => entry.name === 'chromium');
  const packageVersion = packageLock.packages['node_modules/@playwright/test']?.version;
  expect({
    packageVersion,
    chromiumRevision: chromiumPin?.revision,
    chromiumVersion: chromiumPin?.browserVersion,
    actual: browser.version(),
  }).toEqual({
    packageVersion: '1.62.1',
    chromiumRevision: '1234',
    chromiumVersion: '151.0.7922.34',
    actual: '151.0.7922.34',
  });

  const baseline = await json<RendererCaptureReport>(baselinePath);
  const active = await json<{ releaseId: string }>('build/public-releases/active.json');
  const measurements: Array<{
    path: (typeof DECISION_ROUTES)[number];
    viewport: ViewportName;
    measurement: BrowserMeasurement;
  }> = [];

  for (const path of routeSelection.routes) {
    for (const viewport of ['desktop', 'mobile'] as const) {
      measurements.push({
        path,
        viewport,
        measurement: await measureBrowserPage(browser, OFFICIAL_BASE_URL, path, viewport),
      });
    }
  }

  const failures: string[] = [];
  for (const cell of measurements) {
    const baselineCell = baseline.routes.find((route) => route.path === cell.path)
      ?.measurements.find((measurement) => measurement.viewport === cell.viewport);
    if (!baselineCell) {
      failures.push(`${cell.path} ${cell.viewport}: matching Astro baseline missing`);
      continue;
    }
    const label = `${cell.path} ${cell.viewport}`;
    const lcpMax = baselineCell.median.lcpMs * MANDATORY_BUDGETS.lcpAstroMultiplier;
    if (cell.measurement.median.cls > MANDATORY_BUDGETS.clsMax) {
      failures.push(`${label}: CLS ${cell.measurement.median.cls} > ${MANDATORY_BUDGETS.clsMax}`);
    }
    if (cell.measurement.median.lcpMs > lcpMax) {
      failures.push(`${label}: LCP ${cell.measurement.median.lcpMs}ms > ${lcpMax}ms`);
    }
    if (cell.path !== '/' && cell.measurement.median.jsGzipBytes > MANDATORY_BUDGETS.detailInitialJsGzipBytesMax) {
      failures.push(`${label}: JS ${cell.measurement.median.jsGzipBytes} > ${MANDATORY_BUDGETS.detailInitialJsGzipBytesMax}`);
    }
    for (const [name, issues] of [
      ['console', cell.measurement.consoleErrors],
      ['hydration', cell.measurement.hydrationErrors],
      ['axe-serious-critical', cell.measurement.axeSeriousOrCritical],
      ['image', cell.measurement.imageFailures],
      ['private-boundary', cell.measurement.privateBoundaryHits],
    ] as const) {
      if (issues.length > 0) failures.push(`${label}: ${name} ${JSON.stringify(issues)}`);
    }
    if (cell.measurement.overflow.overflow) {
      failures.push(`${label}: overflow ${cell.measurement.overflow.actualScrollWidth} > ${cell.measurement.overflow.expectedMaxWidth}`);
    }
  }

  const appSourcePaths = execFileSync('git', ['ls-files', '-z', '--', 'apps/site'], { encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean).sort();
  const routeSpecificPaths = new Set(Object.values(routeSourcePaths).flat());
  const sharedAppSourcePaths = appSourcePaths.filter((path) => !routeSpecificPaths.has(path));
  const routeSourceHashes = Object.fromEntries(await Promise.all(
    DECISION_ROUTES.map(async (path) => [path, await hashFiles(routeSourcePaths[path])]),
  ));
  const report = {
    version: 2,
    renderer: 'react-router',
    measuredAt: new Date().toISOString(),
    releaseId: active.releaseId,
    repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    selection: {
      environmentVariable: PERFORMANCE_ROUTE_SELECTOR_ENV,
      selector: routeSelection.selector,
      routeNames: routeSelection.routeNames,
      selectedRoutes: routeSelection.routes,
      exactCommand: routeSelection.exactCommand,
      outputPath,
    },
    sourceHashes: {
      app: await hashFiles(appSourcePaths),
      sharedApp: await hashFiles(sharedAppSourcePaths),
      routes: routeSourceHashes,
      measurementImplementation: await hashFiles([
        'tools/parity/src/compare-contracts.ts',
        'tools/parity/src/measure-browser.ts',
        baselinePath,
      ]),
      harness: await hashFiles([
        'tests/e2e/performance-selection.ts',
        'tests/e2e/performance.spec.ts',
      ]),
      config: await hashFiles([
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
        'tests/e2e/support.ts',
      ]),
      releaseManifest: await hashFiles([
        'build/public-releases/active.json',
        `build/public-releases/${active.releaseId}/manifest.json`,
      ]),
    },
    environment: {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      os: `${platform()} ${osRelease()} ${arch()}`,
      playwright: packageVersion,
      chromium: browser.version(),
      chromiumRevision: chromiumPin?.revision,
    },
    protocol: {
      routes: routeSelection.routes,
      fullDecisionRoutes: DECISION_ROUTES,
      viewports: ['desktop', 'mobile'],
      warmups: 1,
      coldSamplesPerCell: 5,
      freshContextPerSample: true,
      clearedHttpCachePerSample: true,
      initialJavaScript: 'gzip-level-9 inline plus unique initial executable responses',
    },
    budgets: MANDATORY_BUDGETS,
    baseline: baseline.routes.map((route) => ({
      path: route.path,
      measurements: route.measurements.map(({ viewport, median, mad }) => ({ viewport, median, mad })),
    })),
    measurements,
    failures,
  };
  await mkdir('output/playwright/task14', { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  expect(failures).toEqual([]);
});
