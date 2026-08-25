import { median, medianAbsoluteDeviation } from '../../tools/parity/src/measure-browser.ts';
import { realpathSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './cutover-evidence.mts';

type UnknownRecord = Record<string, unknown>;
const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const releasePattern = /^[a-f0-9]{64}$/u;
const REVIEW_ROUTE = '/reviews/black-swan/';

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): UnknownRecord {
  const object = record(value, label);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys are missing or extra: ${actual.join(',')}`);
  }
  return object;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) throw new Error(`${label} is invalid`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is invalid`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  return array(value, label).map((entry, index) => string(entry, `${label}[${index}]`));
}

function assertHash(value: unknown, label: string): string {
  return string(value, label, hashPattern);
}

function assertNoDuplicates(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains a duplicate`);
}

export interface ChangedSurfaceBindings {
  implementationCommit: string;
  releaseId: string;
  routeSourceHash: string;
  measurementImplementationHash: string;
  harnessHash: string;
  configHash: string;
  releaseManifestHash: string;
}

const viewportSizes = {
  desktop: { width: 1440, height: 960 },
  mobile: { width: 390, height: 844 },
} as const;

type Viewport = keyof typeof viewportSizes;

function safeMetric(value: unknown, label: string): number {
  const metric = number(value, label);
  if (metric < 0) throw new Error(`${label} must be non-negative`);
  return metric;
}

function assertOverflow(value: unknown, width: number, label: string): UnknownRecord {
  const overflow = exactKeys(value, ['expectedMaxWidth', 'actualScrollWidth', 'overflow'], label);
  if (overflow.expectedMaxWidth !== width) throw new Error(`${label} expected width drifted`);
  const actual = number(overflow.actualScrollWidth, `${label}.actualScrollWidth`);
  if (!Number.isSafeInteger(actual) || actual < 0) throw new Error(`${label} actual width is invalid`);
  if (boolean(overflow.overflow, `${label}.overflow`) !== (actual > width)) throw new Error(`${label} boolean is not derived from widths`);
  return overflow;
}

function metricValues(value: unknown, label: string): Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number> {
  const metrics = exactKeys(value, ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes'], label);
  return {
    lcpMs: safeMetric(metrics.lcpMs, `${label}.lcpMs`),
    cls: safeMetric(metrics.cls, `${label}.cls`),
    jsGzipBytes: safeMetric(metrics.jsGzipBytes, `${label}.jsGzipBytes`),
    imageBytes: safeMetric(metrics.imageBytes, `${label}.imageBytes`),
  };
}

function deriveRawMetrics(samples: Array<Record<'lcp' | 'cls' | 'js' | 'image', number>>): {
  median: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number>;
  mad: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number>;
} {
  const series = {
    lcpMs: samples.map(({ lcp }) => lcp), cls: samples.map(({ cls }) => cls),
    jsGzipBytes: samples.map(({ js }) => js), imageBytes: samples.map(({ image }) => image),
  };
  return {
    median: Object.fromEntries(Object.entries(series).map(([key, values]) => [key, median(values)])) as any,
    mad: Object.fromEntries(Object.entries(series).map(([key, values]) => [key, medianAbsoluteDeviation(values)])) as any,
  };
}

function assertDerivedValues(reported: unknown, derived: Record<string, number>, label: string): void {
  const values = metricValues(reported, label);
  for (const [key, value] of Object.entries(derived)) if (values[key as keyof typeof values] !== value) throw new Error(`${label} ${key} is forged`);
}

function trackedReviewBaseline(input: unknown): Map<Viewport, { median: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number>; mad: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number> }> {
  const root = record(input, 'tracked Astro renderer baseline');
  const routes = array(root.routes, 'tracked Astro renderer routes').map((entry) => record(entry, 'tracked Astro route'));
  const reviewRoutes = routes.filter(({ path }) => path === REVIEW_ROUTE);
  if (reviewRoutes.length !== 1) throw new Error('tracked Astro review baseline is missing or duplicated');
  const measurements = array(reviewRoutes[0]!.measurements, 'tracked Astro review measurements');
  if (measurements.length !== 2) throw new Error('tracked Astro review baseline must contain two cells');
  const result = new Map<Viewport, { median: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number>; mad: Record<'lcpMs' | 'cls' | 'jsGzipBytes' | 'imageBytes', number> }>();
  for (const entry of measurements) {
    const cell = exactKeys(entry, [
      'viewport', 'size', 'warmupDiscarded', 'sampleCount', 'samples', 'median', 'mad',
      'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'overflow', 'privateBoundaryHits',
    ], 'tracked Astro review cell');
    if (cell.viewport !== 'desktop' && cell.viewport !== 'mobile') throw new Error('tracked Astro review viewport drifted');
    const viewport = cell.viewport;
    if (result.has(viewport)) throw new Error('tracked Astro review viewport duplicated');
    if (JSON.stringify(exactKeys(cell.size, ['width', 'height'], 'tracked Astro review size')) !== JSON.stringify(viewportSizes[viewport])) throw new Error('tracked Astro review size drifted');
    if (cell.warmupDiscarded !== 1 || cell.sampleCount !== 5) throw new Error('tracked Astro review protocol drifted');
    const samples = array(cell.samples, 'tracked Astro review samples');
    if (samples.length !== 5) throw new Error('tracked Astro review raw sample count drifted');
    const raw = samples.map((sampleValue) => {
      const sample = exactKeys(sampleValue, [
        'cls', 'lcpMs', 'jsGzipBytes', 'imageBytes', 'renderedImages', 'imageFailures', 'consoleErrors',
        'hydrationErrors', 'axeSeriousOrCritical', 'overflow', 'privateBoundaryHits',
      ], 'tracked Astro review sample');
      array(sample.renderedImages, 'tracked Astro rendered images');
      for (const key of ['imageFailures', 'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'privateBoundaryHits']) strings(sample[key], `tracked Astro sample.${key}`);
      assertOverflow(sample.overflow, viewportSizes[viewport].width, 'tracked Astro sample overflow');
      return { lcp: safeMetric(sample.lcpMs, 'tracked Astro sample LCP'), cls: safeMetric(sample.cls, 'tracked Astro sample CLS'), js: safeMetric(sample.jsGzipBytes, 'tracked Astro sample JS'), image: safeMetric(sample.imageBytes, 'tracked Astro sample image') };
    });
    const derived = deriveRawMetrics(raw);
    assertDerivedValues(cell.median, derived.median, 'tracked Astro median');
    assertDerivedValues(cell.mad, derived.mad, 'tracked Astro MAD');
    const widest = raw.length > 0 ? (samples as UnknownRecord[]).map((sample) => record(sample.overflow, 'tracked Astro overflow')).reduce((left, right) => Number(right.actualScrollWidth) > Number(left.actualScrollWidth) ? right : left) : null;
    if (!widest || JSON.stringify(cell.overflow) !== JSON.stringify(widest)) throw new Error('tracked Astro overflow summary is forged');
    for (const key of ['consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'privateBoundaryHits']) strings(cell[key], `tracked Astro measurement.${key}`);
    result.set(viewport, derived);
  }
  return result;
}

function issueUnion(sample: UnknownRecord): string[] {
  const issues = ['consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'privateBoundaryHits']
    .flatMap((key) => strings(sample[key], `sample.${key}`));
  const overflow = exactKeys(sample.overflow, ['expectedMaxWidth', 'actualScrollWidth', 'overflow'], 'sample.overflow');
  if (boolean(overflow.overflow, 'sample.overflow.overflow')) issues.push('horizontal-overflow');
  return [...new Set(issues)].sort();
}

export function sealChangedSurfacePerformance(input: unknown): UnknownRecord {
  const source = record(input, 'performance report');
  const selection = record(source.selection, 'performance selection');
  const hashes = record(source.sourceHashes, 'performance source hashes');
  const protocol = record(source.protocol, 'performance protocol');
  return {
    version: source.version,
    renderer: source.renderer,
    measuredAt: source.measuredAt,
    releaseId: source.releaseId,
    repositoryHead: source.repositoryHead,
    selection: {
      selector: selection.selector,
      routeNames: selection.routeNames,
      selectedRoutes: selection.selectedRoutes,
    },
    sourceHashes: {
      routes: { [REVIEW_ROUTE]: record(hashes.routes, 'performance route hashes')[REVIEW_ROUTE] },
      measurementImplementation: hashes.measurementImplementation,
      harness: hashes.harness,
      config: hashes.config,
      releaseManifest: hashes.releaseManifest,
    },
    protocol: {
      routes: protocol.routes,
      viewports: protocol.viewports,
      warmups: protocol.warmups,
      coldSamplesPerCell: protocol.coldSamplesPerCell,
      freshContextPerSample: protocol.freshContextPerSample,
      clearedHttpCachePerSample: protocol.clearedHttpCachePerSample,
    },
    budgets: source.budgets,
    baseline: source.baseline,
    measurements: source.measurements,
    failures: source.failures,
  };
}

export function deriveChangedSurfacePerformance(
  input: unknown,
  expected: ChangedSurfaceBindings,
  trackedBaseline: unknown,
): { eligible: boolean; metrics: Array<{ viewport: string; lcp_median_ms: number; cls_median: number; initial_js_gzip_bytes: number; image_bytes: number; mandatory_issues: number }> } {
  const root = exactKeys(input, [
    'version', 'renderer', 'measuredAt', 'releaseId', 'repositoryHead', 'selection', 'sourceHashes',
    'protocol', 'budgets', 'baseline', 'measurements', 'failures',
  ], 'changed-surface receipt');
  if (root.version !== 2 || root.renderer !== 'react-router') throw new Error('changed-surface renderer/version is invalid');
  string(root.measuredAt, 'changed-surface measuredAt');
  if (root.repositoryHead !== expected.implementationCommit || !commitPattern.test(expected.implementationCommit)) throw new Error('changed-surface implementation commit drifted');
  if (root.releaseId !== expected.releaseId || !releasePattern.test(expected.releaseId)) throw new Error('changed-surface release drifted');
  const selection = exactKeys(root.selection, ['selector', 'routeNames', 'selectedRoutes'], 'changed-surface selection');
  if (selection.selector !== 'review' || JSON.stringify(selection.routeNames) !== '["review"]' || JSON.stringify(selection.selectedRoutes) !== `["${REVIEW_ROUTE}"]`) {
    throw new Error('changed-surface selection is not exact review-only');
  }
  const hashes = exactKeys(root.sourceHashes, ['routes', 'measurementImplementation', 'harness', 'config', 'releaseManifest'], 'changed-surface hashes');
  const routes = exactKeys(hashes.routes, [REVIEW_ROUTE], 'changed-surface route hashes');
  for (const [actual, wanted, label] of [
    [routes[REVIEW_ROUTE], expected.routeSourceHash, 'route'],
    [hashes.measurementImplementation, expected.measurementImplementationHash, 'measurement'],
    [hashes.harness, expected.harnessHash, 'harness'],
    [hashes.config, expected.configHash, 'config'],
    [hashes.releaseManifest, expected.releaseManifestHash, 'release manifest'],
  ] as const) {
    assertHash(actual, `changed-surface ${label} hash`);
    if (actual !== wanted) throw new Error(`changed-surface ${label} binding drifted`);
  }
  const protocol = exactKeys(root.protocol, ['routes', 'viewports', 'warmups', 'coldSamplesPerCell', 'freshContextPerSample', 'clearedHttpCachePerSample'], 'changed-surface protocol');
  if (JSON.stringify(protocol.routes) !== `["${REVIEW_ROUTE}"]`
    || JSON.stringify(protocol.viewports) !== '["desktop","mobile"]'
    || protocol.warmups !== 1 || protocol.coldSamplesPerCell !== 5
    || protocol.freshContextPerSample !== true || protocol.clearedHttpCachePerSample !== true) {
    throw new Error('changed-surface measurement protocol drifted');
  }
  const budgets = exactKeys(root.budgets, ['clsMax', 'lcpAstroMultiplier', 'detailInitialJsGzipBytesMax'], 'changed-surface budgets');
  if (budgets.clsMax !== 0.05 || budgets.lcpAstroMultiplier !== 1.1 || budgets.detailInitialJsGzipBytesMax !== 112_640) {
    throw new Error('changed-surface budgets drifted');
  }
  const baselineByViewport = trackedReviewBaseline(trackedBaseline);
  const embeddedRoutes = array(root.baseline, 'changed-surface baseline').map((entry) => exactKeys(entry, ['path', 'measurements'], 'changed-surface baseline route'));
  assertNoDuplicates(embeddedRoutes.map(({ path }) => string(path, 'changed-surface baseline path')), 'changed-surface baseline route');
  const embeddedReview = embeddedRoutes.find(({ path }) => path === REVIEW_ROUTE);
  if (!embeddedReview) throw new Error('changed-surface embedded review baseline is missing');
  const embeddedCells = array(embeddedReview.measurements, 'changed-surface embedded review measurements').map((entry) => {
    const cell = exactKeys(entry, ['viewport', 'median', 'mad'], 'changed-surface embedded review cell');
    if (cell.viewport !== 'desktop' && cell.viewport !== 'mobile') throw new Error('changed-surface embedded baseline viewport drifted');
    metricValues(cell.median, 'changed-surface embedded baseline median');
    metricValues(cell.mad, 'changed-surface embedded baseline MAD');
    return cell;
  });
  if (embeddedCells.length !== 2 || JSON.stringify(embeddedCells.map(({ viewport }) => viewport).sort()) !== '["desktop","mobile"]') throw new Error('changed-surface embedded baseline cells drifted');
  for (const cell of embeddedCells) {
    const tracked = baselineByViewport.get(cell.viewport as Viewport);
    if (!tracked || JSON.stringify(metricValues(cell.median, 'changed-surface embedded baseline median')) !== JSON.stringify(tracked.median)
      || JSON.stringify(metricValues(cell.mad, 'changed-surface embedded baseline MAD')) !== JSON.stringify(tracked.mad)) throw new Error('changed-surface embedded baseline is not bound to tracked Astro baseline');
  }
  const cells = array(root.measurements, 'changed-surface measurements');
  if (cells.length !== 2) throw new Error('changed-surface measurements must have two cells');
  const metrics = cells.map((entry) => {
    const cell = exactKeys(entry, ['path', 'viewport', 'measurement'], 'changed-surface cell');
    if (cell.path !== REVIEW_ROUTE || (cell.viewport !== 'desktop' && cell.viewport !== 'mobile')) throw new Error('changed-surface cell route/viewport drifted');
    const measurement = exactKeys(cell.measurement, [
      'viewport', 'size', 'warmupDiscarded', 'sampleCount', 'samples', 'median', 'mad',
      'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'overflow', 'privateBoundaryHits',
    ], 'changed-surface measurement');
    if (measurement.viewport !== cell.viewport || measurement.warmupDiscarded !== 1 || measurement.sampleCount !== 5) throw new Error('changed-surface cell protocol drifted');
    const viewport = cell.viewport as Viewport;
    if (JSON.stringify(exactKeys(measurement.size, ['width', 'height'], 'changed-surface size')) !== JSON.stringify(viewportSizes[viewport])) throw new Error('changed-surface viewport size drifted');
    const samples = array(measurement.samples, 'changed-surface samples');
    if (samples.length !== 5) throw new Error('changed-surface cell requires five raw samples');
    const sampleMetrics = samples.map((raw) => {
      const sample = exactKeys(raw, [
        'lcpMs', 'cls', 'jsGzipBytes', 'imageBytes', 'lcpElement', 'renderedImages', 'imageFailures',
        'consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'overflow', 'privateBoundaryHits',
      ], 'changed-surface sample');
      const lcpElement = exactKeys(sample.lcpElement, ['provenance', 'tagName', 'id', 'className', 'url', 'text'], 'sample LCP element');
      if (lcpElement.provenance !== 'largest-contentful-paint') throw new Error('sample LCP provenance is missing');
      for (const key of ['tagName', 'id', 'className', 'url', 'text']) string(lcpElement[key], `sample LCP ${key}`);
      array(sample.renderedImages, 'sample renderedImages');
      assertOverflow(sample.overflow, viewportSizes[viewport].width, 'sample overflow');
      return {
        lcp: number(sample.lcpMs, 'sample LCP'), cls: number(sample.cls, 'sample CLS'),
        js: number(sample.jsGzipBytes, 'sample JS'), image: number(sample.imageBytes, 'sample image'),
        issues: issueUnion(sample),
      };
    });
    const derivedValues = deriveRawMetrics(sampleMetrics);
    const derived = derivedValues.median;
    assertDerivedValues(measurement.median, derivedValues.median, 'changed-surface median');
    assertDerivedValues(measurement.mad, derivedValues.mad, 'changed-surface MAD');
    const summaryIssues = ['consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'privateBoundaryHits']
      .flatMap((key) => strings(measurement[key], `measurement.${key}`));
    const rawIssues = [...new Set(sampleMetrics.flatMap(({ issues }) => issues))].sort();
    const overflow = assertOverflow(measurement.overflow, viewportSizes[viewport].width, 'measurement overflow');
    const widest = (samples as UnknownRecord[]).map((sample) => record(sample.overflow, 'sample overflow')).reduce((left, right) => Number(right.actualScrollWidth) > Number(left.actualScrollWidth) ? right : left);
    if (JSON.stringify(overflow) !== JSON.stringify(widest)) throw new Error('changed-surface overflow summary is forged');
    if (overflow.overflow === true) summaryIssues.push('horizontal-overflow');
    if (JSON.stringify([...new Set(summaryIssues)].sort()) !== JSON.stringify(rawIssues)) throw new Error('changed-surface issue summary does not derive from raw samples');
    const baselineLcp = baselineByViewport.get(viewport)?.median.lcpMs;
    if (baselineLcp === undefined) throw new Error('changed-surface baseline cell is missing');
    const eligible = rawIssues.length === 0 && derived.cls <= 0.05 && derived.jsGzipBytes <= 112_640 && derived.lcpMs <= baselineLcp * 1.1;
    return {
      eligible,
      metric: {
        viewport: String(cell.viewport), lcp_median_ms: derived.lcpMs, cls_median: derived.cls,
        initial_js_gzip_bytes: derived.jsGzipBytes, image_bytes: derived.imageBytes,
        mandatory_issues: rawIssues.length,
      },
    };
  });
  assertNoDuplicates(metrics.map(({ metric }) => metric.viewport), 'changed-surface viewport');
  if (JSON.stringify(metrics.map(({ metric }) => metric.viewport).sort()) !== '["desktop","mobile"]') throw new Error('changed-surface viewport set drifted');
  const failures = strings(root.failures, 'changed-surface failures');
  const eligible = metrics.every((entry) => entry.eligible) && failures.length === 0;
  if ((failures.length === 0) !== metrics.every((entry) => entry.eligible)) throw new Error('changed-surface failure summary is forged');
  return { eligible, metrics: metrics.map(({ metric }) => metric) };
}

export function validateOwnedProcessIdentity(
  value: any,
  options: { controllerPid: number; expectedRole: string; expectedArgv: readonly string[]; expectedObservedCommandLine?: string },
): void {
  if (value.role !== options.expectedRole) throw new Error('owned process role drifted');
  if (value.root_pid !== value.observed?.pid) throw new Error('owned process PID was replaced');
  if (value.root_ppid !== options.controllerPid || value.observed?.ppid !== options.controllerPid) throw new Error('owned process has a foreign parent');
  if (value.root_pgid !== value.root_pid || value.observed?.pgid !== value.root_pid) throw new Error('owned process escaped its dedicated process group');
  if (value.start_identity !== value.observed?.start_identity) throw new Error('owned process start identity changed');
  if (JSON.stringify(value.argv) !== JSON.stringify(options.expectedArgv)) throw new Error('owned process argv drifted');
  const expectedCommand = options.expectedObservedCommandLine ?? options.expectedArgv.join(' ');
  if (value.expected_command_line !== expectedCommand || value.observed?.command_line !== expectedCommand) throw new Error('owned process observed command was tampered');
}

function exactProcessSnapshot(value: unknown, label: string): UnknownRecord {
  const snapshot = exactKeys(value, ['pid', 'ppid', 'pgid', 'start_identity', 'command_line'], label);
  for (const key of ['pid', 'ppid', 'pgid']) if (!Number.isSafeInteger(snapshot[key]) || Number(snapshot[key]) <= 0) throw new Error(`${label}.${key} is invalid`);
  string(snapshot.start_identity, `${label}.start_identity`); string(snapshot.command_line, `${label}.command_line`);
  return snapshot;
}

export function assertControllerEvidence(
  value: unknown,
  expected: { argv: readonly string[]; observedCommandLine: string },
): UnknownRecord {
  const controller = exactKeys(value, ['pid', 'ppid', 'pgid', 'argv', 'start_identity', 'observed', 'signal_handlers'], 'owned controller');
  const observed = exactProcessSnapshot(controller.observed, 'owned controller observation');
  if (controller.pid !== observed.pid || controller.ppid !== observed.ppid || controller.pgid !== observed.pgid || controller.start_identity !== observed.start_identity) throw new Error('owned controller identity was forged');
  strings(controller.argv, 'owned controller argv');
  if (JSON.stringify(controller.argv) !== JSON.stringify(expected.argv) || observed.command_line !== expected.observedCommandLine) {
    throw new Error('owned controller command binding drifted');
  }
  const handlers = exactKeys(controller.signal_handlers, ['installed_at', 'signals', 'active', 'handled_signal', 'cleanup_completed', 'removed_at'], 'owned controller signal handlers');
  if (JSON.stringify(handlers.signals) !== '["SIGINT","SIGTERM"]' || handlers.active !== false || handlers.handled_signal !== null || handlers.cleanup_completed !== true) throw new Error('owned controller signal cleanup is incomplete');
  for (const [key, value] of [['installed_at', handlers.installed_at], ['removed_at', handlers.removed_at]] as const) if (!value || Number.isNaN(Date.parse(String(value)))) throw new Error(`owned controller ${key} is invalid`);
  return controller;
}

export function assertOwnedProcessEvidence(value: unknown, options: {
  controllerPid: number;
  requireTerm: boolean;
  expectedRole: string;
  expectedArgv: readonly string[];
  expectedObservedCommandLine: string;
  extraKeys?: readonly string[];
}): UnknownRecord {
  const process = exactKeys(value, [
    'role', 'argv', 'expected_command_line', 'root_pid', 'root_ppid', 'root_pgid', 'start_identity', 'observed', 'started_at', 'stabilization',
    'pre_term_identity', 'term_sent_at', 'root_exit', 'group_lifecycle', 'stopped', ...(options.extraKeys ?? []),
  ], 'owned process');
  string(process.role, 'owned process role'); strings(process.argv, 'owned process argv'); string(process.start_identity, 'owned process start identity');
  const observed = exactProcessSnapshot(process.observed, 'owned process observation');
  if (process.role !== options.expectedRole || JSON.stringify(process.argv) !== JSON.stringify(options.expectedArgv)
    || process.expected_command_line !== options.expectedObservedCommandLine || observed.command_line !== options.expectedObservedCommandLine) {
    throw new Error('owned process role/argv/observed-command binding drifted');
  }
  if (process.root_pid !== observed.pid || process.root_ppid !== options.controllerPid || process.root_ppid !== observed.ppid || process.root_pgid !== process.root_pid || process.root_pgid !== observed.pgid || process.start_identity !== observed.start_identity) throw new Error('owned process controller/PID/group identity was forged');
  const stabilization = exactKeys(process.stabilization, ['completed_at', 'polls', 'observed_commands'], 'owned process stabilization');
  const observedCommands = strings(stabilization.observed_commands, 'owned process stabilization commands');
  if (!Number.isSafeInteger(stabilization.polls) || Number(stabilization.polls) < 1 || observedCommands.length < 1 || observedCommands.at(-1) !== observed.command_line || Number.isNaN(Date.parse(String(stabilization.completed_at)))) throw new Error('owned process stabilization evidence is invalid');
  const rootExit = exactKeys(process.root_exit, ['exited_at', 'exit_code', 'signal'], 'owned process root exit');
  if (Number.isNaN(Date.parse(String(process.started_at))) || Number.isNaN(Date.parse(String(rootExit.exited_at)))) throw new Error('owned process timestamps are invalid');
  const group = exactKeys(process.group_lifecycle, ['members_observed', 'group_empty', 'polls', 'completed_at'], 'owned process group lifecycle');
  const members = array(group.members_observed, 'owned process group members').map((member) => exactProcessSnapshot(member, 'owned process group member'));
  if (!members.some(({ pid, start_identity }) => pid === process.root_pid && start_identity === process.start_identity) || members.some(({ pgid }) => pgid !== process.root_pgid) || group.group_empty !== true || !Number.isSafeInteger(group.polls) || Number(group.polls) < 1 || Number.isNaN(Date.parse(String(group.completed_at))) || process.stopped !== true) throw new Error('owned process complete group extinction is not proven');
  if (options.requireTerm) {
    const preTerm = exactProcessSnapshot(process.pre_term_identity, 'owned process pre-TERM identity');
    if (JSON.stringify(preTerm) !== JSON.stringify(observed) || !process.term_sent_at || Number.isNaN(Date.parse(String(process.term_sent_at)))) throw new Error('owned process pre-TERM identity is invalid');
  } else if (process.pre_term_identity !== null || process.term_sent_at !== null) throw new Error('naturally completed command contains forged TERM evidence');
  return process;
}

export function npmObservedCommandLine(argv: readonly string[]): string {
  if (argv[0] !== 'npm') throw new Error('owned preview command must use npm');
  return argv.filter((argument) => argument !== '--').join(' ');
}

export function tsxObservedCommandLine(argv: readonly string[], root: string): string {
  if (argv.length < 2) throw new Error('tsx controller argv is incomplete');
  const script = relative(root, argv[1]!);
  if (!script || script.startsWith('..')) throw new Error('tsx controller script is outside the repository root');
  return [
    argv[0], '--require', join(root, 'node_modules/tsx/dist/preflight.cjs'), '--import',
    pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, script, ...argv.slice(2),
  ].join(' ');
}

export function ownedCommandLineReady(actual: string, argv: readonly string[]): boolean {
  return actual === npmObservedCommandLine(argv);
}

export interface DynamicRouteExpectation { path: string; finalUrl: string; redirected: boolean }

function assertTaskTempBinding(value: UnknownRecord, prefix: 'beyondwin-cutover.' | 'beyondwin-clean-host.', label: string): string {
  const path = string(value.path, `${label} path`);
  const realpath = string(value.realpath, `${label} realpath`);
  const name = basename(path);
  if (path !== `/tmp/${name}` || !new RegExp(`^${prefix.replace('.', '\\.')}[A-Za-z0-9_-]+$`, 'u').test(name)) {
    throw new Error(`${label} declared path escaped its task-owned /tmp root`);
  }
  if (realpath !== join(realpathSync('/tmp'), name)) throw new Error(`${label} canonical realpath binding drifted`);
  return path;
}

export function assertDynamicCrawl(value: unknown, expectedRoutes: readonly DynamicRouteExpectation[]): void {
  if (expectedRoutes.length !== 80) throw new Error('dynamic crawl expected route inventory must contain exactly 80 routes');
  const crawl = array(value, 'dynamic crawl').map((entry, index) => record(entry, `dynamic crawl[${index}]`));
  const paths = crawl.map((entry) => string(entry.path, 'dynamic crawl path'));
  assertNoDuplicates(paths, 'dynamic crawl route set');
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(expectedRoutes.map(({ path }) => path).sort())) throw new Error('dynamic crawl does not contain the exact route set');
  for (const entry of crawl) {
    exactKeys(entry, ['path', 'status', 'final_url', 'redirected', 'console_errors', 'page_errors', 'hydration_errors', 'axe_serious_or_critical', 'overflow', 'private_boundary_hits'], `dynamic route ${String(entry.path)}`);
    const expected = expectedRoutes.find(({ path }) => path === entry.path)!;
    if (entry.status !== 200) throw new Error(`${String(entry.path)} dynamic status failed`);
    if (string(entry.final_url, 'dynamic final URL') !== expected.finalUrl || boolean(entry.redirected, 'dynamic redirected') !== expected.redirected) throw new Error(`${String(entry.path)} dynamic final URL/redirect drifted`);
    for (const key of ['console_errors', 'page_errors', 'hydration_errors', 'axe_serious_or_critical', 'private_boundary_hits']) {
      if (array(entry[key], `dynamic ${key}`).length > 0) throw new Error(`${String(entry.path)} dynamic mandatory ${key} failed`);
    }
    const overflow = exactKeys(entry.overflow, ['expected_max_width', 'actual_scroll_width', 'overflow'], 'dynamic overflow');
    if (overflow.expected_max_width !== 1440) throw new Error(`${String(entry.path)} dynamic expected width drifted`);
    const actual = number(overflow.actual_scroll_width, 'dynamic actual width');
    if (!Number.isSafeInteger(actual) || actual < 0 || boolean(overflow.overflow, 'dynamic overflow boolean') !== (actual > 1440)) throw new Error(`${String(entry.path)} dynamic overflow derivation failed`);
    if (overflow.overflow === true) throw new Error(`${String(entry.path)} dynamic mandatory overflow failed`);
  }
}

export function assertLocalReceiptMaterialGroups(input: unknown, expected: {
  implementationCommit: string;
  representatives: readonly string[];
  controllerArgv: readonly string[];
  controllerObservedCommandLine: string;
}): void {
  const root = exactKeys(input, ['schema_version', 'implementation_commit', 'eligible', 'errors', 'ports', 'representatives', 'transitions', 'controller', 'processes', 'proxy_worker', 'port_lifecycle', 'temp_root', 'dynamic_crawl', 'static_contract'], 'local receipt');
  if (root.schema_version !== 3 || root.implementation_commit !== expected.implementationCommit || root.eligible !== true || array(root.errors, 'local errors').length > 0) throw new Error('local receipt commit/schema/eligibility drifted');
  const ports = exactKeys(root.ports, ['proxy', 'react', 'astro'], 'local ports');
  if (ports.proxy !== 4390 || ports.react !== 4391 || ports.astro !== 4392) throw new Error('local ports drifted');
  if (JSON.stringify(root.representatives) !== JSON.stringify(expected.representatives)) throw new Error('local representative routes drifted');
  const transitions = array(root.transitions, 'local transitions').map((entry) => record(entry, 'local transition'));
  if (JSON.stringify(transitions.map(({ target }) => target)) !== '["react","astro","react"]') throw new Error('local transitions drifted');
  for (const transition of transitions) {
    if (JSON.stringify(array(transition.routes, 'transition routes').map((entry) => record(entry, 'transition route').path)) !== JSON.stringify(expected.representatives)) throw new Error('local transition representative routes drifted');
  }
  const controller = assertControllerEvidence(root.controller, { argv: expected.controllerArgv, observedCommandLine: expected.controllerObservedCommandLine });
  const temp = exactKeys(root.temp_root, ['pattern', 'path', 'realpath', 'realpath_validated', 'removed'], 'local temp root');
  const tempPath = assertTaskTempBinding(temp, 'beyondwin-cutover.', 'local temp root');
  const processExpectations = [
    { role: 'react', argv: ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'] },
    { role: 'astro', argv: ['npm', 'run', 'legacy:preview', '--', '--host', '127.0.0.1', '--port', '4392'] },
    { role: 'proxy', argv: ['npm', 'run', 'cutover:proxy', '--', '--listen', '127.0.0.1:4390', '--react', 'http://127.0.0.1:4391', '--astro', 'http://127.0.0.1:4392', '--state', `${tempPath}/target`, '--pid-file', `${tempPath}/proxy.pid`] },
  ] as const;
  const rawProcesses = array(root.processes, 'local processes');
  if (rawProcesses.length !== processExpectations.length) throw new Error('local owned process count drifted');
  const processes = rawProcesses.map((entry, index) => {
    const processExpected = processExpectations[index]!;
    return assertOwnedProcessEvidence(entry, {
      controllerPid: Number(controller.pid), requireTerm: true, expectedRole: processExpected.role,
      expectedArgv: processExpected.argv, expectedObservedCommandLine: npmObservedCommandLine(processExpected.argv),
    });
  });
  if (JSON.stringify(processes.map(({ role }) => role)) !== '["react","astro","proxy"]' || processes.some(({ stopped }) => stopped !== true)) throw new Error('local owned process cleanup drifted');
  const worker = record(root.proxy_worker, 'proxy worker');
  if (worker.descendant_of_proxy !== true || worker.stopped !== true) throw new Error('proxy worker ownership/cleanup drifted');
  const lifecycle = record(root.port_lifecycle, 'port lifecycle');
  for (const key of ['before_free', 'during_owned', 'after_free']) if (JSON.stringify(lifecycle[key]) !== '[4390,4391,4392]') throw new Error('port lifecycle drifted');
  if (temp.pattern !== '/tmp/beyondwin-cutover.*' || temp.realpath_validated !== true || temp.removed !== true) throw new Error('local temp cleanup drifted');
  const dynamic = record(root.dynamic_crawl, 'dynamic crawl summary');
  if (dynamic.route_count !== 80 || array(dynamic.failures, 'dynamic failures').length > 0) throw new Error('dynamic crawl summary failed');
  const staticContract = record(root.static_contract, 'static contract summary');
  if (staticContract.route_count !== 80 || array(staticContract.failures, 'static failures').length > 0) throw new Error('static cutover summary failed');
}

function archiveInventoryRejected(path: string): boolean {
  return path.includes('node_modules') || path === 'memory/' || path.startsWith('memory/')
    || path === 'build/' || path.startsWith('build/') || path === 'output/' || path.startsWith('output/')
    || path === '.superpowers/' || path.startsWith('.superpowers/') || path.split('/').some((part) => part === '.env' || part.startsWith('.env.'));
}

export function assertCleanHostReceiptMaterialGroups(input: unknown, expected: {
  implementationCommit: string;
  controllerArgv: readonly string[];
  controllerObservedCommandLine: string;
}): void {
  const root = exactKeys(input, ['schema_version', 'implementation_commit', 'created_at', 'completed_at', 'eligible', 'archive_hash', 'archive_inventory_hash', 'archive_inventory_count', 'archive_inventory', 'exclusions', 'controller', 'environment', 'commands', 'release', 'selected_build_hash', 'route_count', 'inventory_hash', 'smoke', 'temp_root', 'errors'], 'clean-host receipt');
  if (root.schema_version !== 2 || root.implementation_commit !== expected.implementationCommit || root.eligible !== true) throw new Error('clean-host commit/schema/eligibility drifted');
  assertHash(root.archive_hash, 'clean-host archive hash'); assertHash(root.archive_inventory_hash, 'clean-host inventory hash');
  const inventory = strings(root.archive_inventory, 'clean-host inventory');
  if (root.archive_inventory_count !== inventory.length || root.archive_inventory_hash !== sha256(`${inventory.join('\n')}\n`)) {
    throw new Error('clean-host archive inventory summary is forged');
  }
  if (inventory.some(archiveInventoryRejected)) throw new Error('clean-host archive contains excluded paths');
  const exclusions = exactKeys(root.exclusions, ['dependencies', 'generated_output', 'secrets_and_environment', 'top_level_private_memory'], 'clean-host exclusions');
  if (Object.values(exclusions).some((value) => value !== true)) throw new Error('clean-host exclusions are incomplete');
  const controller = assertControllerEvidence(root.controller, { argv: expected.controllerArgv, observedCommandLine: expected.controllerObservedCommandLine });
  const environment = exactKeys(root.environment, ['allowed_keys', 'npm_userconfig_hash', 'npm_globalconfig_hash', 'config_inventory_hash', 'cache_inventory_hash_before'], 'clean-host environment');
  for (const key of ['npm_userconfig_hash', 'npm_globalconfig_hash', 'config_inventory_hash', 'cache_inventory_hash_before']) assertHash(environment[key], `clean-host ${key}`);
  const allowed = strings(environment.allowed_keys, 'clean-host allowed keys');
  if (allowed.some((key) => /token|auth|proxy|api|secret/iu.test(key))) throw new Error('clean-host environment contains a secret/proxy key');
  const temp = exactKeys(root.temp_root, ['pattern', 'path', 'realpath', 'realpath_validated', 'removed', 'preview_port'], 'clean-host temp root');
  const tempPath = assertTaskTempBinding(temp, 'beyondwin-clean-host.', 'clean-host temp root');
  const cleanCommandExpectations = [
    { role: 'install:git', phase: 'install', argv: ['git', 'archive', '--format=tar', `--output=${tempPath}/source.tar`, expected.implementationCommit, '--', '.', ':(exclude)memory', ':(exclude)build', ':(exclude)output', ':(exclude).superpowers', ':(exclude).env', ':(exclude).env.*'] },
    { role: 'install:tar', phase: 'install', argv: ['tar', '-xf', `${tempPath}/source.tar`, '-C', `${tempPath}/repository`] },
    { role: 'install:npm', phase: 'install', argv: ['npm', 'ci'] },
    { role: 'build:npm', phase: 'build', argv: ['npm', 'run', 'public-release:build'] },
    { role: 'build:npm', phase: 'build', argv: ['npm', 'run', 'public-release:verify'] },
    { role: 'build:npm', phase: 'build', argv: ['npm', 'run', 'site:build'] },
  ] as const;
  const rawCommands = array(root.commands, 'clean-host commands');
  if (rawCommands.length !== cleanCommandExpectations.length) throw new Error('clean-host command sequence drifted');
  const commands = rawCommands.map((entry, index) => {
    const commandExpected = cleanCommandExpectations[index]!;
    const observed = commandExpected.argv[0] === 'npm' ? npmObservedCommandLine(commandExpected.argv) : commandExpected.argv.join(' ');
    const command = assertOwnedProcessEvidence(entry, {
      controllerPid: Number(controller.pid), requireTerm: false, expectedRole: commandExpected.role,
      expectedArgv: commandExpected.argv, expectedObservedCommandLine: observed, extraKeys: ['phase', 'environment_keys'],
    });
    if (command.phase !== commandExpected.phase) throw new Error('clean-host command phase drifted');
    return command;
  });
  if (commands.length === 0 || commands.some((entry) => record(entry.root_exit, 'clean-host command root exit').exit_code !== 0 || entry.stopped !== true)) throw new Error('clean-host commands failed or remained running');
  for (const command of commands) {
    if (command.phase !== 'install' && command.phase !== 'build') throw new Error('clean-host command phase drifted');
    strings(command.environment_keys, 'clean-host command environment keys');
  }
  const release = record(root.release, 'clean-host release');
  string(release.release_id, 'clean-host release id', releasePattern);
  for (const key of ['active_pointer_hash', 'manifest_hash', 'artifact_hash']) assertHash(release[key], `clean-host release ${key}`);
  assertHash(root.selected_build_hash, 'clean-host selected build'); assertHash(root.inventory_hash, 'clean-host route inventory');
  if (root.route_count !== 80 || array(root.smoke, 'clean-host smoke').length !== 80) throw new Error('clean-host exact 80 smoke is incomplete');
  if (temp.pattern !== '/tmp/beyondwin-clean-host.*' || temp.realpath_validated !== true || temp.removed !== true) throw new Error('clean-host temp cleanup drifted');
  if (array(root.errors, 'clean-host errors').length > 0) throw new Error('clean-host errors are present');
}
