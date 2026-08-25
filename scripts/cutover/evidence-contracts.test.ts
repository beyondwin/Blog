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
import { installOwnedSignalHandlers, type SignalTarget } from './owned-process-lifecycle.mts';
import { parsePortOwnerPids } from './verify-rollback.mts';

const HASH = `sha256:${'a'.repeat(64)}`;
const COMMIT = 'b'.repeat(40);
const RELEASE = 'c'.repeat(64);
const ROUTE = '/reviews/black-swan/';
const REPRESENTATIVES = ['/', '/articles/a/', ROUTE, '/memory/a/', '/search/', '/tags/AI/', '/reviews/redirect/'];
const AT = '2026-08-26T00:00:00.000Z';
const LOCAL_TEMP = '/tmp/beyondwin-cutover.test';
const CLEAN_TEMP = '/tmp/beyondwin-clean-host.test';
const LOCAL_REAL_TEMP = '/private/tmp/beyondwin-cutover.test';
const CLEAN_REAL_TEMP = '/private/tmp/beyondwin-clean-host.test';
const LOCAL_CONTROLLER_ARGV = ['/node24', '/repo/scripts/cutover/verify-rollback.mts', '--implementation-commit', COMMIT, '--performance-receipt', '/repo/performance.json', '--output', '/repo/local.json'];
const CLEAN_CONTROLLER_ARGV = ['/node24', '/repo/scripts/cutover/verify-clean-host.mts', '--commit', COMMIT, '--output', '/repo/clean.json'];
const LOCAL_CONTROLLER_COMMAND = `tsx:${LOCAL_CONTROLLER_ARGV.join(' ')}`;
const CLEAN_CONTROLLER_COMMAND = `tsx:${CLEAN_CONTROLLER_ARGV.join(' ')}`;

function controllerEvidence(argv: string[], commandLine: string) {
  const observed = { pid: 99, ppid: 88, pgid: 77, start_identity: 'controller-start', command_line: commandLine };
  return {
    pid: 99, ppid: 88, pgid: 77, argv, start_identity: 'controller-start', observed,
    signal_handlers: { installed_at: AT, signals: ['SIGINT', 'SIGTERM'], active: false, handled_signal: null, cleanup_completed: true, removed_at: AT },
  };
}

function ownedProcess(role: string, rootPid: number, requireTerm: boolean, argv: string[], commandLine: string, extras: Record<string, unknown> = {}) {
  const observed = { pid: rootPid, ppid: 99, pgid: rootPid, start_identity: `${role}-start`, command_line: commandLine };
  return {
    role, argv, expected_command_line: commandLine, root_pid: rootPid, root_ppid: 99, root_pgid: rootPid,
    start_identity: `${role}-start`, observed, started_at: AT,
    stabilization: { completed_at: AT, polls: 1, observed_commands: [observed.command_line] },
    pre_term_identity: requireTerm ? observed : null, term_sent_at: requireTerm ? AT : null,
    root_exit: { exited_at: AT, exit_code: requireTerm ? null : 0, signal: requireTerm ? 'SIGTERM' : null },
    group_lifecycle: { members_observed: [observed], group_empty: true, polls: 1, completed_at: AT }, stopped: true,
    ...extras,
  };
}

function sample(lcpMs: number, expectedMaxWidth: number) {
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
    overflow: { expectedMaxWidth, actualScrollWidth: expectedMaxWidth, overflow: false },
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
      samples: [20, 20, 20, 24, 24].map((lcpMs) => sample(lcpMs, viewport === 'desktop' ? 1440 : 390)),
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
    baseline: [{ path: ROUTE, measurements: [
      { viewport: 'desktop', median: { lcpMs: 20, cls: 0, jsGzipBytes: 230, imageBytes: 58_350 }, mad: { lcpMs: 0, cls: 0, jsGzipBytes: 0, imageBytes: 0 } },
      { viewport: 'mobile', median: { lcpMs: 20, cls: 0, jsGzipBytes: 230, imageBytes: 58_350 }, mad: { lcpMs: 0, cls: 0, jsGzipBytes: 0, imageBytes: 0 } },
    ] }],
    measurements: [measurement('desktop'), measurement('mobile')],
    failures: [],
  };
}

function rendererBaseline() {
  const measurement = (viewport: 'desktop' | 'mobile') => ({
    viewport,
    size: viewport === 'desktop' ? { width: 1440, height: 960 } : { width: 390, height: 844 },
    warmupDiscarded: 1,
    sampleCount: 5,
    samples: [20, 20, 20, 24, 24].map((lcpMs) => ({
      cls: 0, lcpMs, jsGzipBytes: 230, imageBytes: 58_350, renderedImages: [], imageFailures: [],
      consoleErrors: [], hydrationErrors: [], axeSeriousOrCritical: [],
      overflow: { expectedMaxWidth: viewport === 'desktop' ? 1440 : 390, actualScrollWidth: viewport === 'desktop' ? 1440 : 390, overflow: false },
      privateBoundaryHits: [],
    })),
    median: { lcpMs: 20, cls: 0, jsGzipBytes: 230, imageBytes: 58_350 },
    mad: { lcpMs: 0, cls: 0, jsGzipBytes: 0, imageBytes: 0 },
    consoleErrors: [], hydrationErrors: [], axeSeriousOrCritical: [], imageFailures: [],
    overflow: { expectedMaxWidth: viewport === 'desktop' ? 1440 : 390, actualScrollWidth: viewport === 'desktop' ? 1440 : 390, overflow: false },
    privateBoundaryHits: [],
  });
  return { routes: [{ path: ROUTE, measurements: [measurement('desktop'), measurement('mobile')] }] };
}

const bindings = {
  implementationCommit: COMMIT,
  releaseId: RELEASE,
  routeSourceHash: HASH,
  measurementImplementationHash: HASH,
  harnessHash: HASH,
  configHash: HASH,
  releaseManifestHash: HASH,
};

describe('source-bound cutover evidence contracts', () => {
  it('derives changed-surface medians and rejects raw, issue, source, release, and summary tampering', () => {
    const receipt = performanceReceipt();
    const baseline = rendererBaseline();
    expect(deriveChangedSurfacePerformance(receipt, bindings, baseline))
      .toMatchObject({ eligible: true, metrics: [{ lcp_median_ms: 20 }, { lcp_median_ms: 20 }] });

    const mutations: Array<(value: any) => void> = [
      (value) => { value.measurements[0].measurement.median.lcpMs = 1; },
      (value) => { value.measurements[0].measurement.mad.lcpMs = 999; },
      (value) => { value.measurements[0].measurement.size.width = 390; },
      (value) => { value.measurements[0].measurement.samples = value.measurements[0].measurement.samples.map((sample: any) => ({ ...sample, lcpMs: 80 })); value.measurements[0].measurement.median.lcpMs = 80; },
      (value) => { value.measurements[0].path = '/reviews/other/'; },
      (value) => { value.measurements[0].viewport = 'mobile'; },
      (value) => { value.baseline.find((entry: any) => entry.path === ROUTE).measurements[0].median.lcpMs = 999; },
      (value) => { value.measurements[0].measurement.samples[0].consoleErrors.push('forged'); },
      (value) => { value.sourceHashes.routes[ROUTE] = `sha256:${'d'.repeat(64)}`; },
      (value) => { value.releaseId = 'e'.repeat(64); },
      (value) => { value.measurements[0].measurement.samples[0].lcpElement = null; },
      (value) => { value.extra = true; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(receipt);
      mutate(changed);
      expect(() => deriveChangedSurfacePerformance(changed, bindings, baseline)).toThrow();
    }
    const forgedBaseline = structuredClone(baseline);
    forgedBaseline.routes[0].measurements[0].median.lcpMs = 999;
    expect(() => deriveChangedSurfacePerformance(receipt, bindings, forgedBaseline)).toThrow();
  });

  it('rejects replacement, foreign-parent, PID, and observed-command mismatches', () => {
    const identity = {
      role: 'react', root_pid: 101, root_ppid: 99, root_pgid: 101, start_identity: 'start-a',
      argv: ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'],
      expected_command_line: 'npm run site:preview -- --host 127.0.0.1 --port 4391',
      observed: { pid: 101, ppid: 99, pgid: 101, start_identity: 'start-a', command_line: 'npm run site:preview -- --host 127.0.0.1 --port 4391' },
    };
    const expected = { controllerPid: 99, expectedRole: 'react', expectedArgv: identity.argv };
    expect(() => validateOwnedProcessIdentity(identity, expected)).not.toThrow();
    for (const changed of [
      { ...identity, root_pid: 102 },
      { ...identity, root_ppid: 1, observed: { ...identity.observed, ppid: 1 } },
      { ...identity, root_pgid: 777, observed: { ...identity.observed, pgid: 777 } },
      { ...identity, observed: { ...identity.observed, start_identity: 'replacement' } },
      { ...identity, observed: { ...identity.observed, command_line: 'npm run foreign' } },
    ]) expect(() => validateOwnedProcessIdentity(changed, expected)).toThrow();
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
    const expected = routes.map((path) => ({ path, finalUrl: path, redirected: false }));
    const crawl = routes.map((path) => ({
      path, status: 200, final_url: path, redirected: false,
      console_errors: [], page_errors: [], hydration_errors: [], axe_serious_or_critical: [],
      overflow: { expected_max_width: 1440, actual_scroll_width: 1440, overflow: false },
      private_boundary_hits: [],
    }));
    expect(() => assertDynamicCrawl(crawl, expected)).not.toThrow();
    expect(() => assertDynamicCrawl([...crawl, crawl[0]], expected)).toThrow(/duplicate|exact/iu);
    const issue: Array<any> = structuredClone(crawl);
    issue[3].hydration_errors.push('mismatch');
    expect(() => assertDynamicCrawl(issue, expected)).toThrow(/mandatory|hydration/iu);
    for (const mutate of [
      (value: any[]) => { delete value[0].overflow.overflow; },
      (value: any[]) => { value[0].overflow.actual_scroll_width = Number.MAX_SAFE_INTEGER + 1; },
      (value: any[]) => { value[0].overflow.actual_scroll_width = 1441; value[0].overflow.overflow = false; },
      (value: any[]) => { value[0].overflow.extra = true; },
      (value: any[]) => { value[0].extra = true; },
      (value: any[]) => { value[0].final_url = '/wrong/'; },
      (value: any[]) => { value[0].redirected = 'false'; },
    ]) {
      const changed = structuredClone(crawl); mutate(changed);
      expect(() => assertDynamicCrawl(changed, expected)).toThrow();
    }
  });

  it('runs the same asynchronous owned cleanup for SIGINT and SIGTERM before exit', async () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const listeners = new Map<string, (...args: any[]) => void>();
      const target: SignalTarget = {
        once: (name, handler) => { listeners.set(name, handler); return target; },
        removeListener: (name) => { listeners.delete(name); return target; },
      };
      const order: string[] = [];
      const installed = installOwnedSignalHandlers(
        target,
        async () => { order.push('cleanup'); },
        (code) => { order.push(`exit:${code}`); },
        { beforeExit: async (_handled, evidence) => {
          expect(evidence).toMatchObject({ active: false, handled_signal: signal, cleanup_completed: true });
          order.push('persist-blocked-receipt');
        } },
      );
      listeners.get(signal)!();
      await installed.completion();
      expect(order).toEqual(['cleanup', 'persist-blocked-receipt', `exit:${signal === 'SIGINT' ? 130 : 143}`]);
      expect(installed.evidence()).toMatchObject({ active: false, handled_signal: signal, cleanup_completed: true });
    }
  });

  it('never turns an empty lsof row into PID zero', () => {
    expect(parsePortOwnerPids('15513\n15514\n')).toEqual([15513, 15514]);
    expect(parsePortOwnerPids('\n')).toEqual([]);
  });

  it('rejects tampering in every material local receipt group', () => {
    const reactArgv = ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'];
    const astroArgv = ['npm', 'run', 'legacy:preview', '--', '--host', '127.0.0.1', '--port', '4392'];
    const proxyArgv = ['npm', 'run', 'cutover:proxy', '--', '--listen', '127.0.0.1:4390', '--react', 'http://127.0.0.1:4391', '--astro', 'http://127.0.0.1:4392', '--state', `${LOCAL_TEMP}/target`, '--pid-file', `${LOCAL_TEMP}/proxy.pid`];
    const receipt = {
      schema_version: 3, implementation_commit: COMMIT, eligible: true, errors: [],
      ports: { proxy: 4390, react: 4391, astro: 4392 },
      representatives: REPRESENTATIVES,
      transitions: ['react', 'astro', 'react'].map((target) => ({ target, routes: REPRESENTATIVES.map((path) => ({ path, status: 200, target_header: target, body_hash: HASH })) })),
      controller: controllerEvidence(LOCAL_CONTROLLER_ARGV, LOCAL_CONTROLLER_COMMAND),
      processes: [
        ownedProcess('react', 101, true, reactArgv, npmObservedCommandLine(reactArgv)),
        ownedProcess('astro', 102, true, astroArgv, npmObservedCommandLine(astroArgv)),
        ownedProcess('proxy', 103, true, proxyArgv, npmObservedCommandLine(proxyArgv)),
      ],
      proxy_worker: { descendant_of_proxy: true, stopped: true },
      port_lifecycle: { before_free: [4390, 4391, 4392], during_owned: [4390, 4391, 4392], after_free: [4390, 4391, 4392] },
      temp_root: { pattern: '/tmp/beyondwin-cutover.*', path: LOCAL_TEMP, realpath: LOCAL_REAL_TEMP, realpath_validated: true, removed: true },
      dynamic_crawl: { route_count: 80, failures: [] },
      static_contract: { route_count: 80, inventory_hash: HASH, failures: [] },
    };
    const expected = { implementationCommit: COMMIT, representatives: REPRESENTATIVES, controllerArgv: LOCAL_CONTROLLER_ARGV, controllerObservedCommandLine: LOCAL_CONTROLLER_COMMAND };
    expect(() => assertLocalReceiptMaterialGroups(receipt, expected)).not.toThrow();
    for (const mutate of [
      (x: any) => { x.ports.proxy = 4400; },
      (x: any) => { x.transitions[1].target = 'react'; },
      (x: any) => { x.representatives.pop(); },
      (x: any) => { x.processes[0].stopped = false; },
      (x: any) => { x.processes[0].group_lifecycle.group_empty = false; },
      (x: any) => { x.processes[0].root_ppid = 1; },
      (x: any) => { x.processes[0].argv = ['npm', 'run', 'foreign']; x.processes[0].observed.command_line = 'npm run foreign'; x.processes[0].expected_command_line = 'npm run foreign'; x.processes[0].stabilization.observed_commands = ['npm run foreign']; x.processes[0].pre_term_identity.command_line = 'npm run foreign'; x.processes[0].group_lifecycle.members_observed[0].command_line = 'npm run foreign'; },
      (x: any) => { x.controller.argv = ['/node24', '/repo/foreign.mts']; x.controller.observed.command_line = 'tsx:/node24 /repo/foreign.mts'; },
      (x: any) => { x.controller.signal_handlers.active = true; },
      (x: any) => { x.proxy_worker.descendant_of_proxy = false; },
      (x: any) => { x.temp_root.removed = false; },
      (x: any) => { x.temp_root.path = '/tmp/beyondwin-cutover.test/../escape'; },
      (x: any) => { x.temp_root.realpath = '/private/tmp/foreign.test'; },
      (x: any) => { x.dynamic_crawl.failures.push('error'); },
      (x: any) => { x.eligible = false; },
      (x: any) => { x.errors.push('failure'); },
      (x: any) => { x.extra = true; },
    ]) {
      const changed = structuredClone(receipt); mutate(changed);
      expect(() => assertLocalReceiptMaterialGroups(changed, expected)).toThrow();
    }
  });

  it('rejects tampering in every material clean-host receipt group', () => {
    const archiveArgv = ['git', 'archive', '--format=tar', `--output=${CLEAN_TEMP}/source.tar`, COMMIT, '--', '.', ':(exclude)memory', ':(exclude)build', ':(exclude)output', ':(exclude).superpowers', ':(exclude).env', ':(exclude).env.*'];
    const receipt = {
      schema_version: 2, implementation_commit: COMMIT, created_at: AT, completed_at: AT, eligible: true,
      archive_hash: HASH, archive_inventory_hash: '', archive_inventory_count: 2,
      archive_inventory: ['a', 'b'], exclusions: { dependencies: true, generated_output: true, secrets_and_environment: true, top_level_private_memory: true },
      controller: controllerEvidence(CLEAN_CONTROLLER_ARGV, CLEAN_CONTROLLER_COMMAND),
      environment: { allowed_keys: ['PATH'], npm_userconfig_hash: HASH, npm_globalconfig_hash: HASH, config_inventory_hash: HASH, cache_inventory_hash_before: HASH },
      commands: [
        ownedProcess('install:git', 201, false, archiveArgv, archiveArgv.join(' '), { phase: 'install', environment_keys: ['PATH'] }),
        ownedProcess('install:tar', 202, false, ['tar', '-xf', `${CLEAN_TEMP}/source.tar`, '-C', `${CLEAN_TEMP}/repository`], `tar -xf ${CLEAN_TEMP}/source.tar -C ${CLEAN_TEMP}/repository`, { phase: 'install', environment_keys: ['PATH'] }),
        ownedProcess('install:npm', 203, false, ['npm', 'ci'], 'npm ci', { phase: 'install', environment_keys: ['PATH'] }),
        ownedProcess('build:npm', 204, false, ['npm', 'run', 'public-release:build'], 'npm run public-release:build', { phase: 'build', environment_keys: ['NODE_ENV', 'PATH'] }),
        ownedProcess('build:npm', 205, false, ['npm', 'run', 'public-release:verify'], 'npm run public-release:verify', { phase: 'build', environment_keys: ['NODE_ENV', 'PATH'] }),
        ownedProcess('build:npm', 206, false, ['npm', 'run', 'site:build'], 'npm run site:build', { phase: 'build', environment_keys: ['NODE_ENV', 'PATH'] }),
      ],
      release: { release_id: RELEASE, active_pointer_hash: HASH, manifest_hash: HASH, artifact_hash: HASH },
      selected_build_hash: HASH, route_count: 80, inventory_hash: HASH,
      smoke: Array.from({ length: 80 }, (_, index) => ({ path: `/route-${index}/`, status: 200, body_hash: HASH })),
      temp_root: { pattern: '/tmp/beyondwin-clean-host.*', path: CLEAN_TEMP, realpath: CLEAN_REAL_TEMP, realpath_validated: true, removed: true, preview_port: 49152 }, errors: [],
    };
    receipt.archive_inventory_hash = `sha256:${createHash('sha256').update('a\nb\n').digest('hex')}`;
    const expected = { implementationCommit: COMMIT, controllerArgv: CLEAN_CONTROLLER_ARGV, controllerObservedCommandLine: CLEAN_CONTROLLER_COMMAND };
    expect(() => assertCleanHostReceiptMaterialGroups(receipt, expected)).not.toThrow();
    for (const mutate of [
      (x: any) => { x.archive_hash = ''; },
      (x: any) => { x.archive_inventory.push('node_modules/a'); },
      (x: any) => { x.exclusions.dependencies = false; },
      (x: any) => { x.environment.allowed_keys.push('NPM_TOKEN'); },
      (x: any) => { x.environment.npm_globalconfig_hash = ''; },
      (x: any) => { x.controller.signal_handlers.cleanup_completed = false; },
      (x: any) => { x.commands[0].root_exit.exit_code = 1; x.commands[0].stopped = false; },
      (x: any) => { x.commands[0].argv = ['git', 'status']; x.commands[0].observed.command_line = 'git status'; x.commands[0].expected_command_line = 'git status'; x.commands[0].stabilization.observed_commands = ['git status']; x.commands[0].group_lifecycle.members_observed[0].command_line = 'git status'; },
      (x: any) => { x.controller.argv = ['/node24', '/repo/foreign.mts']; x.controller.observed.command_line = 'tsx:/node24 /repo/foreign.mts'; },
      (x: any) => { x.release.release_id = ''; },
      (x: any) => { x.smoke.pop(); },
      (x: any) => { x.temp_root.removed = false; },
      (x: any) => { x.temp_root.path = '/tmp/beyondwin-clean-host.test/../escape'; },
      (x: any) => { x.temp_root.realpath = '/private/tmp/beyondwin-clean-host.other'; },
      (x: any) => { x.errors.push('failure'); },
      (x: any) => { x.extra = true; },
    ]) {
      const changed = structuredClone(receipt); mutate(changed);
      expect(() => assertCleanHostReceiptMaterialGroups(changed, expected)).toThrow();
    }
  });
});
