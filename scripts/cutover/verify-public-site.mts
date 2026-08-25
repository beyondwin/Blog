import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import type { AstroBaseline } from '../../tools/parity/src/html-contract.ts';
import {
  assertCleanHostReceiptMaterialGroups,
  assertDynamicCrawl,
  assertLocalReceiptMaterialGroups,
  deriveChangedSurfacePerformance,
} from './evidence-contracts.mts';
import { hashFile, hashFiles, hashTree, readJson, sha256 } from './cutover-evidence.mts';
import { parseTask14Metrics, verifyStaticCutoverContract, type Task14Metric } from './verify-rollback.mts';

const execFileAsync = promisify(execFile);
const commitPattern = /^[a-f0-9]{40}$/u;
const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const reviewRoute = '/reviews/black-swan/';
const representativeRoutes = [
  '/', '/articles/why-i-read-in-the-ai-era/', reviewRoute,
  '/memory/agent-harnesses-are-operating-systems/', '/search/', '/tags/AI/', '/reviews/the-life-you-can-save/',
] as const;

export interface PublicSiteEvidence {
  schema_version: 2;
  implementation_commit: string;
  release: null | { release_id: string; active_pointer_hash: string; manifest_hash: string; artifact_hash: string };
  builds: null | { react_root: string; react_hash: string; astro_root: string; astro_hash: string; rollback_hash: string };
  route_parity: null | { receipt_path: string; receipt_hash: string; inventory_hash: string; route_count: number; failures: string[] };
  task14: null | {
    eligible: boolean;
    report_path: string;
    report_hash: string;
    performance_receipt_path: string;
    performance_receipt_hash: string;
    performance_commit: string;
    route_source_hashes: Record<string, string>;
    metric_summary: Task14Metric[];
  };
  local_proxy: null | { receipt_path: string; receipt_hash: string; transitions: ProxyTransition[]; processes_cleaned: boolean; ports_free_after: boolean };
  clean_host: null | { receipt_path: string; receipt_hash: string; eligible: boolean; implementation_commit: string; archive_hash: string; temp_removed: boolean };
  execution_log: Array<Record<string, unknown>>;
  production_host: string | null;
  production_cutover_authorized: boolean;
  production_cutover_at: string | null;
  rollback_drill_at: string | null;
  observation_started_at: string | null;
  observation_completed_at: string | null;
  observation_errors: unknown[] | null;
  astro_removal_ready: boolean;
}

export interface ProxyTransition {
  target: 'react' | 'astro';
  routes: Array<{ path: string; status: number; target_header: string; body_hash: string }>;
}

export interface VerifyOptions {
  mode: 'local' | 'astro-removal';
  authorizeProduction?: boolean;
  productionHost?: string;
  root?: string;
  now?: Date;
}

const task14RoutePaths: Record<string, string[]> = {
  '/': ['apps/site/app/routes/home.tsx', 'apps/site/src/ui/scene/SceneObject.tsx', 'apps/site/src/ui/scene/ScenePage.tsx', 'apps/site/src/ui/styles/route-scene.css'],
  '/articles/why-i-read-in-the-ai-era/': ['apps/site/app/routes/article.tsx', 'apps/site/src/ui/reading/ArticleReadingPage.tsx', 'apps/site/src/ui/styles/route-article.css'],
  [reviewRoute]: ['apps/site/app/routes/review.tsx', 'apps/site/src/ui/reading/ReviewReadingPage.tsx', 'apps/site/src/ui/styles/route-review.css'],
  '/memory/agent-harnesses-are-operating-systems/': ['apps/site/app/routes/memory.tsx', 'apps/site/src/ui/memory/MemoryDetailPage.tsx', 'apps/site/src/ui/styles/route-memory.css'],
};

function normalizedProductionHost(value: string | undefined | null): string {
  if (!value) throw new Error('Astro removal refused: exact --production-host is required');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Astro removal refused: production host must be one normalized exact HTTPS origin');
  return url.origin;
}

function exactIso(value: string | null, label: string, now: Date): number {
  if (!value || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`Astro removal refused: ${label} timestamp is invalid`);
  const time = Date.parse(value);
  if (time > now.getTime()) throw new Error(`Astro removal refused: ${label} timestamp is in the future`);
  return time;
}

export function assertProductionGate(evidence: PublicSiteEvidence, options: VerifyOptions): void {
  if (!evidence.production_cutover_authorized || !evidence.production_cutover_at || !evidence.rollback_drill_at
    || !evidence.observation_started_at || !evidence.observation_completed_at || !Array.isArray(evidence.observation_errors)
    || evidence.observation_errors.length > 0 || !evidence.astro_removal_ready) {
    throw new Error('Astro removal refused: production cutover, rollback, and observation evidence is incomplete');
  }
  if (!options.authorizeProduction) throw new Error('Astro removal refused: --authorize-production is required in addition to direct authorization');
  const host = normalizedProductionHost(options.productionHost);
  if (evidence.production_host !== host) throw new Error('Astro removal refused: production host binding is missing or mismatched');
  const now = options.now ?? new Date();
  const cutover = exactIso(evidence.production_cutover_at, 'cutover', now);
  const rollback = exactIso(evidence.rollback_drill_at, 'rollback', now);
  const observationStart = exactIso(evidence.observation_started_at, 'observation start', now);
  const observationComplete = exactIso(evidence.observation_completed_at, 'observation complete', now);
  if (!(cutover <= rollback && rollback <= observationStart && observationStart <= observationComplete)) throw new Error('Astro removal refused: production timestamps are not ordered');
  const expectedEvents = [
    ['direct_user_production_authorization', 'authorized_at', null], ['production_cutover', 'at', evidence.production_cutover_at],
    ['production_rollback_drill', 'at', evidence.rollback_drill_at], ['production_observation_started', 'at', evidence.observation_started_at],
    ['production_observation_completed', 'at', evidence.observation_completed_at],
  ] as const;
  for (const [eventKind, timeKey, expectedTime] of expectedEvents) {
    const matches = evidence.execution_log.filter((entry) => entry.schema_version === 1 && entry.event_kind === eventKind && entry.host === host && entry.release_id === evidence.release?.release_id);
    if (matches.length !== 1) throw new Error(`Astro removal refused: typed ${eventKind} event for exact host/release is missing or duplicated`);
    const event = matches[0]!;
    const eventTime = exactIso(typeof event[timeKey] === 'string' ? event[timeKey] : null, eventKind, now);
    if (expectedTime && event[timeKey] !== expectedTime) throw new Error(`Astro removal refused: ${eventKind} timestamp binding drifted`);
    if (eventKind === 'direct_user_production_authorization' && eventTime > cutover) throw new Error('Astro removal refused: direct authorization occurred after cutover');
    if (eventKind === 'production_observation_completed' && (!Array.isArray(event.blocking_errors) || event.blocking_errors.length > 0)) throw new Error('Astro removal refused: production observation has blocking errors');
  }
}

function exactKeys(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const object = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(object).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} contains missing or extra fields`);
  return object;
}

function safeRelativePath(path: string, label: string): string {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error(`${label} must be repository-relative`);
  return path;
}

function assertEvidenceShape(evidence: PublicSiteEvidence): void {
  exactKeys(evidence, [
    'schema_version', 'implementation_commit', 'release', 'builds', 'route_parity', 'task14', 'local_proxy', 'clean_host',
    'execution_log', 'production_host', 'production_cutover_authorized', 'production_cutover_at', 'rollback_drill_at',
    'observation_started_at', 'observation_completed_at', 'observation_errors', 'astro_removal_ready',
  ], 'public-site evidence');
  if (evidence.schema_version !== 2 || !commitPattern.test(evidence.implementation_commit)) throw new Error('public-site evidence schema/commit is invalid');
  if (!evidence.release || !evidence.builds || !evidence.route_parity || !evidence.task14 || !evidence.local_proxy || !evidence.clean_host) throw new Error('release/build/parity/Task14/proxy/clean-host evidence is missing');
  if (evidence.production_host !== null && evidence.production_host !== normalizedProductionHost(evidence.production_host)) throw new Error('production host is not normalized');
}

function outputPath(root: string, route: string): string {
  return route === '/' ? join(root, 'index.html') : join(root, decodeURIComponent(route.slice(1)), 'index.html');
}

async function verifyArchive(root: string, commit: string, receipt: Record<string, unknown>): Promise<void> {
  const tempRoot = await mkdtemp('/tmp/beyondwin-verify-archive.');
  const archive = join(tempRoot, 'source.tar');
  try {
    await execFileAsync('git', ['archive', '--format=tar', `--output=${archive}`, commit, '--', '.',
      ':(exclude)memory', ':(exclude)build', ':(exclude)output', ':(exclude).superpowers', ':(exclude).env', ':(exclude).env.*'], { cwd: root });
    const inventory = (await execFileAsync('tar', ['-tf', archive])).stdout.split('\n').filter(Boolean).sort();
    if (await hashFile(archive) !== receipt.archive_hash
      || JSON.stringify(inventory) !== JSON.stringify(receipt.archive_inventory)
      || receipt.archive_inventory_count !== inventory.length
      || receipt.archive_inventory_hash !== sha256(`${inventory.join('\n')}\n`)) throw new Error('clean-host archive/inventory does not independently recompute');
  } finally {
    if (!basename(tempRoot).startsWith('beyondwin-verify-archive.') || !await realpath(tempRoot).then((path) => path.endsWith(basename(tempRoot)))) throw new Error('archive verification temp root changed');
    await rm(tempRoot, { recursive: true });
  }
}

function verifyHistoricalProcesses(receipt: Record<string, unknown>): void {
  const worker = receipt.proxy_worker as Record<string, unknown>;
  if (worker.descendant_of_proxy !== true || worker.process_group_owned !== true || worker.stopped !== true || typeof worker.pid !== 'number' || typeof worker.root_pid !== 'number') throw new Error('proxy worker descendant/group/cleanup evidence is invalid');
  const lifecycle = receipt.port_lifecycle as Record<string, unknown>;
  const owners = lifecycle.owners_while_running as Array<Record<string, unknown>>;
  if (!Array.isArray(owners) || JSON.stringify(owners.map(({ port }) => port)) !== '[4390,4391,4392]'
    || owners.some(({ pids, owned_by_group }) => !Array.isArray(pids) || pids.length === 0 || owned_by_group !== true)) {
    throw new Error('historical port ownership evidence is invalid');
  }
}

export async function verifyPublicSiteEvidence(evidence: PublicSiteEvidence, options: VerifyOptions): Promise<{ mode: VerifyOptions['mode']; status: 'passed'; implementation_commit: string }> {
  if (options.mode === 'astro-removal') assertProductionGate(evidence, options);
  assertEvidenceShape(evidence);
  if (options.mode === 'local' && (evidence.production_host !== null || evidence.production_cutover_authorized !== false
    || evidence.production_cutover_at !== null || evidence.rollback_drill_at !== null || evidence.observation_started_at !== null
    || evidence.observation_completed_at !== null || evidence.observation_errors !== null || evidence.astro_removal_ready !== false)) {
    throw new Error('local evidence must keep every production/observation field false or null');
  }
  const root = resolve(options.root ?? process.cwd());
  const commit = (await execFileAsync('git', ['rev-parse', `${evidence.implementation_commit}^{commit}`], { cwd: root })).stdout.trim();
  if (commit !== evidence.implementation_commit) throw new Error('implementation commit is not exact');
  const active = await readActiveRelease(join(root, 'build/public-releases'));
  const release = evidence.release!;
  if (JSON.stringify(release) !== JSON.stringify({ release_id: active.manifest.releaseId, active_pointer_hash: active.activePointerHash, manifest_hash: active.manifestHash, artifact_hash: active.artifactHash })) throw new Error('active release no longer matches evidence');
  const builds = evidence.builds!;
  exactKeys(builds, ['react_root', 'react_hash', 'astro_root', 'astro_hash', 'rollback_hash'], 'build summary');
  if (!hashPattern.test(builds.react_hash) || builds.react_hash !== await hashTree(join(root, safeRelativePath(builds.react_root, 'React root')))
    || builds.astro_hash !== await hashTree(join(root, safeRelativePath(builds.astro_root, 'Astro root'))) || builds.rollback_hash !== builds.astro_hash) throw new Error('selected/Astro/rollback build hash drifted');
  const baselinePath = join(root, 'tests/fixtures/parity/astro-public-baseline.json');
  const baseline = await readJson<AstroBaseline>(baselinePath); const expectedRoutes = baseline.routes.map(({ path }) => path);
  const recomputedStatic = await verifyStaticCutoverContract({ root, reactRoot: join(root, builds.react_root), astroRoot: join(root, builds.astro_root), baselinePath });
  if (recomputedStatic.failures.length > 0) throw new Error('static cutover contract no longer passes');

  const task14 = evidence.task14!;
  exactKeys(task14, ['eligible', 'report_path', 'report_hash', 'performance_receipt_path', 'performance_receipt_hash', 'performance_commit', 'route_source_hashes', 'metric_summary'], 'Task 14 summary');
  const reportPath = join(root, safeRelativePath(task14.report_path, 'Task14 report')); const reportText = await readFile(reportPath, 'utf8');
  if (await hashFile(reportPath) !== task14.report_hash) throw new Error('Task 14 report changed');
  const reportMetrics = parseTask14Metrics(reportText);
  const routeHashes = Object.fromEntries(await Promise.all(Object.entries(task14RoutePaths).map(async ([route, paths]) => [route, await hashFiles(root, paths)])));
  if (JSON.stringify(routeHashes) !== JSON.stringify(task14.route_source_hashes)) throw new Error('Task 14 route source summary drifted');
  const performancePath = join(root, safeRelativePath(task14.performance_receipt_path, 'changed-surface receipt'));
  if (await hashFile(performancePath) !== task14.performance_receipt_hash) throw new Error('changed-surface receipt changed');
  if (!commitPattern.test(task14.performance_commit)) throw new Error('changed-surface performance commit is invalid');
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', task14.performance_commit, evidence.implementation_commit], { cwd: root });
  } catch {
    throw new Error('changed-surface performance commit is not an ancestor of implementation commit');
  }
  const performance = deriveChangedSurfacePerformance(await readJson(performancePath), {
    implementationCommit: task14.performance_commit, releaseId: active.manifest.releaseId, routeSourceHash: routeHashes[reviewRoute]!,
    measurementImplementationHash: await hashFiles(root, ['tools/parity/src/compare-contracts.ts', 'tools/parity/src/measure-browser.ts', 'tests/fixtures/parity/astro-renderer-baseline.json']),
    harnessHash: await hashFiles(root, ['tests/e2e/performance-selection.ts', 'tests/e2e/performance.spec.ts']),
    configHash: await hashFiles(root, ['package-lock.json', 'package.json', 'playwright.config.ts', 'tests/e2e/support.ts']),
    releaseManifestHash: await hashFiles(root, ['build/public-releases/active.json', `build/public-releases/${active.manifest.releaseId}/manifest.json`]),
  }, await readJson(join(root, 'tests/fixtures/parity/astro-renderer-baseline.json')));
  const derivedReportMetrics = reportMetrics.map((metric) => metric.route === reviewRoute
    ? { ...metric, ...performance.metrics.find(({ viewport }) => viewport === (metric.viewport === '1440×960' ? 'desktop' : 'mobile'))!, viewport: metric.viewport }
    : metric);
  if (!performance.eligible || !task14.eligible || JSON.stringify(task14.metric_summary) !== JSON.stringify(derivedReportMetrics)) throw new Error('Task 14 changed-surface evidence is not eligible or derived');

  const localSummary = evidence.local_proxy!; const localPath = join(root, safeRelativePath(localSummary.receipt_path, 'local receipt'));
  exactKeys(localSummary, ['receipt_path', 'receipt_hash', 'transitions', 'processes_cleaned', 'ports_free_after'], 'local proxy summary');
  if (await hashFile(localPath) !== localSummary.receipt_hash) throw new Error('local receipt hash changed');
  const local = await readJson<Record<string, unknown>>(localPath);
  assertLocalReceiptMaterialGroups(local, { implementationCommit: evidence.implementation_commit, representatives: representativeRoutes });
  verifyHistoricalProcesses(local);
  const dynamic = (local.dynamic_crawl as { routes: unknown[] }).routes;
  assertDynamicCrawl(dynamic, baseline.routes.map((route) => ({
    path: route.path,
    finalUrl: route.title.startsWith('Redirecting to:') ? route.canonical : route.path,
    redirected: route.title.startsWith('Redirecting to:'),
  })));
  for (const entry of dynamic as Array<Record<string, unknown>>) {
    const expected = baseline.routes.find(({ path }) => path === entry.path)!;
    const finalPath = expected.title.startsWith('Redirecting to:') ? expected.canonical : expected.path;
    if (entry.final_url !== finalPath || entry.redirected !== expected.title.startsWith('Redirecting to:')) throw new Error(`${String(entry.path)} dynamic redirect/final URL drifted`);
  }
  const transitions = local.transitions as ProxyTransition[];
  for (const transition of transitions) for (const route of transition.routes) {
    const outputRoot = transition.target === 'react' ? join(root, builds.react_root) : join(root, builds.astro_root);
    if (route.body_hash !== await hashFile(outputPath(outputRoot, route.path)) || route.status !== 200 || route.target_header !== transition.target) throw new Error(`${transition.target} transition body/status/header drifted at ${route.path}`);
  }
  const staticReceipt = local.static_contract as Record<string, unknown>;
  for (const key of ['route_count', 'inventory_hash', 'metadata_checked', 'redirects_checked', 'scoped_routes_checked', 'failures'] as const) if (JSON.stringify(staticReceipt[key]) !== JSON.stringify(recomputedStatic[key])) throw new Error(`local static ${key} summary drifted`);
  if (JSON.stringify(staticReceipt.release) !== JSON.stringify(release) || JSON.stringify(staticReceipt.builds) !== JSON.stringify(builds)) throw new Error('local release/build summary drifted');
  if (JSON.stringify(localSummary.transitions) !== JSON.stringify(transitions) || !localSummary.processes_cleaned || !localSummary.ports_free_after) throw new Error('local proxy summary is forged');
  const parity = evidence.route_parity!;
  exactKeys(parity, ['receipt_path', 'receipt_hash', 'inventory_hash', 'route_count', 'failures'], 'route parity summary');
  if (parity.receipt_path !== localSummary.receipt_path || parity.receipt_hash !== localSummary.receipt_hash || parity.inventory_hash !== recomputedStatic.inventory_hash || parity.route_count !== 80 || parity.failures.length > 0) throw new Error('route parity summary is forged');

  const cleanSummary = evidence.clean_host!; const cleanPath = join(root, safeRelativePath(cleanSummary.receipt_path, 'clean receipt'));
  exactKeys(cleanSummary, ['receipt_path', 'receipt_hash', 'eligible', 'implementation_commit', 'archive_hash', 'temp_removed'], 'clean-host summary');
  if (await hashFile(cleanPath) !== cleanSummary.receipt_hash) throw new Error('clean-host receipt hash changed');
  const clean = await readJson<Record<string, unknown>>(cleanPath);
  assertCleanHostReceiptMaterialGroups(clean, { implementationCommit: evidence.implementation_commit });
  await verifyArchive(root, evidence.implementation_commit, clean);
  const allowedKeys = ['CI', 'NODE_ENV', 'NO_COLOR', 'NPM_CONFIG_AUDIT', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_FUND', 'NPM_CONFIG_GLOBALCONFIG', 'NPM_CONFIG_UPDATE_NOTIFIER', 'NPM_CONFIG_USERCONFIG', 'PATH', 'TMPDIR', 'TZ', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME'].sort();
  const environment = clean.environment as Record<string, unknown>;
  if (JSON.stringify(environment.allowed_keys) !== JSON.stringify(allowedKeys)
    || environment.npm_userconfig_hash !== sha256('') || environment.npm_globalconfig_hash !== sha256('')
    || environment.config_inventory_hash !== sha256('5:npmrc:0:12:npmrc-global:0:')
    || environment.cache_inventory_hash_before !== sha256('')) throw new Error('clean-host explicit environment/config roots do not recompute');
  const expectedCommands = [
    ['git', 'archive'], ['tar', '-xf'], ['npm', 'ci'], ['npm', 'run', 'public-release:build'],
    ['npm', 'run', 'public-release:verify'], ['npm', 'run', 'site:build'],
  ];
  const commands = clean.commands as Array<Record<string, unknown>>;
  if (commands.length !== expectedCommands.length || commands.some((entry, index) => !(entry.argv as string[]).slice(0, expectedCommands[index]!.length).every((value, part) => value === expectedCommands[index]![part]))) throw new Error('clean-host command sequence drifted');
  if (JSON.stringify(clean.release) !== JSON.stringify(release) || clean.selected_build_hash !== builds.react_hash || clean.route_count !== 80 || clean.inventory_hash !== recomputedStatic.inventory_hash) throw new Error('clean-host release/build/inventory drifted');
  const smoke = clean.smoke as Array<{ path: string; status: number; body_hash: string }>;
  if (JSON.stringify(smoke.map(({ path }) => path)) !== JSON.stringify(expectedRoutes)) throw new Error('clean-host smoke exact route set drifted');
  for (const entry of smoke) if (entry.status !== 200 || entry.body_hash !== await hashFile(outputPath(join(root, builds.react_root), entry.path))) throw new Error(`clean-host smoke drifted at ${entry.path}`);
  if (!cleanSummary.eligible || cleanSummary.implementation_commit !== evidence.implementation_commit || cleanSummary.archive_hash !== clean.archive_hash || !cleanSummary.temp_removed) throw new Error('clean-host summary is forged');

  return { mode: options.mode, status: 'passed', implementation_commit: evidence.implementation_commit };
}

function parseCli(argv: readonly string[]): { mode: VerifyOptions['mode']; evidence: string; authorizeProduction: boolean; productionHost?: string } {
  const values = new Map<string, string>(); let authorizeProduction = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (key === '--authorize-production') { if (authorizeProduction) throw new Error('duplicate --authorize-production'); authorizeProduction = true; continue; }
    if (!['--mode', '--evidence', '--production-host'].includes(key)) throw new Error(`unknown argument: ${key}`);
    const value = argv[index + 1]; if (!value || value.startsWith('--')) throw new Error(`${key} requires one value`);
    if (values.has(key)) throw new Error(`duplicate ${key}`); values.set(key, value); index += 1;
  }
  const mode = values.get('--mode'); const evidence = values.get('--evidence');
  if ((mode !== 'local' && mode !== 'astro-removal') || !evidence) throw new Error('usage: --mode <local|astro-removal> --evidence <path> [--authorize-production --production-host <https-origin>]');
  return { mode, evidence, authorizeProduction, ...(values.get('--production-host') ? { productionHost: values.get('--production-host') } : {}) };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const result = await verifyPublicSiteEvidence(await readJson(resolve(cli.evidence)), { mode: cli.mode, authorizeProduction: cli.authorizeProduction, productionHost: cli.productionHost });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
