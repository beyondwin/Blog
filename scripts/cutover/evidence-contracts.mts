import { median } from '../../tools/parity/src/measure-browser.ts';
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
  const baselineRoot = array(root.baseline, 'changed-surface baseline');
  const baseline = baselineRoot.find((entry) => record(entry, 'baseline cell').path === REVIEW_ROUTE) as UnknownRecord | undefined;
  if (!baseline) throw new Error('changed-surface review baseline is missing');
  const baselineByViewport = new Map(array(baseline.measurements, 'baseline measurements').map((entry) => {
    const cell = record(entry, 'baseline measurement');
    return [string(cell.viewport, 'baseline viewport'), number(record(cell.median, 'baseline median').lcpMs, 'baseline LCP')] as const;
  }));
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
      return {
        lcp: number(sample.lcpMs, 'sample LCP'), cls: number(sample.cls, 'sample CLS'),
        js: number(sample.jsGzipBytes, 'sample JS'), image: number(sample.imageBytes, 'sample image'),
        issues: issueUnion(sample),
      };
    });
    const derived = {
      lcpMs: median(sampleMetrics.map(({ lcp }) => lcp)),
      cls: median(sampleMetrics.map(({ cls }) => cls)),
      jsGzipBytes: median(sampleMetrics.map(({ js }) => js)),
      imageBytes: median(sampleMetrics.map(({ image }) => image)),
    };
    const reported = exactKeys(measurement.median, ['lcpMs', 'cls', 'jsGzipBytes', 'imageBytes'], 'changed-surface reported median');
    for (const [key, value] of Object.entries(derived)) if (reported[key] !== value) throw new Error(`changed-surface forged median ${key}`);
    const summaryIssues = ['consoleErrors', 'hydrationErrors', 'axeSeriousOrCritical', 'imageFailures', 'privateBoundaryHits']
      .flatMap((key) => strings(measurement[key], `measurement.${key}`));
    const rawIssues = [...new Set(sampleMetrics.flatMap(({ issues }) => issues))].sort();
    const overflow = record(measurement.overflow, 'measurement overflow');
    if (overflow.overflow === true) summaryIssues.push('horizontal-overflow');
    if (JSON.stringify([...new Set(summaryIssues)].sort()) !== JSON.stringify(rawIssues)) throw new Error('changed-surface issue summary does not derive from raw samples');
    const baselineLcp = baselineByViewport.get(String(cell.viewport));
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
  options: { controllerPid: number; expectedArgv: readonly string[] },
): void {
  if (value.root_pid !== value.observed?.pid) throw new Error('owned process PID was replaced');
  if (value.root_ppid !== options.controllerPid || value.observed?.ppid !== options.controllerPid) throw new Error('owned process has a foreign parent');
  if (value.start_identity !== value.observed?.start_identity) throw new Error('owned process start identity changed');
  if (JSON.stringify(value.argv) !== JSON.stringify(options.expectedArgv)) throw new Error('owned process argv drifted');
  const expectedCommand = options.expectedArgv.join(' ');
  if (value.observed?.command_line !== expectedCommand) throw new Error('owned process observed command was tampered');
}

export function assertDynamicCrawl(value: unknown, expectedRoutes: readonly string[]): void {
  const crawl = array(value, 'dynamic crawl').map((entry, index) => record(entry, `dynamic crawl[${index}]`));
  const paths = crawl.map((entry) => string(entry.path, 'dynamic crawl path'));
  assertNoDuplicates(paths, 'dynamic crawl route set');
  if (JSON.stringify([...paths].sort()) !== JSON.stringify([...expectedRoutes].sort())) throw new Error('dynamic crawl does not contain the exact route set');
  for (const entry of crawl) {
    if (entry.status !== 200) throw new Error(`${String(entry.path)} dynamic status failed`);
    for (const key of ['console_errors', 'page_errors', 'hydration_errors', 'axe_serious_or_critical', 'private_boundary_hits']) {
      if (array(entry[key], `dynamic ${key}`).length > 0) throw new Error(`${String(entry.path)} dynamic mandatory ${key} failed`);
    }
    if (record(entry.overflow, 'dynamic overflow').overflow === true) throw new Error(`${String(entry.path)} dynamic mandatory overflow failed`);
  }
}

export function assertLocalReceiptMaterialGroups(input: unknown, expected: { implementationCommit: string; representatives: readonly string[] }): void {
  const root = exactKeys(input, ['schema_version', 'implementation_commit', 'ports', 'representatives', 'transitions', 'processes', 'proxy_worker', 'port_lifecycle', 'temp_root', 'dynamic_crawl', 'static_contract'], 'local receipt');
  if (root.schema_version !== 2 || root.implementation_commit !== expected.implementationCommit) throw new Error('local receipt commit/schema drifted');
  const ports = exactKeys(root.ports, ['proxy', 'react', 'astro'], 'local ports');
  if (ports.proxy !== 4390 || ports.react !== 4391 || ports.astro !== 4392) throw new Error('local ports drifted');
  if (JSON.stringify(root.representatives) !== JSON.stringify(expected.representatives)) throw new Error('local representative routes drifted');
  const transitions = array(root.transitions, 'local transitions').map((entry) => record(entry, 'local transition'));
  if (JSON.stringify(transitions.map(({ target }) => target)) !== '["react","astro","react"]') throw new Error('local transitions drifted');
  for (const transition of transitions) {
    if (JSON.stringify(array(transition.routes, 'transition routes').map((entry) => record(entry, 'transition route').path)) !== JSON.stringify(expected.representatives)) throw new Error('local transition representative routes drifted');
  }
  const processes = array(root.processes, 'local processes').map((entry) => record(entry, 'local process'));
  if (JSON.stringify(processes.map(({ role }) => role)) !== '["react","astro","proxy"]' || processes.some(({ stopped }) => stopped !== true)) throw new Error('local owned process cleanup drifted');
  const worker = record(root.proxy_worker, 'proxy worker');
  if (worker.descendant_of_proxy !== true || worker.stopped !== true) throw new Error('proxy worker ownership/cleanup drifted');
  const lifecycle = record(root.port_lifecycle, 'port lifecycle');
  for (const key of ['before_free', 'during_owned', 'after_free']) if (JSON.stringify(lifecycle[key]) !== '[4390,4391,4392]') throw new Error('port lifecycle drifted');
  const temp = record(root.temp_root, 'local temp root');
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

export function assertCleanHostReceiptMaterialGroups(input: unknown, expected: { implementationCommit: string }): void {
  const root = exactKeys(input, ['schema_version', 'implementation_commit', 'eligible', 'archive_hash', 'archive_inventory_hash', 'archive_inventory_count', 'archive_inventory', 'exclusions', 'environment', 'commands', 'release', 'selected_build_hash', 'route_count', 'inventory_hash', 'smoke', 'temp_root', 'errors'], 'clean-host receipt');
  if (root.schema_version !== 2 || root.implementation_commit !== expected.implementationCommit || root.eligible !== true) throw new Error('clean-host commit/schema/eligibility drifted');
  assertHash(root.archive_hash, 'clean-host archive hash'); assertHash(root.archive_inventory_hash, 'clean-host inventory hash');
  const inventory = strings(root.archive_inventory, 'clean-host inventory');
  if (root.archive_inventory_count !== inventory.length || root.archive_inventory_hash !== sha256(`${inventory.join('\n')}\n`)) {
    throw new Error('clean-host archive inventory summary is forged');
  }
  if (inventory.some(archiveInventoryRejected)) throw new Error('clean-host archive contains excluded paths');
  const exclusions = exactKeys(root.exclusions, ['dependencies', 'generated_output', 'secrets_and_environment', 'top_level_private_memory'], 'clean-host exclusions');
  if (Object.values(exclusions).some((value) => value !== true)) throw new Error('clean-host exclusions are incomplete');
  const environment = exactKeys(root.environment, ['allowed_keys', 'npm_userconfig_hash', 'config_inventory_hash', 'cache_inventory_hash_before'], 'clean-host environment');
  for (const key of ['npm_userconfig_hash', 'config_inventory_hash', 'cache_inventory_hash_before']) assertHash(environment[key], `clean-host ${key}`);
  const allowed = strings(environment.allowed_keys, 'clean-host allowed keys');
  if (allowed.some((key) => /token|auth|proxy|api|secret/iu.test(key))) throw new Error('clean-host environment contains a secret/proxy key');
  const commands = array(root.commands, 'clean-host commands').map((entry) => record(entry, 'clean-host command'));
  if (commands.length === 0 || commands.some((entry) => entry.exit_code !== 0 || entry.stopped !== true)) throw new Error('clean-host commands failed or remained running');
  const release = record(root.release, 'clean-host release');
  string(release.release_id, 'clean-host release id', releasePattern);
  for (const key of ['active_pointer_hash', 'manifest_hash', 'artifact_hash']) assertHash(release[key], `clean-host release ${key}`);
  assertHash(root.selected_build_hash, 'clean-host selected build'); assertHash(root.inventory_hash, 'clean-host route inventory');
  if (root.route_count !== 80 || array(root.smoke, 'clean-host smoke').length !== 80) throw new Error('clean-host exact 80 smoke is incomplete');
  const temp = record(root.temp_root, 'clean-host temp root');
  if (temp.pattern !== '/tmp/beyondwin-clean-host.*' || temp.realpath_validated !== true || temp.removed !== true) throw new Error('clean-host temp cleanup drifted');
  if (array(root.errors, 'clean-host errors').length > 0) throw new Error('clean-host errors are present');
}
