import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const artifactPath = join(
  repositoryRoot,
  'docs/notes/project/assets/form-and-thought-type-calibration/production-calibration.html',
);

interface CalibrationResult {
  bodyLineCounts: number[];
  bodyMeasureEm: number;
  fontSizePx: number;
  letterSpacingEm: number;
  titleLineCount: number;
  viewport: [number, number];
  weight: number;
  wordmarkLineInkWidthsPx: number[];
  wordmarkMaxInkWidthPx: number;
}

async function capture(viewport: [number, number]): Promise<CalibrationResult> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = pathname === '/production-calibration.html'
      ? artifactPath
      : join(repositoryRoot, 'apps/site/public', pathname);
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'font/woff2',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Calibration server did not bind');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
    await page.goto(`http://127.0.0.1:${address.port}/production-calibration.html`);
    await page.waitForFunction(() => document.documentElement.dataset.calibrationReady === 'true');
    return await page.evaluate(() => (window as typeof window & {
      __ftProductionCalibration: CalibrationResult;
    }).__ftProductionCalibration);
  } finally {
    await browser.close();
    await new Promise<void>((resolveClosed, reject) => server.close((error) => (
      error ? reject(error) : resolveClosed()
    )));
  }
}

describe('production typography calibration', () => {
  it('reproduces the selected optical wordmark and representative Korean wrapping', async () => {
    const present = await stat(artifactPath).then(() => true, () => false);
    expect(present).toBe(true);
    if (!present) return;

    const [desktop, mobile] = await Promise.all([
      capture([1440, 900]),
      capture([390, 844]),
    ]);

    expect(desktop).toMatchObject({
      viewport: [1440, 900],
      weight: 400,
      fontSizePx: 20,
      letterSpacingEm: -0.04,
      titleLineCount: 2,
      bodyLineCounts: [1, 1],
      bodyMeasureEm: 37.65,
    });
    expect(Math.abs((desktop.wordmarkMaxInkWidthPx - 92.49) / 92.49) * 100).toBeLessThanOrEqual(4);
    expect(desktop.wordmarkLineInkWidthsPx).toEqual([69.58003, 92.98003]);

    expect(mobile).toMatchObject({
      viewport: [390, 844],
      weight: 400,
      fontSizePx: 18,
      letterSpacingEm: -0.04,
      titleLineCount: 2,
      bodyLineCounts: [2, 2],
      bodyMeasureEm: 21.63,
    });
    expect(mobile.wordmarkLineInkWidthsPx).toEqual([62.62204, 83.68204]);
  }, 30_000);
});
