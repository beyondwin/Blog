import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { arch, platform, release as osRelease } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  DECISION_ROUTES,
  MANDATORY_BUDGETS,
  type BrowserMeasurement,
  type RendererCaptureReport,
  type ViewportName,
} from '../../tools/parity/src/compare-contracts';
import { measureBrowserPage } from '../../tools/parity/src/measure-browser';
import { OFFICIAL_BASE_URL } from './support';

const outputPath = 'output/playwright/task14/performance-matrix.json';

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

test('one warmup plus five cold contexts meets the accepted Task 14 matrix', async ({ browser }) => {
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

  const baseline = await json<RendererCaptureReport>('tests/fixtures/parity/astro-renderer-baseline.json');
  const active = await json<{ releaseId: string }>('build/public-releases/active.json');
  const measurements: Array<{
    path: (typeof DECISION_ROUTES)[number];
    viewport: ViewportName;
    measurement: BrowserMeasurement;
  }> = [];

  for (const path of DECISION_ROUTES) {
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
  const sourceHash = createHash('sha256');
  for (const path of appSourcePaths) {
    const bytes = await readFile(path);
    sourceHash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    sourceHash.update(bytes);
  }
  const report = {
    version: 1,
    renderer: 'react-router',
    measuredAt: new Date().toISOString(),
    releaseId: active.releaseId,
    repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    appSourceHash: `sha256:${sourceHash.digest('hex')}`,
    environment: {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      os: `${platform()} ${osRelease()} ${arch()}`,
      playwright: packageVersion,
      chromium: browser.version(),
      chromiumRevision: chromiumPin?.revision,
    },
    protocol: {
      routes: DECISION_ROUTES,
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
