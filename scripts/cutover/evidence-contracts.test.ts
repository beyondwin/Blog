import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  assertCleanHostReceiptMaterialGroups,
  assertDynamicCrawl,
  assertLocalReceiptMaterialGroups,
  deriveChangedSurfacePerformance,
  npmObservedCommandLine,
  ownedCommandLineReady,
  validateOwnedProcessIdentity,
} from './evidence-contracts.mts';

const HASH = `sha256:${'a'.repeat(64)}`;
const COMMIT = 'b'.repeat(40);
const RELEASE = 'c'.repeat(64);
const ROUTE = '/reviews/black-swan/';
const REPRESENTATIVES = ['/', '/articles/a/', ROUTE, '/memory/a/', '/search/', '/tags/AI/', '/reviews/redirect/'];

function sample(lcpMs: number) {
  return {
    lcpMs,
    cls: 0,
    jsGzipBytes: 100_000,
    imageBytes: 10_000,
    lcpElement: { provenance: 'largest-contentful-paint', tagName: 'IMG', id: '', className: 'cover', url: '/cover.avif', text: '' },
    renderedImages: [],
    imageFailures: [],
    consoleErrors: [],
    hydrationErrors: [],
    axeSeriousOrCritical: [],
    overflow: { expectedMaxWidth: 390, actualScrollWidth: 390, overflow: false },
    privateBoundaryHits: [],
  };
}

function performanceReceipt() {
  const measurement = (viewport: 'desktop' | 'mobile') => ({
    path: ROUTE,
    viewport,
    measurement: {
      viewport,
      size: viewport === 'desktop' ? { width: 1440, height: 960 } : { width: 390, height: 844 },
      warmupDiscarded: 1,
      sampleCount: 5,
      samples: [20, 20, 20, 24, 24].map(sample),
      median: { lcpMs: 20, cls: 0, jsGzipBytes: 100_000, imageBytes: 10_000 },
      mad: { lcpMs: 0, cls: 0, jsGzipBytes: 0, imageBytes: 0 },
      consoleErrors: [], hydrationErrors: [], axeSeriousOrCritical: [], imageFailures: [],
      overflow: { expectedMaxWidth: viewport === 'desktop' ? 1440 : 390, actualScrollWidth: viewport === 'desktop' ? 1440 : 390, overflow: false },
      privateBoundaryHits: [],
    },
  });
  return {
    version: 2,
    renderer: 'react-router',
    measuredAt: '2026-08-25T00:00:00.000Z',
    releaseId: RELEASE,
    repositoryHead: COMMIT,
    selection: { selector: 'review', routeNames: ['review'], selectedRoutes: [ROUTE] },
    sourceHashes: { routes: { [ROUTE]: HASH }, measurementImplementation: HASH, harness: HASH, config: HASH, releaseManifest: HASH },
    protocol: { routes: [ROUTE], viewports: ['desktop', 'mobile'], warmups: 1, coldSamplesPerCell: 5, freshContextPerSample: true, clearedHttpCachePerSample: true },
    budgets: { clsMax: 0.05, lcpAstroMultiplier: 1.1, detailInitialJsGzipBytesMax: 112_640 },
    baseline: [{ path: ROUTE, measurements: [{ viewport: 'desktop', median: { lcpMs: 20 } }, { viewport: 'mobile', median: { lcpMs: 20 } }] }],
    measurements: [measurement('desktop'), measurement('mobile')],
    failures: [],
  };
}

describe('source-bound cutover evidence contracts', () => {
  it('derives changed-surface medians and rejects raw, issue, source, release, and summary tampering', () => {
    const receipt = performanceReceipt();
    expect(deriveChangedSurfacePerformance(receipt, {
      implementationCommit: COMMIT,
      releaseId: RELEASE,
      routeSourceHash: HASH,
      measurementImplementationHash: HASH,
      harnessHash: HASH,
      configHash: HASH,
      releaseManifestHash: HASH,
    })).toMatchObject({ eligible: true, metrics: [{ lcp_median_ms: 20 }, { lcp_median_ms: 20 }] });

    const mutations: Array<(value: any) => void> = [
      (value) => { value.measurements[0].measurement.median.lcpMs = 1; },
      (value) => { value.measurements[0].measurement.samples[0].consoleErrors.push('forged'); },
      (value) => { value.sourceHashes.routes[ROUTE] = `sha256:${'d'.repeat(64)}`; },
      (value) => { value.releaseId = 'e'.repeat(64); },
      (value) => { value.measurements[0].measurement.samples[0].lcpElement = null; },
      (value) => { value.extra = true; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipt);
      mutate(changed);
      expect(() => deriveChangedSurfacePerformance(changed, {
        implementationCommit: COMMIT,
        releaseId: RELEASE,
        routeSourceHash: HASH,
        measurementImplementationHash: HASH,
        harnessHash: HASH,
        configHash: HASH,
        releaseManifestHash: HASH,
      })).toThrow();
    }
  });

  it('rejects replacement, foreign-parent, PID, and observed-command mismatches', () => {
    const identity = {
      role: 'react', root_pid: 101, root_ppid: 99, root_pgid: 101, start_identity: 'start-a',
      argv: ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'],
      observed: { pid: 101, ppid: 99, pgid: 101, start_identity: 'start-a', command_line: 'npm run site:preview -- --host 127.0.0.1 --port 4391' },
    };
    expect(() => validateOwnedProcessIdentity(identity, { controllerPid: 99, expectedArgv: identity.argv })).not.toThrow();
    for (const changed of [
      { ...identity, root_pid: 102 },
      { ...identity, root_ppid: 1, observed: { ...identity.observed, ppid: 1 } },
      { ...identity, root_pgid: 777, observed: { ...identity.observed, pgid: 777 } },
      { ...identity, observed: { ...identity.observed, start_identity: 'replacement' } },
      { ...identity, observed: { ...identity.observed, command_line: 'npm run foreign' } },
    ]) expect(() => validateOwnedProcessIdentity(changed, { controllerPid: 99, expectedArgv: identity.argv })).toThrow();
    expect(npmObservedCommandLine(['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1']))
      .toBe('npm run site:preview --host 127.0.0.1');
    expect(ownedCommandLineReady(
      'node /opt/homebrew/opt/node@24/bin/npm run site:preview -- --host 127.0.0.1',
      ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1'],
    )).toBe(false);
    expect(ownedCommandLineReady(
      'npm run site:preview --host 127.0.0.1',
      ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1'],
    )).toBe(true);
  });

  it('requires the exact 80 dynamic route set with zero mandatory issues', () => {
    const routes = Array.from({ length: 80 }, (_, index) => `/route-${index}/`);
    const crawl = routes.map((path) => ({
      path, status: 200, final_url: path, redirected: false,
      console_errors: [], page_errors: [], hydration_errors: [], axe_serious_or_critical: [],
      overflow: { expected_max_width: 1440, actual_scroll_width: 1440, overflow: false },
      private_boundary_hits: [],
    }));
    expect(() => assertDynamicCrawl(crawl, routes)).not.toThrow();
    expect(() => assertDynamicCrawl([...crawl, crawl[0]], routes)).toThrow(/duplicate|exact/iu);
    const issue: Array<any> = structuredClone(crawl);
    issue[3].hydration_errors.push('mismatch');
    expect(() => assertDynamicCrawl(issue, routes)).toThrow(/mandatory|hydration/iu);
  });

  it('rejects tampering in every material local receipt group', () => {
    const receipt = {
      schema_version: 2, implementation_commit: COMMIT,
      ports: { proxy: 4390, react: 4391, astro: 4392 },
      representatives: REPRESENTATIVES,
      transitions: ['react', 'astro', 'react'].map((target) => ({ target, routes: REPRESENTATIVES.map((path) => ({ path, status: 200, target_header: target, body_hash: HASH })) })),
      processes: [{ role: 'react', stopped: true }, { role: 'astro', stopped: true }, { role: 'proxy', stopped: true }],
      proxy_worker: { descendant_of_proxy: true, stopped: true },
      port_lifecycle: { before_free: [4390, 4391, 4392], during_owned: [4390, 4391, 4392], after_free: [4390, 4391, 4392] },
      temp_root: { pattern: '/tmp/beyondwin-cutover.*', realpath_validated: true, removed: true },
      dynamic_crawl: { route_count: 80, failures: [] },
      static_contract: { route_count: 80, inventory_hash: HASH, failures: [] },
    };
    expect(() => assertLocalReceiptMaterialGroups(receipt, { implementationCommit: COMMIT, representatives: REPRESENTATIVES })).not.toThrow();
    for (const mutate of [
      (x: any) => { x.ports.proxy = 4400; },
      (x: any) => { x.transitions[1].target = 'react'; },
      (x: any) => { x.representatives.pop(); },
      (x: any) => { x.processes[0].stopped = false; },
      (x: any) => { x.proxy_worker.descendant_of_proxy = false; },
      (x: any) => { x.temp_root.removed = false; },
      (x: any) => { x.dynamic_crawl.failures.push('error'); },
      (x: any) => { x.extra = true; },
    ]) {
      const changed = structuredClone(receipt); mutate(changed);
      expect(() => assertLocalReceiptMaterialGroups(changed, { implementationCommit: COMMIT, representatives: REPRESENTATIVES })).toThrow();
    }
  });

  it('rejects tampering in every material clean-host receipt group', () => {
    const receipt = {
      schema_version: 2, implementation_commit: COMMIT, eligible: true,
      archive_hash: HASH, archive_inventory_hash: '', archive_inventory_count: 2,
      archive_inventory: ['a', 'b'], exclusions: { dependencies: true, generated_output: true, secrets_and_environment: true, top_level_private_memory: true },
      environment: { allowed_keys: ['PATH'], npm_userconfig_hash: HASH, config_inventory_hash: HASH, cache_inventory_hash_before: HASH },
      commands: [{ phase: 'install', argv: ['npm', 'ci'], exit_code: 0, stopped: true }],
      release: { release_id: RELEASE, active_pointer_hash: HASH, manifest_hash: HASH, artifact_hash: HASH },
      selected_build_hash: HASH, route_count: 80, inventory_hash: HASH,
      smoke: Array.from({ length: 80 }, (_, index) => ({ path: `/route-${index}/`, status: 200, body_hash: HASH })),
      temp_root: { pattern: '/tmp/beyondwin-clean-host.*', realpath_validated: true, removed: true }, errors: [],
    };
    receipt.archive_inventory_hash = `sha256:${createHash('sha256').update('a\nb\n').digest('hex')}`;
    expect(() => assertCleanHostReceiptMaterialGroups(receipt, { implementationCommit: COMMIT })).not.toThrow();
    for (const mutate of [
      (x: any) => { x.archive_hash = ''; },
      (x: any) => { x.archive_inventory.push('node_modules/a'); },
      (x: any) => { x.exclusions.dependencies = false; },
      (x: any) => { x.environment.allowed_keys.push('NPM_TOKEN'); },
      (x: any) => { x.commands[0].exit_code = 1; },
      (x: any) => { x.release.release_id = ''; },
      (x: any) => { x.smoke.pop(); },
      (x: any) => { x.temp_root.removed = false; },
      (x: any) => { x.errors.push('failure'); },
      (x: any) => { x.extra = true; },
    ]) {
      const changed = structuredClone(receipt); mutate(changed);
      expect(() => assertCleanHostReceiptMaterialGroups(changed, { implementationCommit: COMMIT })).toThrow();
    }
  });
});
