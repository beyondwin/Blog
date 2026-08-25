import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { arch, platform, release as osRelease } from 'node:os';
import { access, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import { buildHtmlContract, type AstroBaseline } from '../../tools/parity/src/html-contract.ts';
import { hashFiles, hashTree, readJson, sha256 } from './cutover-evidence.mts';
import { checkExactDrillPorts, prepareStateFile, writeProxyTarget, type ProxyTarget } from './local-proxy.mts';
import { assertDynamicCrawl, deriveChangedSurfacePerformance, npmObservedCommandLine, sealChangedSurfacePerformance, tsxObservedCommandLine, validateOwnedProcessIdentity, type DynamicRouteExpectation } from './evidence-contracts.mts';
import {
  installOwnedSignalHandlers,
  registerOwnedProcess,
  runOwnedCleanupSteps,
  stabilizeOwnedProcess,
  terminateOwnedProcess,
  type OwnedProcessEvidence,
  type OwnedSignalEvidence,
  type ProcessSnapshot,
  type SignalTarget,
} from './owned-process-lifecycle.mts';
import type { ProxyTransition } from './verify-public-site.mts';

const execFileAsync = promisify(execFile);

export interface Task14Metric {
  route: string;
  viewport: string;
  lcp_median_ms: number;
  cls_median: number;
  initial_js_gzip_bytes: number;
  image_bytes: number;
  mandatory_issues: number;
}

const representativeRoutes = [
  '/',
  '/articles/why-i-read-in-the-ai-era/',
  '/reviews/black-swan/',
  '/memory/agent-harnesses-are-operating-systems/',
  '/search/',
  '/tags/AI/',
  '/reviews/the-life-you-can-save/',
] as const;

const task14RoutePaths: Record<string, string[]> = {
  '/': [
    'apps/site/app/routes/home.tsx',
    'apps/site/src/ui/scene/SceneObject.tsx',
    'apps/site/src/ui/scene/ScenePage.tsx',
    'apps/site/src/ui/styles/route-scene.css',
  ],
  '/articles/why-i-read-in-the-ai-era/': [
    'apps/site/app/routes/article.tsx',
    'apps/site/src/ui/reading/ArticleReadingPage.tsx',
    'apps/site/src/ui/styles/route-article.css',
  ],
  '/reviews/black-swan/': [
    'apps/site/app/routes/review.tsx',
    'apps/site/src/ui/reading/ReviewReadingPage.tsx',
    'apps/site/src/ui/styles/route-review.css',
  ],
  '/memory/agent-harnesses-are-operating-systems/': [
    'apps/site/app/routes/memory.tsx',
    'apps/site/src/ui/memory/MemoryDetailPage.tsx',
    'apps/site/src/ui/styles/route-memory.css',
  ],
};

function outputPath(root: string, route: string): string {
  if (route === '/') return join(root, 'index.html');
  return join(root, decodeURIComponent(route.slice(1)), 'index.html');
}

function redirectDestination(html: string): string | null {
  return html.match(/<meta\s+http-equiv="refresh"\s+content="[^"]*url=([^"]+)"/iu)?.[1]
    ?? html.match(/<a\s+href="([^"]+)"/iu)?.[1]
    ?? null;
}

function cleanInternalPath(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('__bw_')) return null;
  const url = new URL(value, 'http://127.0.0.1');
  return decodeURIComponent(url.pathname);
}

async function outputExists(root: string, publicPath: string): Promise<boolean> {
  const path = publicPath.endsWith('/') ? outputPath(root, publicPath) : join(root, publicPath.slice(1));
  return access(path).then(() => true, () => false);
}

async function scopedRouteFailures(
  reactRoot: string,
  route: string,
  html: string,
  inventory: ReadonlySet<string>,
): Promise<string[]> {
  const failures: string[] = [];
  if (/\/Users\/|[A-Za-z]:\\Users\\|memory[\\/](?:thoughts[\\/]|edges\.jsonl|sources\.jsonl)|(?:rawPrompt|jobPayload|privatePath)\s*[:=]/iu.test(html)) {
    failures.push(`${route}: private boundary hit`);
  }
  const contract = buildHtmlContract(route, html);
  for (const href of contract.internalHrefs) {
    const path = cleanInternalPath(href);
    if (!path) {
      failures.push(`${route}: unsafe internal href ${href}`);
      continue;
    }
    const normalized = path.endsWith('/') ? path : `${path}/`;
    if (!inventory.has(path) && !inventory.has(normalized) && !await outputExists(reactRoot, path)) {
      failures.push(`${route}: unresolved internal href ${href}`);
    }
  }
  for (const image of contract.imageAttributes) {
    const width = Number(image.width);
    const height = Number(image.height);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      failures.push(`${route}: image is missing positive intrinsic dimensions`);
    }
    for (const candidate of [image.src, ...(image.srcset ?? '').split(',').map((entry) => entry.trim().split(/\s+/u)[0])]
      .filter((value): value is string => Boolean(value))) {
      if (!candidate.startsWith('/') || !await outputExists(reactRoot, candidate)) {
        failures.push(`${route}: unresolved image candidate ${candidate}`);
      }
    }
  }
  for (const source of html.matchAll(/<source\b[^>]*\bsrcset="([^"]+)"[^>]*>/giu)) {
    for (const candidate of source[1]!.split(',').map((entry) => entry.trim().split(/\s+/u)[0]!).filter(Boolean)) {
      if (!candidate.startsWith('/') || !await outputExists(reactRoot, candidate)) {
        failures.push(`${route}: unresolved picture candidate ${candidate}`);
      }
    }
  }
  return failures;
}

async function htmlRouteInventory(root: string, directory = root): Promise<string[]> {
  const routes: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) routes.push(...await htmlRouteInventory(root, path));
    else if (entry.isFile() && entry.name === 'index.html') {
      const relative = path.slice(root.length).replaceAll('\\', '/');
      routes.push(relative === '/index.html' ? '/' : relative.replace(/index\.html$/u, ''));
    }
  }
  return routes.sort((left, right) => left.localeCompare(right));
}

export function parseTask14Metrics(report: string): Task14Metric[] {
  const metrics = report.split('\n').filter((line) => line.startsWith('| `/' )).map((line) => {
    const columns = line.split('|').slice(1, -1).map((column) => column.trim());
    const route = columns[0]?.replaceAll('`', '') ?? '';
    const viewport = columns[1] ?? '';
    const lcpMedian = Number(columns[3]?.split('/')[0]?.trim());
    const cls = Number(columns[5]);
    const js = Number(columns[6]?.replace(/[^0-9]/gu, ''));
    const image = Number(columns[7]?.replace(/[^0-9]/gu, ''));
    const issues = Number(columns[8]);
    if (!route || !viewport || ![lcpMedian, cls, js, image, issues].every(Number.isFinite)) {
      throw new Error('Task 14 metric table is malformed');
    }
    return {
      route,
      viewport,
      lcp_median_ms: lcpMedian,
      cls_median: cls,
      initial_js_gzip_bytes: js,
      image_bytes: image,
      mandatory_issues: issues,
    };
  });
  if (metrics.length !== 8 || metrics.some(({ mandatory_issues }) => mandatory_issues !== 0)) {
    throw new Error('Task 14 metric summary is incomplete or failing');
  }
  return metrics;
}

export async function verifyStaticCutoverContract(options: {
  root: string;
  reactRoot: string;
  astroRoot: string;
  baselinePath: string;
}): Promise<{
  route_count: number;
  inventory_hash: string;
  metadata_checked: number;
  redirects_checked: number;
  scoped_routes_checked: number;
  failures: string[];
}> {
  const baseline = await readJson<AstroBaseline>(options.baselinePath);
  const inventory = new Set(baseline.routes.map((route) => route.path));
  const failures: string[] = [];
  const [reactInventory, astroInventory] = await Promise.all([
    htmlRouteInventory(options.reactRoot),
    htmlRouteInventory(options.astroRoot),
  ]);
  const expectedInventory = [...inventory].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(reactInventory) !== JSON.stringify(expectedInventory)) {
    failures.push('React public route inventory differs from the exact sealed 80 paths');
  }
  if (JSON.stringify(astroInventory) !== JSON.stringify(expectedInventory)) {
    failures.push('Astro rollback route inventory differs from the exact sealed 80 paths');
  }
  let redirectsChecked = 0;
  for (const expected of baseline.routes) {
    const [reactHtml, astroHtml] = await Promise.all([
      readFile(outputPath(options.reactRoot, expected.path), 'utf8').catch(() => ''),
      readFile(outputPath(options.astroRoot, expected.path), 'utf8').catch(() => ''),
    ]);
    if (!reactHtml) {
      failures.push(`${expected.path}: missing React output`);
      continue;
    }
    if (!astroHtml) {
      failures.push(`${expected.path}: missing Astro rollback output`);
      continue;
    }
    const react = buildHtmlContract(expected.path, reactHtml);
    const astro = buildHtmlContract(expected.path, astroHtml);
    const expectedRedirect = expected.title.startsWith('Redirecting to:') ? expected.canonical : null;
    if (expectedRedirect) {
      redirectsChecked += 1;
      if (redirectDestination(reactHtml) !== expectedRedirect || redirectDestination(astroHtml) !== expectedRedirect) {
        failures.push(`${expected.path}: redirect destination drifted`);
      }
    } else if (react.canonical !== expected.canonical || astro.canonical !== expected.canonical) {
      failures.push(`${expected.path}: canonical drifted`);
    }
    if (react.title !== expected.title || astro.title !== expected.title) failures.push(`${expected.path}: title drifted`);
    if (react.description !== expected.description || astro.description !== expected.description) {
      failures.push(`${expected.path}: description drifted`);
    }
    failures.push(...await scopedRouteFailures(options.reactRoot, expected.path, reactHtml, inventory));
  }
  return {
    route_count: baseline.routes.length,
    inventory_hash: sha256(`${[...inventory].sort().join('\n')}\n`),
    metadata_checked: baseline.routes.length,
    redirects_checked: redirectsChecked,
    scoped_routes_checked: baseline.routes.length,
    failures,
  };
}

async function processSnapshot(pid: number): Promise<ProcessSnapshot> {
  const [identity, start] = await Promise.all([
    execFileAsync('ps', ['-p', String(pid), '-o', 'pid=,ppid=,pgid=,command=']),
    execFileAsync('ps', ['-p', String(pid), '-o', 'lstart=']),
  ]);
  const match = identity.stdout.trim().match(/^([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+(.+)$/u);
  if (!match || !start.stdout.trim()) throw new Error(`created process ${pid} is not running`);
  return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), start_identity: start.stdout.trim(), command_line: match[4]! };
}

async function processGroupSnapshots(pgid: number): Promise<ProcessSnapshot[]> {
  const result = await execFileAsync('ps', ['-axo', 'pid=,ppid=,pgid=,command=']);
  const identities = result.stdout.split('\n').flatMap((line) => {
    const match = line.trim().match(/^([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+(.+)$/u);
    if (!match || Number(match[3]) !== pgid) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command_line: match[4]! }];
  });
  const snapshots = await Promise.all(identities.map(async (identity) => {
    const start = await execFileAsync('ps', ['-p', String(identity.pid), '-o', 'lstart=']).catch(() => null);
    if (!start?.stdout.trim()) return null;
    return { ...identity, start_identity: start.stdout.trim() };
  }));
  return snapshots.filter((snapshot): snapshot is ProcessSnapshot => snapshot !== null).sort((left, right) => left.pid - right.pid);
}

async function smokeTransition(base: string, target: ProxyTarget): Promise<ProxyTransition> {
  const routes: ProxyTransition['routes'] = [];
  for (const path of representativeRoutes) {
    const directBase = target === 'react' ? 'http://127.0.0.1:4391' : 'http://127.0.0.1:4392';
    const [proxied, direct] = await Promise.all([
      fetch(new URL(path, base), { redirect: 'manual' }),
      fetch(new URL(path, directBase), { redirect: 'manual' }),
    ]);
    const [proxiedBody, directBody] = await Promise.all([proxied.arrayBuffer(), direct.arrayBuffer()]);
    const targetHeader = proxied.headers.get('x-beyondwin-cutover-target') ?? '';
    if (proxied.status !== direct.status || targetHeader !== target || sha256(Buffer.from(proxiedBody)) !== sha256(Buffer.from(directBody))) {
      throw new Error(`${target} proxy smoke mismatch at ${path}`);
    }
    routes.push({
      path,
      status: proxied.status,
      target_header: targetHeader,
      body_hash: sha256(Buffer.from(proxiedBody)),
    });
  }
  return { target, routes };
}

interface DrillArguments {
  implementationCommit: string;
  performanceReceipt: string;
  performanceReceiptArgument: string;
  output: string;
  outputArgument: string;
}

function parseDrillArguments(argv: readonly string[]): DrillArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value) throw new Error('cutover drill arguments require key/value pairs');
    if (!['--implementation-commit', '--performance-receipt', '--output'].includes(key)) {
      throw new Error(`unknown argument: ${key}`);
    }
    if (values.has(key)) throw new Error(`duplicate argument: ${key}`);
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`missing ${key}`);
    return value;
  };
  const performanceReceiptArgument = required('--performance-receipt');
  const outputArgument = required('--output');
  return {
    implementationCommit: required('--implementation-commit'),
    performanceReceipt: resolve(performanceReceiptArgument), performanceReceiptArgument,
    output: resolve(outputArgument), outputArgument,
  };
}

const exactCommands = {
  react: ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'],
  astro: ['npm', 'run', 'legacy:preview', '--', '--host', '127.0.0.1', '--port', '4392'],
  proxy: ['npm', 'run', 'cutover:proxy', '--', '--listen', '127.0.0.1:4390', '--react', 'http://127.0.0.1:4391', '--astro', 'http://127.0.0.1:4392'],
} as const;

async function waitFor(check: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

interface RuntimeOwnedProcess {
  evidence: OwnedProcessEvidence;
  child: ChildProcess;
  exit: Promise<{ exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null }>;
}

async function spawnedProcess(
  role: keyof typeof exactCommands,
  argv: readonly string[],
  root: string,
  evidenceRegistry: OwnedProcessEvidence[],
  runtimeRegistry: RuntimeOwnedProcess[],
): Promise<RuntimeOwnedProcess> {
  const startedAt = new Date().toISOString();
  const child = spawn(argv[0]!, argv.slice(1), { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: true });
  if (!child.pid) throw new Error(`failed to start owned ${role} process`);
  const expectedCommand = npmObservedCommandLine(argv);
  const evidence = registerOwnedProcess(evidenceRegistry, { role, argv, expectedCommand, rootPid: child.pid, controllerPid: process.pid, startedAt });
  const exit = new Promise<{ exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    child.once('exit', (exitCode, signal) => resolveExit({ exited_at: new Date().toISOString(), exit_code: exitCode, signal }));
  });
  const runtime = { evidence, child, exit };
  runtimeRegistry.push(runtime);
  child.stdout?.pipe(process.stdout); child.stderr?.pipe(process.stderr);
  await stabilizeOwnedProcess(evidence, () => processSnapshot(child.pid!), expectedCommand);
  validateOwnedProcessIdentity(evidence, {
    controllerPid: process.pid, expectedRole: role, expectedArgv: argv, expectedObservedCommandLine: expectedCommand,
  });
  return runtime;
}

async function descendantOf(pid: number, ancestor: number): Promise<boolean> {
  let current = pid;
  for (let depth = 0; depth < 20; depth += 1) {
    const snapshot = await processSnapshot(current).catch(() => null);
    if (!snapshot) return false;
    if (snapshot.ppid === ancestor) return true;
    if (snapshot.ppid <= 1 || snapshot.ppid === current) return false;
    current = snapshot.ppid;
  }
  return false;
}

async function portOwnerPids(port: number): Promise<number[]> {
  const result = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).catch(() => ({ stdout: '' }));
  return parsePortOwnerPids(result.stdout);
}

export function parsePortOwnerPids(stdout: string): number[] {
  return [...new Set(stdout.split('\n').map((value) => value.trim()).filter((value) => /^[1-9][0-9]*$/u.test(value)).map(Number))]
    .sort((left, right) => left - right);
}

async function stopOwned(entry: RuntimeOwnedProcess): Promise<void> {
  await terminateOwnedProcess(entry.evidence, {
    snapshot: processSnapshot,
    groupMembers: processGroupSnapshots,
    signalGroup: (pgid, signal) => process.kill(-pgid, signal),
    waitForRootExit: () => Promise.race([
      entry.exit,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`owned ${entry.evidence.role} root did not exit after TERM`)), 15_000)),
    ]),
  });
}

interface ExpectedUrlPage {
  url(): string;
  waitForURL(predicate: (url: URL) => boolean, options: { timeout: number; waitUntil: 'networkidle' }): Promise<unknown>;
}

export async function waitForExpectedFinalUrl(page: ExpectedUrlPage, expected: DynamicRouteExpectation): Promise<void> {
  if (!expected.redirected) return;
  const expectedOrigin = new URL(page.url()).origin;
  const isExpected = (url: URL): boolean => url.origin === expectedOrigin && url.pathname === expected.finalUrl && url.search === '' && url.hash === '';
  await page.waitForURL(isExpected, { timeout: 5_000, waitUntil: 'networkidle' });
  if (!isExpected(new URL(page.url()))) throw new Error(`${expected.path} did not reach its expected final URL ${expected.finalUrl}`);
}

async function dynamicCrawl(
  baseUrl: string,
  expectedRoutes: readonly DynamicRouteExpectation[],
  results: Array<Record<string, unknown>> = [],
): Promise<Array<Record<string, unknown>>> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
    for (const expected of expectedRoutes) {
      const { path } = expected;
      const page = await context.newPage();
      const consoleErrors: string[] = []; const pageErrors: string[] = []; const hydrationErrors: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error') consoleErrors.push(text);
        if (/hydration|did not match|server rendered html/iu.test(text)) hydrationErrors.push(text);
      });
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
        if (/hydration|did not match|server rendered html/iu.test(error.message)) hydrationErrors.push(error.message);
      });
      const response = await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle' });
      await waitForExpectedFinalUrl(page, expected);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((resolveReady) => requestAnimationFrame(() => requestAnimationFrame(() => resolveReady()))); });
      const content = await page.content();
      const axe = await new AxeBuilder({ page }).analyze();
      const overflow = await page.evaluate(() => ({ expected_max_width: 1440, actual_scroll_width: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > 1440 }));
      results.push({
        path, status: response?.status() ?? 0, final_url: new URL(page.url()).pathname,
        redirected: new URL(page.url()).pathname !== path,
        console_errors: [...new Set(consoleErrors)].sort(), page_errors: [...new Set(pageErrors)].sort(), hydration_errors: [...new Set(hydrationErrors)].sort(),
        axe_serious_or_critical: axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical').map(({ id, impact }) => `${id}: ${String(impact)}`).sort(),
        overflow,
        private_boundary_hits: [...new Set(content.match(/\/Users\/[^\s"'<>]+|\/home\/[^\s"'<>]+|[A-Za-z]:\\Users\\[^\s"'<>]+|memory\/thoughts\/[^\s"'<>]+/gu) ?? [])].sort(),
      });
      await page.close();
    }
    await context.close();
    return results;
  } finally { await browser.close(); }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

async function writeJsonAtomic(output: string, value: unknown): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const temporary = join(dirname(output), `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function persistDrillReceipt<T extends Record<string, unknown>>(
  output: string,
  accumulated: T,
  failure?: unknown,
  options: { rethrow?: boolean } = {},
): Promise<T & { eligible: boolean; errors: string[] }> {
  const existingErrors = Array.isArray(accumulated.errors) ? accumulated.errors.map(String) : [];
  const errors = failure === undefined ? existingErrors : [...existingErrors, errorText(failure)];
  const receipt = { ...accumulated, eligible: failure === undefined && errors.length === 0, errors } as T & { eligible: boolean; errors: string[] };
  await writeJsonAtomic(output, receipt);
  if (!receipt.eligible && options.rethrow !== false) throw new Error(`local cutover drill failed; ineligible receipt: ${output}`, failure === undefined ? undefined : { cause: failure });
  return receipt;
}

async function runDrill(options: DrillArguments): Promise<void> {
  const root = process.cwd();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== options.implementationCommit) throw new Error('drill must run from the exact implementation commit');
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (status) throw new Error(`drill requires a clean tracked worktree:\n${status}`);
  await checkExactDrillPorts();
  const reactRoot = join(root, 'apps/site/build/client'); const astroRoot = join(root, 'dist');
  const baselinePath = join(root, 'tests/fixtures/parity/astro-public-baseline.json');
  const staticContract = await verifyStaticCutoverContract({
    root, reactRoot, astroRoot, baselinePath,
  });
  if (staticContract.failures.length > 0) throw new Error(`static cutover contract failed:\n${staticContract.failures.join('\n')}`);
  const active = await readActiveRelease(join(root, 'build/public-releases'));
  const packageLock = await readJson<{ packages: Record<string, { version?: string }>; }>(join(root, 'package-lock.json'));
  const browsers = await readJson<{ browsers: Array<{ name: string; browserVersion: string }>; }>(join(root, 'node_modules/playwright-core/browsers.json'));
  const routeSourceHashes = Object.fromEntries(await Promise.all(
    Object.entries(task14RoutePaths).map(async ([route, paths]) => [route, await hashFiles(root, paths)]),
  ));
  const performanceReport = sealChangedSurfacePerformance(await readJson(options.performanceReceipt));
  const performanceCommit = String(performanceReport.repositoryHead ?? '');
  if (!/^[a-f0-9]{40}$/u.test(performanceCommit)) throw new Error('changed-surface performance commit is invalid');
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', performanceCommit, head], { cwd: root });
  } catch {
    throw new Error('changed-surface performance commit is not an ancestor of the final implementation commit');
  }
  const performance = deriveChangedSurfacePerformance(performanceReport, {
    implementationCommit: performanceCommit, releaseId: active.manifest.releaseId,
    routeSourceHash: routeSourceHashes['/reviews/black-swan/']!,
    measurementImplementationHash: await hashFiles(root, ['tools/parity/src/compare-contracts.ts', 'tools/parity/src/measure-browser.ts', 'tests/fixtures/parity/astro-renderer-baseline.json']),
    harnessHash: await hashFiles(root, ['tests/e2e/performance-selection.ts', 'tests/e2e/performance.spec.ts']),
    configHash: await hashFiles(root, ['package-lock.json', 'package.json', 'playwright.config.ts', 'tests/e2e/support.ts']),
    releaseManifestHash: await hashFiles(root, ['build/public-releases/active.json', `build/public-releases/${active.manifest.releaseId}/manifest.json`]),
  }, await readJson(join(root, 'tests/fixtures/parity/astro-renderer-baseline.json')));
  if (!performance.eligible) throw new Error('changed-surface review performance is not eligible; local drill refused');
  const staticEvidence = {
    ...staticContract,
    environment: { node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), os: `${platform()} ${osRelease()} ${arch()}`, playwright: packageLock.packages['node_modules/@playwright/test']?.version ?? 'unknown', chromium: browsers.browsers.find(({ name }) => name === 'chromium')?.browserVersion ?? 'unknown' },
    release: { release_id: active.manifest.releaseId, active_pointer_hash: active.activePointerHash, manifest_hash: active.manifestHash, artifact_hash: active.artifactHash },
    builds: { react_root: 'apps/site/build/client', react_hash: await hashTree(reactRoot), astro_root: 'dist', astro_hash: await hashTree(astroRoot), rollback_hash: await hashTree(astroRoot) },
    task14: { eligible: performance.eligible, performance_commit: performanceCommit, route_source_hashes: routeSourceHashes, metric_summary: performance.metrics },
  };

  const controllerObserved = await processSnapshot(process.pid);
  const controllerArgv = [
    process.execPath, join(root, 'scripts/cutover/verify-rollback.mts'),
    '--implementation-commit', options.implementationCommit,
    '--performance-receipt', options.performanceReceiptArgument,
    '--output', options.outputArgument,
  ];
  const controllerCommand = tsxObservedCommandLine(controllerArgv, root);
  if (JSON.stringify(process.argv) !== JSON.stringify(controllerArgv) || controllerObserved.command_line !== controllerCommand) {
    throw new Error('local cutover controller command does not match its exact verifier invocation');
  }
  const controller = {
    pid: process.pid, ppid: process.ppid, pgid: controllerObserved.pgid, argv: controllerArgv,
    start_identity: controllerObserved.start_identity, observed: controllerObserved,
  };
  const tempRoot = mkdtempSync('/tmp/beyondwin-cutover.');
  const expectedRealPath = join(realpathSync('/tmp'), basename(tempRoot));
  if (realpathSync(tempRoot) !== expectedRealPath) throw new Error('cutover temp realpath is invalid');
  const statePath = join(tempRoot, 'target'); const pidPath = join(tempRoot, 'proxy.pid');
  const processEvidence: OwnedProcessEvidence[] = [];
  const processes: RuntimeOwnedProcess[] = [];
  let cleanupPromise: Promise<void> | null = null;
  const cleanup = async (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      let cleanupError: unknown;
      for (const entry of [...processes].reverse()) if (!entry.evidence.stopped) {
        try { await stopOwned(entry); } catch (error) { cleanupError ??= error; }
      }
      if (cleanupError) throw cleanupError;
    })();
    return cleanupPromise;
  };
  let proxyWorker: Record<string, unknown> | null = null; let transitions: ProxyTransition[] = []; let crawl: Array<Record<string, unknown>> = [];
  let ownersWhileRunning: Array<{ port: number; pids: number[]; root_pid: number; owned_by_group: boolean }> = [];
  let runError: unknown; let tempRemoved = false; let portsFreeAfter = false; const receiptErrors: string[] = [];
  let cleanupAllPromise: Promise<void> | null = null;
  const cleanupAll = async (): Promise<void> => {
    if (cleanupAllPromise) return cleanupAllPromise;
    cleanupAllPromise = (async () => {
      const errors = await runOwnedCleanupSteps([
        ['owned process cleanup', cleanup],
        ['proxy worker cleanup', async () => {
          if (!proxyWorker) return;
          const workerPid = Number(proxyWorker.pid);
          const stopped = await processSnapshot(workerPid).then(() => false, () => true);
          proxyWorker.stopped = stopped;
          if (!stopped) throw new Error('proxy worker remained after owned proxy root stopped');
        }],
        ['drill port cleanup', async () => { await checkExactDrillPorts(); portsFreeAfter = true; }],
        ['cutover temp cleanup', async () => {
          if (tempRemoved) return;
          if (await realpath(tempRoot) !== expectedRealPath) throw new Error('cutover temp realpath changed before cleanup');
          await rm(tempRoot, { recursive: true }); tempRemoved = true;
        }],
      ]);
      receiptErrors.push(...errors);
      if (errors.length > 0) runError ??= new Error(errors.join('\n'));
    })();
    return cleanupAllPromise;
  };
  const buildReceipt = (signalEvidence: OwnedSignalEvidence) => ({
    schema_version: 3, implementation_commit: head, eligible: false, errors: receiptErrors,
    ports: { proxy: 4390, react: 4391, astro: 4392 }, representatives: [...representativeRoutes], transitions,
    controller: { ...controller, signal_handlers: signalEvidence },
    processes: processEvidence, proxy_worker: proxyWorker,
    port_lifecycle: { before_free: [4390, 4391, 4392], during_owned: [4390, 4391, 4392], owners_while_running: ownersWhileRunning, after_free: portsFreeAfter ? [4390, 4391, 4392] : [] },
    temp_root: { pattern: '/tmp/beyondwin-cutover.*', path: tempRoot, realpath: expectedRealPath, realpath_validated: true, removed: tempRemoved },
    dynamic_crawl: { route_count: crawl.length, failures: runError === undefined ? [] : [errorText(runError)], routes: crawl },
    static_contract: staticEvidence,
  });
  const signalHandlers = installOwnedSignalHandlers(process as unknown as SignalTarget, async (signal) => {
    runError ??= new Error(`local cutover drill interrupted by ${signal}`);
    await cleanupAll();
  }, (code) => process.exit(code), {
    beforeExit: async (_signal, evidence) => {
      await persistDrillReceipt(options.output, buildReceipt(evidence), runError, { rethrow: false });
    },
  });
  try {
    await prepareStateFile(statePath);
    const react = await spawnedProcess('react', exactCommands.react, root, processEvidence, processes);
    const astro = await spawnedProcess('astro', exactCommands.astro, root, processEvidence, processes);
    await waitFor(async () => (await fetch('http://127.0.0.1:4391/')).status === 200, 'React preview');
    await waitFor(async () => (await fetch('http://127.0.0.1:4392/')).status === 200, 'Astro preview');
    const proxyArgv = [...exactCommands.proxy, '--state', statePath, '--pid-file', pidPath];
    const proxy = await spawnedProcess('proxy', proxyArgv, root, processEvidence, processes);
    await waitFor(async () => access(pidPath).then(() => true, () => false), 'proxy PID file');
    const workerPid = Number((await readFile(pidPath, 'utf8')).trim());
    const workerSnapshot = await processSnapshot(workerPid);
    proxyWorker = { ...workerSnapshot, root_pid: proxy.evidence.root_pid, descendant_of_proxy: await descendantOf(workerPid, proxy.evidence.root_pid), process_group_owned: workerSnapshot.pgid === proxy.evidence.root_pid, stopped: false };
    if (!proxyWorker.descendant_of_proxy) throw new Error('proxy PID-file worker is not a descendant of the owned proxy root');
    await waitFor(async () => (await fetch('http://127.0.0.1:4390/')).status === 200, 'local proxy');
    const rootsByPort = new Map([[4390, proxy.evidence.root_pid], [4391, react.evidence.root_pid], [4392, astro.evidence.root_pid]]);
    ownersWhileRunning = await Promise.all([4390, 4391, 4392].map(async (port) => {
      const pids = await portOwnerPids(port); const ownedRoot = rootsByPort.get(port)!;
      const owned = (await Promise.all(pids.map(async (pid) => (await processSnapshot(pid)).pgid === ownedRoot))).every(Boolean);
      return { port, pids, root_pid: ownedRoot, owned_by_group: owned };
    }));
    if (ownersWhileRunning.some(({ pids }) => pids.length === 0)) throw new Error('one or more drill ports has no observed owned listener');
    if (ownersWhileRunning.some(({ owned_by_group }) => !owned_by_group)) throw new Error('one or more drill listeners escaped its owned process group');
    for (const target of ['react', 'astro', 'react'] as const) {
      await writeProxyTarget(statePath, target); transitions.push(await smokeTransition('http://127.0.0.1:4390', target));
    }
    await writeProxyTarget(statePath, 'react');
    const baseline = await readJson<AstroBaseline>(baselinePath);
    const dynamicExpectations = baseline.routes.map((route) => ({
      path: route.path,
      finalUrl: route.title.startsWith('Redirecting to:') ? route.canonical : route.path,
      redirected: route.title.startsWith('Redirecting to:'),
    }));
    crawl = await dynamicCrawl('http://127.0.0.1:4390', dynamicExpectations, crawl);
    assertDynamicCrawl(crawl, dynamicExpectations);
    const dynamicFailures = crawl.flatMap((entry) => [
      ...(entry.status === 200 ? [] : [`${String(entry.path)} status ${String(entry.status)}`]),
      ...['console_errors', 'page_errors', 'hydration_errors', 'axe_serious_or_critical', 'private_boundary_hits'].flatMap((key) => (entry[key] as unknown[]).map((value) => `${String(entry.path)} ${key}: ${String(value)}`)),
      ...((entry.overflow as { overflow: boolean }).overflow ? [`${String(entry.path)} overflow`] : []),
    ]);
    if (dynamicFailures.length > 0) throw new Error(`dynamic crawl failed:\n${dynamicFailures.join('\n')}`);
  } catch (error) { runError = error; }
  finally {
    await cleanupAll(); signalHandlers.complete();
  }
  await persistDrillReceipt(options.output, buildReceipt(signalHandlers.evidence()), runError);
  process.stdout.write(`${JSON.stringify({ routeCount: staticContract.route_count, dynamicRoutes: crawl.length, transitions: ['react', 'astro', 'react'], output: options.output })}\n`);
}

async function main(): Promise<void> {
  const options = parseDrillArguments(process.argv.slice(2));
  await runDrill(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
