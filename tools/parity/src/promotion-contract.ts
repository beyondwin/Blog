import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { selectRenderer, type RendererSelectionReport } from './select-renderer.ts';
import {
  buildRendererSelectionReport,
  parseRendererCapture,
  type RendererCaptureReport,
  type RendererName,
} from './compare-contracts.ts';
import {
  rendererSourceClosureHashAtCommit,
  verifyRendererPublicReleaseInput,
} from './renderer-layouts.ts';

const execFileAsync = promisify(execFile);

type SelectedRenderer = 'next' | 'react-router';

export interface DeterministicComparisonCheckpoint {
  selectedRenderer: SelectedRenderer;
  rejectedRenderer: SelectedRenderer;
  comparisonRunHashes: [string, string, string];
  noPreferenceOverride: true;
  comparison: RendererSelectionReport;
}

interface PackageManifest {
  name?: string;
  scripts?: Record<string, string>;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, PackageManifest>;
}

export interface PromotedRendererWorkspace {
  selectedPackage: '@beyondwin/site';
  selectedPath: 'apps/site';
  rejectedPath: 'spikes/rejected/site-next';
  activeNextDependencies: string[];
}

export interface RawSampleReference {
  path: string;
  hash: string;
  renderer: RendererCaptureReport['renderer'];
  routes: Array<{
    path: string;
    measurements: Array<{
      viewport: 'desktop' | 'mobile';
      samplePointers: string[];
    }>;
  }>;
}

export interface TrackedSourceTreeEvidence {
  path: string;
  files: string[];
  hash: string;
}

interface SealedCaptureEvidence {
  capture: RendererCaptureReport;
  evidenceCommit: string;
  fileHash: string;
}

interface RendererPromotionReport {
  version: 1;
  kind: 'public-renderer-selection';
  decisionDate: string;
  environment: {
    platform: string;
    arch: string;
    osRelease: string;
    node: string;
    npm: string;
    browser: RendererCaptureReport['browser'];
  };
  releaseId: string;
  routeSet: string[];
  comparisonRuns: Array<{
    sequence: number;
    command: 'npm run parity:compare-renderers';
    reportHash: string;
    selection: { winner: SelectedRenderer };
    rawSamples: RawSampleReference[];
  }>;
  selector: {
    command: 'npm run parity:select-renderer';
    outputHash: string;
    result: { winner: SelectedRenderer };
    noPreferenceOverride: true;
  };
  rawCaptures: Record<RendererName, RawSampleReference & {
    sourceCommit: string;
    evidenceCommit: string;
    sourceClosureHash: string;
    artifactHash: string;
    measuredAt: string;
  }>;
  comparison: RendererSelectionReport;
  mandatoryOutcomes: {
    next: { pass: boolean; failureCount: number; failures: string[] };
    reactRouter: { pass: boolean; failureCount: number; failures: string[] };
  };
  advantageCalculations: Record<string, unknown>;
  promotion: {
    baseCommit: string;
    selectedRenderer: 'react-router';
    selectedPath: 'apps/site';
    selectedPackage: '@beyondwin/site';
    selectedManifestHash: string;
    rejectedRenderer: 'next';
    rejectedPath: 'spikes/rejected/site-next';
    rejectedSource: TrackedSourceTreeEvidence;
    activeNextDependencies: string[];
  };
  exactCommands: string[];
  preservedGenerated: unknown[];
}

const DECISION_ROUTE_PATHS = [
  '/',
  '/articles/why-i-read-in-the-ai-era/',
  '/reviews/black-swan/',
  '/memory/agent-harnesses-are-operating-systems/',
] as const;

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function fileHash(path: string): Promise<string> {
  return sha256(await readFile(path));
}

async function gitBuffer(repositoryRoot: string, args: string[]): Promise<Buffer> {
  const result = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 40 * 1024 * 1024,
  }) as unknown as { stdout: Buffer };
  return result.stdout;
}

async function rendererHarnessHashAtCommit(repositoryRoot: string, commit: string): Promise<string> {
  const hash = createHash('sha256');
  for (const harnessPath of [
    'tools/parity/src/capture-renderer.ts',
    'tools/parity/src/compare-contracts.ts',
    'tools/parity/src/measure-browser.ts',
    'tools/parity/src/renderer-layouts.ts',
    'tools/parity/src/select-renderer.ts',
    'tools/parity/src/serve-static.ts',
  ]) {
    const bytes = await gitBuffer(repositoryRoot, ['show', `${commit}:${harnessPath}`]);
    hash.update(`${Buffer.byteLength(harnessPath)}:${harnessPath}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

function containedPath(repositoryRoot: string, path: string, label: string): string {
  const target = resolve(repositoryRoot, path);
  const fromRoot = relative(repositoryRoot, target);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} is outside the repository root`);
  }
  return target;
}

async function readSealedCaptureEvidence(
  repositoryRoot: string,
  path: string,
  renderer: RendererName,
): Promise<SealedCaptureEvidence> {
  const target = containedPath(repositoryRoot, path, `${renderer} raw capture`);
  const [rootReal, targetReal, state] = await Promise.all([
    realpath(repositoryRoot),
    realpath(target),
    lstat(target),
  ]);
  const fromRoot = relative(rootReal, targetReal);
  if (state.isSymbolicLink() || !state.isFile()
    || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${renderer} raw capture must be one real repository file`);
  }
  const relativePath = relative(repositoryRoot, target).split(sep).join('/');
  const bytes = await readFile(target);
  const trackedBytes = await gitBuffer(repositoryRoot, ['show', `HEAD:${relativePath}`]).catch(() => {
    throw new Error(`${renderer} raw capture is not committed unchanged evidence`);
  });
  if (!bytes.equals(trackedBytes)) throw new Error(`${renderer} raw capture differs from committed evidence`);
  const capture = parseRendererCapture(JSON.parse(bytes.toString('utf8')), { expectedRenderer: renderer });
  await execFileAsync('git', ['merge-base', '--is-ancestor', capture.provenance.repositoryCommit, 'HEAD'], {
    cwd: repositoryRoot,
  }).catch(() => {
    throw new Error(`${renderer} source commit is not an ancestor of the promotion tree`);
  });
  const sourceClosure = await rendererSourceClosureHashAtCommit(
    repositoryRoot,
    renderer,
    capture.provenance.repositoryCommit,
  );
  if (sourceClosure !== capture.provenance.sourceClosureHash) {
    throw new Error(`${renderer} sealed source closure does not match its recorded commit`);
  }
  const manifestBytes = await gitBuffer(repositoryRoot, [
    'show', `${capture.provenance.repositoryCommit}:${capture.provenance.rendererManifest}`,
  ]);
  if (sha256(manifestBytes) !== capture.provenance.rendererManifestHash) {
    throw new Error(`${renderer} sealed manifest does not match its recorded commit`);
  }
  if (await rendererHarnessHashAtCommit(repositoryRoot, capture.provenance.repositoryCommit)
    !== capture.provenance.captureToolHash) {
    throw new Error(`${renderer} sealed harness does not match its recorded commit`);
  }
  const currentRelease = await verifyRendererPublicReleaseInput(repositoryRoot, renderer);
  if (JSON.stringify(currentRelease) !== JSON.stringify(capture.provenance.publicRelease)) {
    throw new Error(`${renderer} sealed public release evidence is stale`);
  }
  const evidenceCommit = (await execFileAsync('git', [
    'log', '-1', '--format=%H', '--', relativePath,
  ], { cwd: repositoryRoot })).stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(evidenceCommit)) {
    throw new Error(`${renderer} raw capture has no evidence commit`);
  }
  return { capture, evidenceCommit, fileHash: sha256(bytes) };
}

export function buildRawSampleReference(
  path: string,
  hash: string,
  capture: RendererCaptureReport,
): RawSampleReference {
  if (!/^sha256:[a-f0-9]{64}$/u.test(hash)) throw new Error('Raw capture hash is invalid');
  if (JSON.stringify(capture.routes.map((route) => route.path)) !== JSON.stringify(DECISION_ROUTE_PATHS)) {
    throw new Error('Raw capture routes do not match the exact decision route set');
  }
  return {
    path,
    hash,
    renderer: capture.renderer,
    routes: capture.routes.map((route, routeIndex) => ({
      path: route.path,
      measurements: route.measurements.map((measurement, measurementIndex) => {
        if ((measurement.viewport !== 'desktop' && measurement.viewport !== 'mobile')
          || measurement.samples.length !== 5) {
          throw new Error(`Raw capture ${route.path} must contain five desktop/mobile samples`);
        }
        return {
          viewport: measurement.viewport,
          samplePointers: measurement.samples.map((_, sampleIndex) => (
            `/routes/${routeIndex}/measurements/${measurementIndex}/samples/${sampleIndex}`
          )),
        };
      }),
    })),
  };
}

function parseComparison(bytes: Buffer, run: number): RendererSelectionReport {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Renderer comparison run ${run} is not valid JSON`, { cause: error });
  }
  const report = value as RendererSelectionReport;
  if (report.version !== 2 || !report.candidates?.next || !report.candidates?.reactRouter) {
    throw new Error(`Renderer comparison run ${run} is not a version-2 selection report`);
  }
  return report;
}

export function verifyDeterministicComparisonRuns(
  runs: readonly Buffer[],
): DeterministicComparisonCheckpoint {
  if (runs.length !== 3) throw new Error('Renderer promotion requires exactly three comparison runs');
  const hashes = runs.map(sha256) as [string, string, string];
  if (new Set(hashes).size !== 1) {
    throw new Error('Renderer promotion requires three byte-identical comparison runs');
  }
  const reports = runs.map((bytes, index) => parseComparison(bytes, index + 1));
  const selections = reports.map(selectRenderer);
  if (selections.some((selection) => 'blocked' in selection)) {
    throw new Error('Renderer promotion is blocked by mandatory failures');
  }
  const winners = selections.map((selection) => (
    'winner' in selection ? selection.winner : null
  ));
  if (new Set(winners).size !== 1 || !winners[0]) {
    throw new Error('Renderer comparison runs do not select one deterministic winner');
  }
  const selectedRenderer = winners[0];
  return {
    selectedRenderer,
    rejectedRenderer: selectedRenderer === 'next' ? 'react-router' : 'next',
    comparisonRunHashes: hashes,
    noPreferenceOverride: true,
    comparison: reports[0],
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function dependencies(manifest: PackageManifest): Record<string, string> {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
}

async function directWorkspaceManifests(repositoryRoot: string): Promise<Array<[string, PackageManifest]>> {
  const manifests: Array<[string, PackageManifest]> = [[
    'package.json',
    await readJson<PackageManifest>(join(repositoryRoot, 'package.json')),
  ]];
  for (const parent of ['apps', 'packages', 'spikes', 'tools']) {
    const root = join(repositoryRoot, parent);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) continue;
      const relative = `${parent}/${entry.name}/package.json`;
      const manifest = await readJson<PackageManifest>(join(repositoryRoot, relative)).catch(() => null);
      if (manifest) manifests.push([relative, manifest]);
    }
  }
  return manifests;
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error(`${label} must be a real directory`);
}

export async function verifyPromotedRendererWorkspace(
  repositoryRoot: string,
): Promise<PromotedRendererWorkspace> {
  const rootManifest = await readJson<PackageManifest>(join(repositoryRoot, 'package.json'));
  if (JSON.stringify(rootManifest.workspaces) !== JSON.stringify([
    'apps/*', 'packages/*', 'spikes/*', 'tools/*',
  ])) throw new Error('Root workspaces do not match the approved active roots');

  const expectedRootScripts = {
    'site:dev': 'npm run dev --workspace @beyondwin/site',
    'site:build': 'npm run build --workspace @beyondwin/site',
    'site:preview': 'npm run preview --workspace @beyondwin/site',
    'site:test': 'npm run test --workspace @beyondwin/site',
  };
  for (const [name, command] of Object.entries(expectedRootScripts)) {
    if (rootManifest.scripts?.[name] !== command) {
      throw new Error(`Root script ${name} must target only @beyondwin/site`);
    }
  }
  for (const name of ['dev', 'build', 'preview']) {
    if (Object.hasOwn(rootManifest.scripts ?? {}, name)) {
      throw new Error(`Astro root script ${name} must exist only under legacy:*`);
    }
  }
  for (const name of ['legacy:dev', 'legacy:build', 'legacy:preview']) {
    if (!rootManifest.scripts?.[name]) throw new Error(`Missing required ${name} script`);
  }

  const selectedPath = 'apps/site' as const;
  const rejectedPath = 'spikes/rejected/site-next' as const;
  await assertRealDirectory(join(repositoryRoot, selectedPath), 'Selected renderer app');
  await assertRealDirectory(join(repositoryRoot, rejectedPath), 'Rejected renderer evidence');
  const selectedManifest = await readJson<PackageManifest>(join(repositoryRoot, selectedPath, 'package.json'));
  if (selectedManifest.name !== '@beyondwin/site') {
    throw new Error('Selected renderer package must be named @beyondwin/site');
  }
  for (const name of ['dev', 'build', 'preview', 'test']) {
    if (!selectedManifest.scripts?.[name]) throw new Error(`Selected renderer is missing ${name}`);
  }

  const activeManifests = await directWorkspaceManifests(repositoryRoot);
  const activeNextDependencies = activeManifests.flatMap(([path, manifest]) => (
    Object.keys(dependencies(manifest))
      .filter((name) => name === 'next' || name.startsWith('@next/'))
      .map((name) => `${path}:${name}`)
  ));
  const lock = await readJson<PackageLock>(join(repositoryRoot, 'package-lock.json'));
  for (const [path, manifest] of Object.entries(lock.packages ?? {})) {
    if (path === 'spikes/site-next'
      || path === 'spikes/site-react-router'
      || path === 'spikes/rejected/site-next'
      || path === 'spikes/rejected/site-react-router'
      || /(?:^|\/)node_modules\/(?:next|@next\/)/u.test(path)) {
      activeNextDependencies.push(`package-lock.json:${path}`);
    }
    for (const name of Object.keys(dependencies(manifest))) {
      if (name === 'next' || name.startsWith('@next/')) {
        activeNextDependencies.push(`package-lock.json:${path || '<root>'}:${name}`);
      }
    }
  }
  if (activeNextDependencies.length > 0) {
    throw new Error(`Active Next dependencies remain: ${activeNextDependencies.join(', ')}`);
  }

  const rootTsconfig = await readJson<{ exclude?: string[] }>(join(repositoryRoot, 'tsconfig.json'));
  for (const path of ['apps/site/build', 'apps/site/.react-router', 'spikes/rejected']) {
    if (!rootTsconfig.exclude?.includes(path)) {
      throw new Error(`Root diagnostics do not exclude ${path}`);
    }
  }
  for (const path of [
    'spikes/site-next/out',
    'spikes/site-next/.next',
    'spikes/site-react-router/build',
    'spikes/site-react-router/.react-router',
  ]) {
    if (rootTsconfig.exclude?.includes(path)) {
      throw new Error(`Root diagnostics retain obsolete active-candidate exclusion ${path}`);
    }
  }

  return {
    selectedPackage: '@beyondwin/site',
    selectedPath,
    rejectedPath,
    activeNextDependencies,
  };
}

export async function trackedSourceTreeEvidence(
  repositoryRoot: string,
  targetPath: string,
): Promise<TrackedSourceTreeEvidence> {
  const output = await gitBuffer(repositoryRoot, ['ls-files', '-s', '-z', '--', targetPath]);
  const entries = output.subarray(0, output.at(-1) === 0 ? -1 : undefined)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('\t');
      if (separator < 0) throw new Error('Rejected source index entry has no path separator');
      const [mode, objectId, stage, ...extra] = entry.slice(0, separator).split(' ');
      const path = entry.slice(separator + 1);
      if (!mode || !/^[a-f0-9]{40}$/u.test(objectId ?? '') || stage !== '0' || extra.length > 0) {
        throw new Error(`Rejected source index entry is invalid: ${entry}`);
      }
      const prefix = `${targetPath}/`;
      if (!path.startsWith(prefix)) throw new Error(`Rejected source escaped ${targetPath}: ${path}`);
      return { mode, objectId: objectId as string, path: path.slice(prefix.length) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length === 0) throw new Error(`Rejected source has no tracked files: ${targetPath}`);
  const hash = createHash('sha256');
  hash.update('rejected-renderer-source-v1\0');
  for (const entry of entries) {
    hash.update(entry.mode);
    hash.update('\0');
    hash.update(entry.objectId);
    hash.update('\0');
    hash.update(entry.path);
    hash.update('\0');
  }
  return {
    path: targetPath,
    files: entries.map((entry) => entry.path),
    hash: `sha256:${hash.digest('hex')}`,
  };
}

function mandatoryOutcome(candidate: RendererSelectionReport['candidates']['next']) {
  return {
    pass: candidate.mandatoryFailures.length === 0,
    failureCount: candidate.mandatoryFailures.length,
    failures: candidate.mandatoryFailures,
  };
}

function advantageCalculations(report: RendererSelectionReport): Record<string, unknown> {
  const next = report.candidates.next;
  const reactRouter = report.candidates.reactRouter;
  const calculation = (
    nextMetric: { median: number; mad: number },
    reactRouterMetric: { median: number; mad: number },
    relativeThreshold: number,
    absoluteThreshold: number,
  ) => {
    const improvement = reactRouterMetric.median - nextMetric.median;
    const varianceThreshold = 2 * Math.max(nextMetric.mad, reactRouterMetric.mad);
    return {
      nextMedian: nextMetric.median,
      nextMad: nextMetric.mad,
      reactRouterMedian: reactRouterMetric.median,
      reactRouterMad: reactRouterMetric.mad,
      improvement,
      requiredRelativeImprovement: reactRouterMetric.median * relativeThreshold,
      requiredAbsoluteImprovement: absoluteThreshold,
      requiredVarianceImprovement: varianceThreshold,
      nextWins: improvement > reactRouterMetric.median * relativeThreshold
        && improvement > absoluteThreshold
        && improvement > varianceThreshold,
    };
  };
  const image = calculation(next.quality.imageBytes, reactRouter.quality.imageBytes, 0.15, 0);
  const equalImageContract = next.responsiveImageContract.length > 0
    && JSON.stringify(next.responsiveImageContract) === JSON.stringify(reactRouter.responsiveImageContract)
    && next.responsiveImageContract.every((entry) => !entry.includes(':unknown:'));
  const buildsReproducible = [next, reactRouter].every((candidate) => (
    candidate.buildArtifactHashes.length === 3
      && new Set(candidate.buildArtifactHashes).size === 1
  ));
  return {
    lcp: calculation(next.quality.lcpMs, reactRouter.quality.lcpMs, 0.1, 75),
    javascript: calculation(next.quality.jsGzipBytes, reactRouter.quality.jsGzipBytes, 0.15, 10 * 1024),
    image: { ...image, equalDisplayedDimensionsAndFormat: equalImageContract, nextWins: image.nextWins && equalImageContract },
    build: {
      ...calculation(next.quality.buildDurationMs, reactRouter.quality.buildDurationMs, 0.2, 0),
      reproducible: buildsReproducible,
      nextWins: (
        calculation(next.quality.buildDurationMs, reactRouter.quality.buildDurationMs, 0.2, 0).nextWins
        && buildsReproducible
      ),
    },
  };
}

function selectionFromSelectorOutput(bytes: Buffer): { winner: SelectedRenderer } {
  const line = bytes.toString('utf8').split(/\r?\n/u).findLast((entry) => entry.startsWith('{'));
  if (!line) throw new Error('Selector output contains no JSON result');
  const result = JSON.parse(line) as { winner?: unknown };
  if (result.winner !== 'next' && result.winner !== 'react-router') {
    throw new Error('Selector output did not select one renderer');
  }
  return { winner: result.winner };
}

export async function writeRendererPromotionReport(
  repositoryRoot: string,
  outputPath: string,
  options: {
    comparisonRunPaths: [string, string, string];
    selectorOutputPath: string;
    preservedGeneratedMetadataPath: string;
    baseCommit: string;
  },
): Promise<RendererPromotionReport> {
  const runBytes = await Promise.all(options.comparisonRunPaths.map((path) => (
    readFile(containedPath(repositoryRoot, path, 'Comparison run'))
  )));
  const checkpoint = verifyDeterministicComparisonRuns(runBytes);
  if (checkpoint.selectedRenderer !== 'react-router') {
    throw new Error(`Task 8 approved promotion expected react-router, got ${checkpoint.selectedRenderer}`);
  }
  const capturePaths: Record<RendererName, string> = {
    astro: 'tests/fixtures/parity/astro-renderer-baseline.json',
    next: 'docs/notes/project/evidence/next-renderer-report.json',
    'react-router': 'docs/notes/project/evidence/react-router-renderer-report.json',
  };
  const sealed = Object.fromEntries(await Promise.all(
    (Object.entries(capturePaths) as Array<[RendererName, string]>).map(async ([renderer, path]) => (
      [renderer, await readSealedCaptureEvidence(repositoryRoot, path, renderer)]
    )),
  )) as Record<RendererName, SealedCaptureEvidence>;
  const comparison = buildRendererSelectionReport(
    sealed.astro.capture,
    sealed.next.capture,
    sealed['react-router'].capture,
  );
  const comparisonBytes = Buffer.from(`${JSON.stringify(comparison, null, 2)}\n`);
  if (runBytes.some((bytes) => !bytes.equals(comparisonBytes))) {
    throw new Error('Preserved comparison runs do not equal the recomputed sealed comparison');
  }
  const selectorBytes = await readFile(containedPath(repositoryRoot, options.selectorOutputPath, 'Selector output'));
  const selectorResult = selectionFromSelectorOutput(selectorBytes);
  if (selectorResult.winner !== checkpoint.selectedRenderer) {
    throw new Error('Strict selector output disagrees with the three comparison runs');
  }
  const rawReferences = (Object.entries(capturePaths) as Array<[RendererName, string]>).map(
    ([renderer, path]) => buildRawSampleReference(path, sealed[renderer].fileHash, sealed[renderer].capture),
  );
  const rawCaptures = Object.fromEntries(rawReferences.map((reference) => {
    const source = sealed[reference.renderer];
    return [reference.renderer, {
      ...reference,
      sourceCommit: source.capture.provenance.repositoryCommit,
      evidenceCommit: source.evidenceCommit,
      sourceClosureHash: source.capture.provenance.sourceClosureHash,
      artifactHash: source.capture.artifactHash,
      measuredAt: source.capture.measuredAt,
    }];
  })) as RendererPromotionReport['rawCaptures'];
  const publicRelease = sealed.next.capture.provenance.publicRelease;
  if (!publicRelease || JSON.stringify(publicRelease) !== JSON.stringify(
    sealed['react-router'].capture.provenance.publicRelease,
  )) throw new Error('Candidate sealed releases do not match');
  const workspace = await verifyPromotedRendererWorkspace(repositoryRoot);
  const rejectedSource = await trackedSourceTreeEvidence(repositoryRoot, workspace.rejectedPath);
  const preservedMetadata = JSON.parse(await readFile(
    containedPath(repositoryRoot, options.preservedGeneratedMetadataPath, 'Preserved generated metadata'),
    'utf8',
  )) as { generated?: unknown[] };
  const npmVersion = (await execFileAsync('npm', ['--version'], { cwd: repositoryRoot })).stdout.trim();
  const report: RendererPromotionReport = {
    version: 1,
    kind: 'public-renderer-selection',
    decisionDate: '2026-08-25',
    environment: {
      platform: platform(),
      arch: arch(),
      osRelease: release(),
      node: process.version,
      npm: npmVersion,
      browser: sealed.astro.capture.browser,
    },
    releaseId: publicRelease.releaseId,
    routeSet: [...DECISION_ROUTE_PATHS],
    comparisonRuns: checkpoint.comparisonRunHashes.map((reportHash, index) => ({
      sequence: index + 1,
      command: 'npm run parity:compare-renderers' as const,
      reportHash,
      selection: { winner: checkpoint.selectedRenderer },
      rawSamples: rawReferences,
    })),
    selector: {
      command: 'npm run parity:select-renderer',
      outputHash: sha256(selectorBytes),
      result: selectorResult,
      noPreferenceOverride: true,
    },
    rawCaptures,
    comparison,
    mandatoryOutcomes: {
      next: mandatoryOutcome(comparison.candidates.next),
      reactRouter: mandatoryOutcome(comparison.candidates.reactRouter),
    },
    advantageCalculations: advantageCalculations(comparison),
    promotion: {
      baseCommit: options.baseCommit,
      selectedRenderer: 'react-router',
      selectedPath: workspace.selectedPath,
      selectedPackage: workspace.selectedPackage,
      selectedManifestHash: await fileHash(join(repositoryRoot, workspace.selectedPath, 'package.json')),
      rejectedRenderer: 'next',
      rejectedPath: workspace.rejectedPath,
      rejectedSource,
      activeNextDependencies: workspace.activeNextDependencies,
    },
    exactCommands: [
      'npm run parity:compare-renderers',
      'npm run parity:compare-renderers',
      'npm run parity:compare-renderers',
      'npm run parity:select-renderer',
    ],
    preservedGenerated: preservedMetadata.generated ?? [],
  };
  const target = containedPath(repositoryRoot, outputPath, 'Renderer promotion report');
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function verifyRendererPromotionReport(
  repositoryRoot: string,
  reportPath: string,
  options: { requireCommittedClean?: boolean } = {},
): Promise<{
  selectedRenderer: 'react-router';
  rejectedRenderer: 'next';
  comparisonRunHash: string;
  rejectedSourceHash: string;
}> {
  if (options.requireCommittedClean) {
    const status = (await execFileAsync('git', [
      'status', '--porcelain=v1', '--untracked-files=all',
    ], { cwd: repositoryRoot })).stdout;
    if (status !== '') throw new Error(`Promotion verification requires a clean tracked tree:\n${status}`);
    await execFileAsync('git', ['ls-files', '--error-unmatch', '--', reportPath], {
      cwd: repositoryRoot,
    }).catch(() => {
      throw new Error('Renderer promotion report must be committed evidence');
    });
  }
  const report = JSON.parse(await readFile(
    containedPath(repositoryRoot, reportPath, 'Renderer promotion report'),
    'utf8',
  )) as RendererPromotionReport;
  if (report.version !== 1 || report.kind !== 'public-renderer-selection') {
    throw new Error('Renderer promotion report has an unsupported schema');
  }
  const sealed = Object.fromEntries(await Promise.all(
    (Object.entries(report.rawCaptures) as Array<[RendererName, RendererPromotionReport['rawCaptures'][RendererName]]>)
      .map(async ([renderer, reference]) => (
        [renderer, await readSealedCaptureEvidence(repositoryRoot, reference.path, renderer)]
      )),
  )) as Record<RendererName, SealedCaptureEvidence>;
  const expectedComparison = buildRendererSelectionReport(
    sealed.astro.capture,
    sealed.next.capture,
    sealed['react-router'].capture,
  );
  if (JSON.stringify(report.comparison) !== JSON.stringify(expectedComparison)) {
    throw new Error('Renderer promotion report comparison does not match sealed raw inputs');
  }
  const selection = selectRenderer(expectedComparison);
  if (!('winner' in selection) || selection.winner !== 'react-router'
    || report.selector.result.winner !== selection.winner
    || report.selector.noPreferenceOverride !== true) {
    throw new Error('Renderer promotion report selection is not derived from sealed evidence');
  }
  const comparisonHash = sha256(Buffer.from(`${JSON.stringify(expectedComparison, null, 2)}\n`));
  if (report.comparisonRuns.length !== 3 || report.comparisonRuns.some((run, index) => (
    run.sequence !== index + 1
      || run.command !== 'npm run parity:compare-renderers'
      || run.reportHash !== comparisonHash
      || run.selection.winner !== selection.winner
  ))) throw new Error('Renderer promotion report does not preserve three deterministic comparisons');
  for (const [renderer, reference] of Object.entries(report.rawCaptures) as Array<[
    RendererName,
    RendererPromotionReport['rawCaptures'][RendererName],
  ]>) {
    const source = sealed[renderer];
    const expectedReference = buildRawSampleReference(reference.path, source.fileHash, source.capture);
    const actualReference = {
      path: reference.path,
      hash: reference.hash,
      renderer: reference.renderer,
      routes: reference.routes,
    };
    if (JSON.stringify(actualReference) !== JSON.stringify(expectedReference)) {
      throw new Error(`${renderer} raw sample references do not match sealed evidence`);
    }
    if (reference.sourceCommit !== source.capture.provenance.repositoryCommit
      || reference.evidenceCommit !== source.evidenceCommit
      || reference.sourceClosureHash !== source.capture.provenance.sourceClosureHash
      || reference.artifactHash !== source.capture.artifactHash
      || reference.measuredAt !== source.capture.measuredAt) {
      throw new Error(`${renderer} raw capture provenance does not match sealed evidence`);
    }
  }
  const expectedRawReferences = (['astro', 'next', 'react-router'] as RendererName[])
    .map((renderer) => {
      const reference = report.rawCaptures[renderer];
      return buildRawSampleReference(reference.path, sealed[renderer].fileHash, sealed[renderer].capture);
    });
  if (report.comparisonRuns.some((run) => JSON.stringify(run.rawSamples) !== JSON.stringify(expectedRawReferences))) {
    throw new Error('Comparison runs do not reference every sealed raw sample');
  }
  if (JSON.stringify(report.mandatoryOutcomes) !== JSON.stringify({
    next: mandatoryOutcome(expectedComparison.candidates.next),
    reactRouter: mandatoryOutcome(expectedComparison.candidates.reactRouter),
  })) throw new Error('Mandatory outcomes do not match the sealed comparison');
  const workspace = await verifyPromotedRendererWorkspace(repositoryRoot);
  const rejectedSource = await trackedSourceTreeEvidence(repositoryRoot, workspace.rejectedPath);
  if (JSON.stringify(report.promotion.rejectedSource) !== JSON.stringify(rejectedSource)
    || report.promotion.selectedRenderer !== 'react-router'
    || report.promotion.selectedPath !== workspace.selectedPath
    || report.promotion.selectedPackage !== workspace.selectedPackage
    || report.promotion.selectedManifestHash !== await fileHash(
      join(repositoryRoot, workspace.selectedPath, 'package.json'),
    )
    || report.promotion.rejectedRenderer !== 'next'
    || JSON.stringify(report.promotion.activeNextDependencies) !== JSON.stringify([])) {
    throw new Error('Promotion paths, package, dependencies, or rejected source do not match the report');
  }
  return {
    selectedRenderer: 'react-router',
    rejectedRenderer: 'next',
    comparisonRunHash: comparisonHash,
    rejectedSourceHash: rejectedSource.hash,
  };
}
