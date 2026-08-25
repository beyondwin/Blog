import { execFile, execFileSync } from 'node:child_process';
import { arch, platform, release as osRelease } from 'node:os';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import { buildHtmlContract, type AstroBaseline } from '../../tools/parity/src/html-contract.ts';
import { hashFile, hashFiles, hashTree, readJson, sha256 } from './cutover-evidence.mts';
import { checkExactDrillPorts, writeProxyTarget, type ProxyTarget } from './local-proxy.mts';
import type { ProxyTransition } from './verify-public-site.mts';

const execFileAsync = promisify(execFile);

export interface LocalCutoverReceipt {
  schema_version: 1;
  implementation_commit: string;
  created_at: string;
  finalized_at: string | null;
  environment: {
    node: string;
    npm: string;
    os: string;
    playwright: string;
    chromium: string;
  };
  release: {
    release_id: string;
    active_pointer_hash: string;
    manifest_hash: string;
    artifact_hash: string;
  };
  builds: {
    react_root: string;
    react_hash: string;
    astro_root: string;
    astro_hash: string;
    rollback_hash: string;
  };
  route_count: number;
  inventory_hash: string;
  metadata_checked: number;
  redirects_checked: number;
  scoped_routes_checked: number;
  failures: string[];
  task14: {
    eligible: boolean;
    report_path: string;
    report_hash: string;
    route_source_hashes: Record<string, string>;
    metric_summary: Task14Metric[];
  };
  ports: { proxy: 4390; react: 4391; astro: 4392 };
  transitions: ProxyTransition[];
  processes: Array<{ role: 'react' | 'astro' | 'proxy'; pid: number; command: string; stopped: boolean }>;
  commands: string[];
  processes_cleaned: boolean;
  ports_free_after: boolean;
}

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

function parseTask14Metrics(report: string): Task14Metric[] {
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

async function processCommand(pid: number): Promise<string> {
  const result = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
  const command = result.stdout.trim();
  if (!command) throw new Error(`created process ${pid} is not running`);
  return command;
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

function parseProcess(value: string): { role: 'react' | 'astro' | 'proxy'; pid: number } {
  const match = value.match(/^(react|astro|proxy):([1-9][0-9]*)$/u);
  if (!match) throw new Error('--process requires role:pid');
  return { role: match[1] as 'react' | 'astro' | 'proxy', pid: Number(match[2]) };
}

interface DrillArguments {
  implementationCommit: string;
  reactRoot: string;
  astroRoot: string;
  baselinePath: string;
  statePath: string;
  proxyBase: string;
  output: string;
  processes: Array<{ role: 'react' | 'astro' | 'proxy'; pid: number }>;
}

function parseDrillArguments(argv: readonly string[]): DrillArguments | { finalize: string } {
  if (argv[0] === '--finalize') {
    if (argv.length !== 2) throw new Error('usage: --finalize <receipt>');
    return { finalize: resolve(argv[1]!) };
  }
  const values = new Map<string, string>();
  const processes: DrillArguments['processes'] = [];
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !value) throw new Error('cutover drill arguments require key/value pairs');
    if (key === '--process') {
      processes.push(parseProcess(value));
      continue;
    }
    if (!['--implementation-commit', '--react-root', '--astro-root', '--baseline', '--state', '--proxy', '--output'].includes(key)) {
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
  if (processes.length !== 3 || new Set(processes.map(({ role }) => role)).size !== 3) {
    throw new Error('exactly one react, astro, and proxy process is required');
  }
  const proxyBase = required('--proxy');
  if (proxyBase !== 'http://127.0.0.1:4390') throw new Error('proxy base must be exact local drill origin');
  return {
    implementationCommit: required('--implementation-commit'),
    reactRoot: resolve(required('--react-root')),
    astroRoot: resolve(required('--astro-root')),
    baselinePath: resolve(required('--baseline')),
    statePath: resolve(required('--state')),
    proxyBase,
    output: resolve(required('--output')),
    processes,
  };
}

async function finalizeReceipt(path: string): Promise<void> {
  const receipt = await readJson<LocalCutoverReceipt>(path);
  for (const processEntry of receipt.processes) {
    try {
      process.kill(processEntry.pid, 0);
      throw new Error(`created process ${processEntry.pid} is still running`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    processEntry.stopped = true;
  }
  await checkExactDrillPorts();
  receipt.processes_cleaned = true;
  receipt.ports_free_after = true;
  receipt.finalized_at = new Date().toISOString();
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ finalized: true, pids: receipt.processes.map(({ pid }) => pid), ports: 'free' })}\n`);
}

async function runDrill(options: DrillArguments): Promise<void> {
  const root = process.cwd();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== options.implementationCommit) throw new Error('drill must run from the exact implementation commit');
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (status) throw new Error(`drill requires a clean tracked worktree:\n${status}`);
  const processEvidence = await Promise.all(options.processes.map(async ({ role, pid }) => ({
    role,
    pid,
    command: await processCommand(pid),
    stopped: false,
  })));
  const expectedCommands = {
    react: 'site:preview',
    astro: 'legacy:preview',
    proxy: 'cutover:proxy',
  } as const;
  for (const entry of processEvidence) {
    if (!entry.command.includes(expectedCommands[entry.role])) {
      throw new Error(`${entry.role} PID ${entry.pid} command does not match the created drill process`);
    }
  }

  const staticContract = await verifyStaticCutoverContract({
    root,
    reactRoot: options.reactRoot,
    astroRoot: options.astroRoot,
    baselinePath: options.baselinePath,
  });
  if (staticContract.failures.length > 0) throw new Error(`static cutover contract failed:\n${staticContract.failures.join('\n')}`);
  const transitions: ProxyTransition[] = [];
  for (const target of ['react', 'astro', 'react'] as const) {
    await writeProxyTarget(options.statePath, target);
    transitions.push(await smokeTransition(options.proxyBase, target));
  }

  const active = await readActiveRelease(join(root, 'build/public-releases'));
  const packageLock = await readJson<{ packages: Record<string, { version?: string }>; }>(join(root, 'package-lock.json'));
  const browsers = await readJson<{ browsers: Array<{ name: string; browserVersion: string }>; }>(join(root, 'node_modules/playwright-core/browsers.json'));
  const task14Path = join(root, '.superpowers/sdd/public-reading-continuity-implementation-plan/task-14-report.md');
  const task14Report = await readFile(task14Path, 'utf8');
  const routeSourceHashes = Object.fromEntries(await Promise.all(
    Object.entries(task14RoutePaths).map(async ([route, paths]) => [route, await hashFiles(root, paths)]),
  ));
  const receipt: LocalCutoverReceipt = {
    schema_version: 1,
    implementation_commit: head,
    created_at: new Date().toISOString(),
    finalized_at: null,
    environment: {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      os: `${platform()} ${osRelease()} ${arch()}`,
      playwright: packageLock.packages['node_modules/@playwright/test']?.version ?? 'unknown',
      chromium: browsers.browsers.find(({ name }) => name === 'chromium')?.browserVersion ?? 'unknown',
    },
    release: {
      release_id: active.manifest.releaseId,
      active_pointer_hash: active.activePointerHash,
      manifest_hash: active.manifestHash,
      artifact_hash: active.artifactHash,
    },
    builds: {
      react_root: 'apps/site/build/client',
      react_hash: await hashTree(options.reactRoot),
      astro_root: 'dist',
      astro_hash: await hashTree(options.astroRoot),
      rollback_hash: await hashTree(options.astroRoot),
    },
    ...staticContract,
    task14: {
      eligible: !task14Report.includes('Task 15 changed-surface status: **BLOCKED**'),
      report_path: '.superpowers/sdd/public-reading-continuity-implementation-plan/task-14-report.md',
      report_hash: await hashFile(task14Path),
      route_source_hashes: routeSourceHashes,
      metric_summary: parseTask14Metrics(task14Report),
    },
    ports: { proxy: 4390, react: 4391, astro: 4392 },
    transitions,
    processes: processEvidence,
    commands: [
      'npm run cutover:proxy -- --check --listen 127.0.0.1:4390 --react http://127.0.0.1:4391 --astro http://127.0.0.1:4392 --state <validated-temp>/target',
      'npm run site:preview -- --host 127.0.0.1 --port 4391',
      'npm run legacy:preview -- --host 127.0.0.1 --port 4392',
      'npm run cutover:proxy -- --listen 127.0.0.1:4390 --react http://127.0.0.1:4391 --astro http://127.0.0.1:4392 --state <validated-temp>/target --pid-file <validated-temp>/proxy.pid',
    ],
    processes_cleaned: false,
    ports_free_after: false,
  };
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ routeCount: receipt.route_count, transitions: ['react', 'astro', 'react'], output: options.output })}\n`);
}

async function main(): Promise<void> {
  const options = parseDrillArguments(process.argv.slice(2));
  if ('finalize' in options) await finalizeReceipt(options.finalize);
  else await runDrill(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
