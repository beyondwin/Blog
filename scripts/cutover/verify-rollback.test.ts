import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { persistDrillReceipt, waitForExpectedFinalUrl } from './verify-rollback.mts';

describe('local cutover raw receipt boundaries', () => {
  it('waits boundedly for only a baseline-expected delayed redirect before recording', async () => {
    let current = 'http://127.0.0.1:4390/memory/map/';
    const waits: Array<{ timeout: number; waitUntil: string }> = [];
    const redirectPage = {
      url: () => current,
      waitForURL: async (predicate: (url: URL) => boolean, options: { timeout: number; waitUntil: string }) => {
        waits.push(options);
        current = 'http://127.0.0.1:4390/memory/';
        if (!predicate(new URL(current))) throw new Error('predicate rejected final URL');
      },
    };
    await waitForExpectedFinalUrl(redirectPage, { path: '/memory/map/', finalUrl: '/memory/', redirected: true });
    expect(waits).toEqual([{ timeout: 5_000, waitUntil: 'networkidle' }]);
    expect(new URL(redirectPage.url()).pathname).toBe('/memory/');

    let unexpectedWait = false;
    await waitForExpectedFinalUrl({
      url: () => 'http://127.0.0.1:4390/search/',
      waitForURL: async () => { unexpectedWait = true; },
    }, { path: '/search/', finalUrl: '/search/', redirected: false });
    expect(unexpectedWait).toBe(false);

    await expect(waitForExpectedFinalUrl({
      url: () => 'http://127.0.0.1:4390/memory/map/',
      waitForURL: async () => { throw new Error('timeout'); },
    }, { path: '/memory/map/', finalUrl: '/memory/', redirected: true })).rejects.toThrow(/timeout/iu);

    await expect(waitForExpectedFinalUrl({
      url: () => 'http://127.0.0.1:4390/memory/map/',
      waitForURL: async (predicate) => {
        if (!predicate(new URL('https://foreign.example/memory/'))) throw new Error('foreign origin refused');
      },
    }, { path: '/memory/map/', finalUrl: '/memory/', redirected: true })).rejects.toThrow(/foreign origin refused/iu);
  });

  it('atomically persists accumulated ineligible evidence before rethrowing a drill failure', async () => {
    const directory = await mkdtemp('/tmp/beyondwin-cutover-receipt-test.');
    const output = join(directory, 'receipt.json');
    await writeFile(output, '{"stale":true}\n');
    const accumulated = {
      schema_version: 3,
      implementation_commit: 'a'.repeat(40),
      eligible: true,
      errors: [],
      transitions: [{ target: 'react', routes: [] }],
      controller: { pid: 99 },
      processes: [{ role: 'react', root_pid: 101 }],
      dynamic_crawl: { route_count: 1, failures: [], routes: [{ path: '/' }] },
    };
    await expect(persistDrillReceipt(output, accumulated, new Error('dynamic crawl failed')))
      .rejects.toThrow(/receipt.*failed|failed.*receipt/iu);
    const receipt = JSON.parse(await readFile(output, 'utf8'));
    expect(receipt).toMatchObject({
      eligible: false,
      errors: [expect.stringMatching(/dynamic crawl failed/iu)],
      transitions: accumulated.transitions,
      controller: accumulated.controller,
      processes: accumulated.processes,
      dynamic_crawl: accumulated.dynamic_crawl,
    });
    expect((await readdir(directory)).filter((entry) => entry !== 'receipt.json')).toEqual([]);
    await rm(directory, { recursive: true });
  });
});
