import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { parse } from 'parse5';
import { findPublicBoundaryHits } from '../../../packages/content/src/release/read-release.ts';
import { buildHtmlContract } from './html-contract.ts';
import {
  DECISION_ROUTES,
  CAPTURE_PROTOCOL,
  VIEWPORTS,
  type DecisionRoute,
  type RendererCaptureReport,
  type RendererName,
  type StableRouteContract,
  type ViewportName,
} from './compare-contracts.ts';
import {
  findPrivateBoundaryHits,
  measureBrowserPage,
  median,
  medianAbsoluteDeviation,
} from './measure-browser.ts';
import { startStaticServer } from './serve-static.ts';
import { RENDERER_LAYOUTS } from './renderer-layouts.ts';

export { RENDERER_LAYOUTS } from './renderer-layouts.ts';

const execFileAsync = promisify(execFile);

interface HtmlNode {
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  tagName?: string;
}

export interface StableRouteCapture {
  contract: StableRouteContract;
  privateBoundaryHits: string[];
}

export interface CaptureRendererOptions {
  repositoryRoot: string;
  rendererRoot: string;
  rendererManifest: string;
  outputDirectory: string;
  cleanDirectories: string[];
  outputPath: string;
  renderer: RendererName;
  buildScript: string;
  buildSamples: number;
  host: string;
  port: number;
}

interface BuildSamplingOptions {
  repositoryRoot: string;
  rendererRoot: string;
  outputDirectory: string;
  cleanDirectories: string[];
  renderer: RendererName;
  buildScript: string;
  buildSamples: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function attributes(node: HtmlNode): Record<string, string> {
  return Object.fromEntries((node.attrs ?? [])
    .map(({ name, value }) => [name, value] as const)
    .sort(([left], [right]) => left.localeCompare(right)));
}

function findElements(node: HtmlNode, tagName: string, matches: HtmlNode[] = []): HtmlNode[] {
  if (node.tagName === tagName) matches.push(node);
  for (const child of node.childNodes ?? []) findElements(child, tagName, matches);
  return matches;
}

function isGeneratedId(value: string): boolean {
  return /^:[Rr][A-Za-z0-9_-]*:$/u.test(value)
    || /^(?:__next|react-|headlessui-|radix-)[A-Za-z0-9_:.-]+$/u.test(value);
}

function normalizeAssetUrl(value: string): string {
  return value.replace(
    /([._-])(?=[A-Za-z0-9_-]{8,}(?:\.|\?|#|$))(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{8,}(?=\.|\?|#|$)/gu,
    '$1__asset_hash__',
  );
}

function normalizeImageAttributes(image: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(image).map(([name, value]) => {
    if (name === 'src') return [name, normalizeAssetUrl(value)];
    if (name === 'srcset') {
      return [name, value.split(',').map((entry) => {
        const [url, ...descriptor] = entry.trim().split(/\s+/u);
        return [normalizeAssetUrl(url), ...descriptor].join(' ');
      }).join(', ')];
    }
    return [name, value];
  }).sort(([left], [right]) => left.localeCompare(right)));
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildStableRouteContract(path: string, html: string): StableRouteCapture {
  const base = buildHtmlContract(path, html);
  const document = parse(html) as unknown as HtmlNode;
  const externalHrefs = [...new Set(findElements(document, 'a')
    .map(attributes)
    .map((attrs) => attrs.href)
    .filter((href): href is string => /^https?:\/\//u.test(href)))]
    .sort((left, right) => left.localeCompare(right));
  const openGraph = Object.fromEntries(findElements(document, 'meta')
    .map(attributes)
    .filter((attrs) => attrs.property?.startsWith('og:') && attrs.content)
    .map((attrs) => [attrs.property, normalizeText(attrs.content)] as const)
    .sort(([left], [right]) => left.localeCompare(right)));
  const semantic = {
    canonical: base.canonical,
    title: base.title,
    description: base.description,
    openGraph,
    headings: base.headings.map((heading) => (
      heading.id && isGeneratedId(heading.id)
        ? { ...heading, id: '__framework_id__' }
        : heading
    )),
    bodyTextHash: base.bodyTextHash,
    internalHrefs: base.internalHrefs,
    externalHrefs,
    imageAttributes: base.imageAttributes.map(normalizeImageAttributes),
  };

  return {
    contract: { ...semantic, stableHtmlHash: stableHash(semantic) },
    privateBoundaryHits: findPrivateBoundaryHits(html),
  };
}

async function walkFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Renderer output may not contain symlinks: ${path}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function scanArtifactPrivateBoundary(root: string) {
  const resolvedRoot = resolve(root);
  const rootState = await lstat(resolvedRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error(`Renderer artifact root must be a real directory: ${root}`);
  }
  const hits = [];
  for (const file of await walkFiles(resolvedRoot)) {
    const artifactPath = relative(resolvedRoot, file).split(sep).join('/');
    const value = (await readFile(file)).toString('utf8');
    hits.push(...findPublicBoundaryHits(value, artifactPath));
  }
  return hits;
}

export async function hashOutputArtifact(root: string): Promise<string> {
  const resolvedRoot = resolve(root);
  const stats = await lstat(resolvedRoot);
  if (!stats.isDirectory()) throw new Error(`Renderer output is not a directory: ${root}`);
  const hash = createHash('sha256');
  for (const file of await walkFiles(resolvedRoot)) {
    const filePath = relative(resolvedRoot, file).split(sep).join('/');
    const bytes = await readFile(file);
    hash.update(`${Buffer.byteLength(filePath)}:${filePath}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

function htmlPath(outputDirectory: string, route: DecisionRoute): string {
  return route === '/'
    ? join(outputDirectory, 'index.html')
    : join(outputDirectory, route.replace(/^\/+|\/+$/gu, ''), 'index.html');
}

async function captureStaticContracts(outputDirectory: string) {
  return Promise.all(DECISION_ROUTES.map(async (path) => ({
    path,
    ...buildStableRouteContract(path, await readFile(htmlPath(outputDirectory, path), 'utf8')),
  })));
}

function containedRelativePath(root: string, candidate: string, label: string, allowRoot = false): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const candidateRelative = relative(resolvedRoot, resolvedCandidate);
  const contained = candidateRelative === ''
    || (!candidateRelative.startsWith(`..${sep}`) && candidateRelative !== '..' && !candidateRelative.startsWith('/'));
  if (!contained || (!allowRoot && candidateRelative === '')) {
    throw new Error(`${label} must be a contained repository path: ${candidate}`);
  }
  return candidateRelative.split(sep).join('/') || '.';
}

function isContainedPath(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate);
  return candidateRelative === ''
    || (candidateRelative !== '..'
      && !candidateRelative.startsWith(`..${sep}`)
      && !candidateRelative.startsWith('/'));
}

async function assertCleanCommittedSourceTree(repositoryRoot: string): Promise<string> {
  const repositoryCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  })).stdout.trim();
  const status = (await execFileAsync('git', [
    'status', '--porcelain=v1', '--untracked-files=all',
  ], { cwd: repositoryRoot })).stdout.trim();
  if (status) {
    throw new Error(`Renderer capture requires a clean committed source tree; dirty paths:\n${status}`);
  }
  return repositoryCommit;
}

async function removeCanonicalRendererPath(repositoryRoot: string, target: string): Promise<void> {
  const rootState = await lstat(repositoryRoot);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    throw new Error(`Renderer repository root must be a real directory: ${repositoryRoot}`);
  }
  const realRoot = await realpath(repositoryRoot);
  const targetRelative = relative(resolve(repositoryRoot), target);
  if (!isContainedPath(resolve(repositoryRoot), target) || targetRelative === '') {
    throw new Error(`Renderer clean path is outside the real repository root: ${target}`);
  }
  const realTarget = resolve(realRoot, targetRelative);

  let componentPath = realRoot;
  for (const component of targetRelative.split(sep)) {
    componentPath = join(componentPath, component);
    const state = await lstat(componentPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!state) break;
    if (state.isSymbolicLink()) {
      throw new Error(`Renderer clean path may not traverse a symlink: ${componentPath}`);
    }
    const realComponent = await realpath(componentPath);
    if (!isContainedPath(realRoot, realComponent)) {
      throw new Error(`Renderer clean path resolves outside the real repository root: ${componentPath}`);
    }
  }

  // Keep the component validation adjacent to the destructive operation. A fully
  // malicious local process can still race filesystem calls; the evidence gate's
  // trust boundary is a cooperative, single-operator local checkout.
  await rm(realTarget, { recursive: true, force: true });
}

export async function runBuildSamples(options: BuildSamplingOptions) {
  if (!/^[a-z0-9:-]+$/u.test(options.buildScript)) {
    throw new Error(`Unsafe npm build script name: ${options.buildScript}`);
  }
  if (options.buildSamples !== 3) throw new Error('Renderer comparison requires exactly three clean build samples');
  const repositoryRoot = resolve(options.repositoryRoot);
  const layout = RENDERER_LAYOUTS[options.renderer];
  const rendererRoot = resolve(repositoryRoot, layout.rendererRoot);
  const outputRoot = resolve(repositoryRoot, layout.outputRoot);
  const cleanDirectories = layout.cleanRoots.map((path) => resolve(repositoryRoot, path));
  if (options.rendererRoot !== rendererRoot
    || options.outputDirectory !== outputRoot
    || options.buildScript !== layout.buildScript
    || JSON.stringify(options.cleanDirectories) !== JSON.stringify(cleanDirectories)) {
    throw new Error(
      `Renderer ${options.renderer} requires exact canonical root/build/output/clean roots: ${layout.cleanRoots.join(',')}`,
    );
  }
  containedRelativePath(repositoryRoot, rendererRoot, 'Renderer root', true);
  const cleanedPaths = [...layout.cleanRoots];

  const samples: Array<{ durationMs: number; artifactHash: string; cleanedPaths: string[] }> = [];
  for (let index = 0; index < options.buildSamples; index += 1) {
    for (const directory of cleanDirectories) {
      await removeCanonicalRendererPath(repositoryRoot, directory);
    }
    const startedAt = performance.now();
    await execFileAsync('npm', ['run', options.buildScript], {
      cwd: rendererRoot,
      env: { ...process.env, NODE_ENV: 'production' },
      maxBuffer: 20 * 1024 * 1024,
    });
    samples.push({
      durationMs: Math.round(performance.now() - startedAt),
      artifactHash: await hashOutputArtifact(options.outputDirectory),
      cleanedPaths,
    });
  }
  const durations = samples.map((sample) => sample.durationMs);
  return {
    samples,
    medianDurationMs: median(durations),
    madDurationMs: medianAbsoluteDeviation(durations),
    reproducible: new Set(samples.map((sample) => sample.artifactHash)).size === 1,
    command: `npm run ${options.buildScript}`,
    workingDirectory: layout.rendererRoot,
    clean: {
      strategy: 'remove-recreate' as const,
      paths: cleanedPaths,
      beforeEachBuild: true as const,
    },
  };
}

async function readBrowserPin(repositoryRoot: string) {
  const lock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { version?: string }>;
  };
  const packageVersion = lock.packages?.['node_modules/@playwright/test']?.version;
  if (!packageVersion) throw new Error('package-lock.json does not pin @playwright/test');
  const browsers = JSON.parse(await readFile(
    join(repositoryRoot, 'node_modules/playwright-core/browsers.json'),
    'utf8',
  )) as { browsers: Array<{ name: string; revision: string; browserVersion: string }> };
  const chromiumPin = browsers.browsers.find((entry) => entry.name === 'chromium');
  if (!chromiumPin) throw new Error('Playwright Chromium pin is unavailable');
  return { packageVersion, chromiumPin };
}

async function sha256File(path: string): Promise<string> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isFile()) throw new Error(`Evidence file must be a real file: ${path}`);
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

const RENDERER_HARNESS_PATHS = [
  'tools/parity/src/capture-renderer.ts',
  'tools/parity/src/compare-contracts.ts',
  'tools/parity/src/measure-browser.ts',
  'tools/parity/src/renderer-layouts.ts',
  'tools/parity/src/select-renderer.ts',
  'tools/parity/src/serve-static.ts',
] as const;

async function rendererHarnessHash(repositoryRoot: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of RENDERER_HARNESS_PATHS) {
    const bytes = await readFile(join(repositoryRoot, path));
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function rendererHarnessHashAtCommit(repositoryRoot: string, commit: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of RENDERER_HARNESS_PATHS) {
    const bytes = Buffer.from((await execFileAsync('git', ['show', `${commit}:${path}`], {
      cwd: repositoryRoot,
      maxBuffer: 20 * 1024 * 1024,
    })).stdout);
    hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function captureProvenance(options: CaptureRendererOptions) {
  const rendererRoot = containedRelativePath(options.repositoryRoot, options.rendererRoot, 'Renderer root', true);
  const rendererManifest = containedRelativePath(
    options.repositoryRoot,
    options.rendererManifest,
    'Renderer manifest',
  );
  const outputRoot = containedRelativePath(options.repositoryRoot, options.outputDirectory, 'Output directory');
  const expected = RENDERER_LAYOUTS[options.renderer];
  if (rendererRoot !== expected.rendererRoot
    || rendererManifest !== expected.rendererManifest
    || options.buildScript !== expected.buildScript
    || outputRoot !== expected.outputRoot
    || JSON.stringify(options.cleanDirectories) !== JSON.stringify(
      expected.cleanRoots.map((path) => resolve(options.repositoryRoot, path)),
    )) {
    throw new Error(
      `Renderer evidence mismatch for ${options.renderer}: root=${rendererRoot} manifest=${rendererManifest} build=${options.buildScript} output=${outputRoot}`,
    );
  }
  const repositoryCommit = await assertCleanCommittedSourceTree(options.repositoryRoot);
  await execFileAsync('git', ['ls-files', '--error-unmatch', '--', rendererManifest], {
    cwd: options.repositoryRoot,
  }).catch(() => {
    throw new Error(`Renderer manifest must be committed source: ${rendererManifest}`);
  });
  if (rendererRoot !== '.') {
    const trackedRendererSource = (await execFileAsync('git', ['ls-files', '--', rendererRoot], {
      cwd: options.repositoryRoot,
    })).stdout.trim();
    if (!trackedRendererSource) throw new Error(`Renderer root has no committed source: ${rendererRoot}`);
  }
  const rendererManifestHash = await sha256File(options.rendererManifest);
  const manifestAtCommit = Buffer.from((await execFileAsync('git', [
    'show', `${repositoryCommit}:${rendererManifest}`,
  ], { cwd: options.repositoryRoot, maxBuffer: 20 * 1024 * 1024 })).stdout);
  const committedManifestHash = `sha256:${createHash('sha256').update(manifestAtCommit).digest('hex')}`;
  if (committedManifestHash !== rendererManifestHash) {
    throw new Error('Renderer manifest bytes do not match the recorded source commit');
  }
  const captureToolHash = await rendererHarnessHash(options.repositoryRoot);
  if (await rendererHarnessHashAtCommit(options.repositoryRoot, repositoryCommit) !== captureToolHash) {
    throw new Error('Renderer harness bytes do not match the recorded source commit');
  }
  return {
    synthetic: false,
    repositoryCommit,
    rendererRoot,
    rendererManifest,
    rendererManifestHash,
    buildCommand: `npm run ${options.buildScript}`,
    outputRoot,
    captureToolHash,
  } as const;
}

export async function captureRenderer(options: CaptureRendererOptions): Promise<RendererCaptureReport> {
  const provenance = await captureProvenance(options);
  const build = await runBuildSamples(options);
  const staticRoutes = await captureStaticContracts(options.outputDirectory);
  const artifactHash = await hashOutputArtifact(options.outputDirectory);
  const artifactPrivateBoundaryHits = await scanArtifactPrivateBoundary(options.outputDirectory);
  const pin = await readBrowserPin(options.repositoryRoot);
  const server = await startStaticServer({
    root: options.outputDirectory,
    host: options.host,
    port: options.port,
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const chromiumVersion = browser.version();
    if (chromiumVersion !== pin.chromiumPin.browserVersion) {
      throw new Error(
        `Chromium version mismatch: package pin ${pin.chromiumPin.browserVersion}, actual ${chromiumVersion}`,
      );
    }
    const routes = [];
    for (const route of staticRoutes) {
      const measurements = [];
      for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
        const measurement = await measureBrowserPage(browser, server.baseUrl, route.path, viewport);
        measurement.privateBoundaryHits = [...new Set([
          ...route.privateBoundaryHits,
          ...measurement.privateBoundaryHits,
        ])].sort();
        measurements.push(measurement);
      }
      routes.push({ path: route.path, contract: route.contract, measurements });
    }

    const report: RendererCaptureReport = {
      version: 2,
      renderer: options.renderer,
      provenance,
      measuredAt: new Date().toISOString(),
      captureProtocol: CAPTURE_PROTOCOL,
      browser: {
        package: '@playwright/test',
        packageVersion: pin.packageVersion,
        chromiumVersion,
        chromiumRevision: pin.chromiumPin.revision,
      },
      artifactHash,
      artifactPrivateBoundaryHits,
      build,
      routes,
    };
    const finalCommit = await assertCleanCommittedSourceTree(options.repositoryRoot);
    if (finalCommit !== provenance.repositoryCommit) {
      throw new Error('Renderer source commit changed during capture');
    }
    return report;
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}

function parseArguments(argv: string[]): CaptureRendererOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${name ?? '<end>'}`);
    values.set(name.slice(2), value);
  }
  const repositoryRoot = resolve(values.get('repository-root') ?? process.cwd());
  const renderer = values.get('renderer');
  if (renderer !== 'astro' && renderer !== 'next' && renderer !== 'react-router') {
    throw new Error('--renderer must be astro, next, or react-router');
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  const layout = RENDERER_LAYOUTS[renderer];
  const rawRendererRoot = values.get('renderer-root') ?? '.';
  const rawManifest = required('renderer-manifest');
  const rawOutputRoot = required('root');
  const rawCleanRoots = required('clean-paths').split(',').map((path) => path.trim());
  if (rawRendererRoot !== layout.rendererRoot
    || rawManifest !== layout.rendererManifest
    || rawOutputRoot !== layout.outputRoot
    || JSON.stringify(rawCleanRoots) !== JSON.stringify(layout.cleanRoots)) {
    throw new Error(
      `Renderer ${renderer} CLI paths must be exact canonical paths; clean roots=${layout.cleanRoots.join(',')}`,
    );
  }
  return {
    repositoryRoot,
    rendererRoot: resolve(repositoryRoot, rawRendererRoot),
    rendererManifest: resolve(repositoryRoot, rawManifest),
    outputDirectory: resolve(repositoryRoot, rawOutputRoot),
    cleanDirectories: rawCleanRoots.map((path) => resolve(repositoryRoot, path)),
    outputPath: resolve(repositoryRoot, required('output')),
    renderer,
    buildScript: required('build-script'),
    buildSamples: Number(values.get('build-samples') ?? 3),
    host: values.get('host') ?? '127.0.0.1',
    port: Number(values.get('port') ?? 0),
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const report = await captureRenderer(options);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Captured ${report.renderer} renderer report at ${options.outputPath}`);
}
