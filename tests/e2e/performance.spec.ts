import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, platform, release as osRelease } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_ROUTES,
  PERFORMANCE_ROUTE_SELECTOR_ENV,
  selectPerformanceRoutes,
} from './performance-selection';
import { measurePerformance, type PerformanceViewport } from './performance-metrics';
import { OFFICIAL_BASE_URL } from './support';

const routeSelection = selectPerformanceRoutes(process.env[PERFORMANCE_ROUTE_SELECTOR_ENV]);

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

test('one warmup plus five cold contexts meets the sealed React-only delivery budgets', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const packageLock = await json<{ packages: Record<string, { version?: string }> }>('package-lock.json');
  const browsers = await json<{ browsers: Array<{ name: string; revision: string; browserVersion: string }> }>(
    'node_modules/playwright-core/browsers.json',
  );
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

  const active = await json<{ releaseId: string }>('build/public-releases/active.json');
  const measurements: Array<{
    path: (typeof PERFORMANCE_ROUTES)[number];
    viewport: PerformanceViewport;
    measurement: Awaited<ReturnType<typeof measurePerformance>>;
  }> = [];
  for (const path of routeSelection.routes) {
    for (const viewport of ['desktop', 'mobile'] as const) {
      measurements.push({
        path,
        viewport,
        measurement: await measurePerformance(browser, OFFICIAL_BASE_URL, path, viewport),
      });
    }
  }

  const failures: string[] = [];
  for (const { path, viewport, measurement } of measurements) {
    const label = `${path} ${viewport}`;
    for (const [metric, maximum] of [
      ['lcpMs', PERFORMANCE_BUDGETS.lcpMsMax],
      ['cls', PERFORMANCE_BUDGETS.clsMax],
      ['initialJsGzipBytes', PERFORMANCE_BUDGETS.initialJsGzipBytesMax],
      ['fontBytes', PERFORMANCE_BUDGETS.fontBytesMax],
      ['firstFrameImageBytes', PERFORMANCE_BUDGETS.firstFrameImageBytesMax],
    ] as const) {
      if (measurement.median[metric] > maximum) {
        failures.push(`${label}: ${metric} ${measurement.median[metric]} > ${maximum}`);
      }
    }
    for (const [name, issues] of [
      ['console', measurement.consoleErrors],
      ['hydration', measurement.hydrationErrors],
      ['image', measurement.imageFailures],
      ['private-boundary', measurement.privateBoundaryHits],
    ] as const) {
      if (issues.length > 0) failures.push(`${label}: ${name} ${JSON.stringify(issues)}`);
    }
    if (measurement.overflow.overflow) {
      failures.push(`${label}: overflow ${measurement.overflow.actualScrollWidth} > ${measurement.overflow.expectedMaxWidth}`);
    }
  }

  const appSourcePaths = execFileSync('git', ['ls-files', '-z', '--', 'apps/site'], { encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean).sort();
  const report = {
    version: 3,
    renderer: 'react-router',
    baseline: null,
    productionCanonicalOrigin: 'not_measured',
    measuredAt: new Date().toISOString(),
    releaseId: active.releaseId,
    repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    selection: {
      environmentVariable: PERFORMANCE_ROUTE_SELECTOR_ENV,
      selector: routeSelection.selector,
      routeNames: routeSelection.routeNames,
      selectedRoutes: routeSelection.routes,
      exactCommand: routeSelection.exactCommand,
      outputPath: routeSelection.outputPath,
    },
    sourceHashes: {
      app: await hashFiles(appSourcePaths),
      measurementImplementation: await hashFiles(['tests/e2e/performance-metrics.ts']),
      harness: await hashFiles(['tests/e2e/performance-selection.ts', 'tests/e2e/performance.spec.ts']),
      config: await hashFiles(['package-lock.json', 'package.json', 'playwright.config.ts', 'tests/e2e/support.ts']),
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
      fullRoutes: PERFORMANCE_ROUTES,
      viewports: ['desktop', 'mobile'],
      warmups: 1,
      coldSamplesPerCell: 5,
      freshContextPerSample: true,
      clearedHttpCachePerSample: true,
      initialJavaScript: 'gzip-level-9 inline plus unique initial executable responses',
      fontBytes: 'unique successful first-navigation font response bodies',
      firstFrameImageBytes: 'unique successful response bodies for images visible after fonts-ready plus two animation frames',
    },
    budgets: PERFORMANCE_BUDGETS,
    measurements,
    failures,
  };
  await mkdir('output/playwright/task14', { recursive: true });
  await writeFile(routeSelection.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  expect(failures).toEqual([]);
});
