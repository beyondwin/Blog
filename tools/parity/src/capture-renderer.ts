import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { parse } from 'parse5';
import { buildHtmlContract } from './html-contract.ts';
import {
  DECISION_ROUTES,
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
  outputDirectory: string;
  outputPath: string;
  renderer: RendererName;
  buildScript: string;
  buildSamples: number;
  host: string;
  port: number;
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

async function runBuildSamples(options: CaptureRendererOptions) {
  if (!/^[a-z0-9:-]+$/u.test(options.buildScript)) {
    throw new Error(`Unsafe npm build script name: ${options.buildScript}`);
  }
  if (options.buildSamples !== 3) throw new Error('Renderer comparison requires exactly three clean build samples');

  const samples: Array<{ durationMs: number; artifactHash: string }> = [];
  for (let index = 0; index < options.buildSamples; index += 1) {
    const startedAt = performance.now();
    await execFileAsync('npm', ['run', options.buildScript], {
      cwd: options.repositoryRoot,
      env: { ...process.env, NODE_ENV: 'production' },
      maxBuffer: 20 * 1024 * 1024,
    });
    samples.push({
      durationMs: Math.round(performance.now() - startedAt),
      artifactHash: await hashOutputArtifact(options.outputDirectory),
    });
  }
  const durations = samples.map((sample) => sample.durationMs);
  return {
    samples,
    medianDurationMs: median(durations),
    madDurationMs: medianAbsoluteDeviation(durations),
    reproducible: new Set(samples.map((sample) => sample.artifactHash)).size === 1,
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

export async function captureRenderer(options: CaptureRendererOptions): Promise<RendererCaptureReport> {
  const build = await runBuildSamples(options);
  const staticRoutes = await captureStaticContracts(options.outputDirectory);
  const artifactHash = await hashOutputArtifact(options.outputDirectory);
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

    return {
      version: 1,
      renderer: options.renderer,
      measuredAt: new Date().toISOString(),
      captureProtocol: {
        decisionRoutes: [...DECISION_ROUTES],
        viewports: VIEWPORTS,
        warmups: 1,
        samplesPerRouteViewport: 5,
        freshBrowserContextPerSample: true,
        emptyHttpCachePerSample: true,
      },
      browser: {
        package: '@playwright/test',
        packageVersion: pin.packageVersion,
        chromiumVersion,
        chromiumRevision: pin.chromiumPin.revision,
      },
      artifactHash,
      build,
      routes,
    };
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
  return {
    repositoryRoot,
    outputDirectory: resolve(repositoryRoot, required('root')),
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
