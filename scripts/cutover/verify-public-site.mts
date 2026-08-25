import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import { hashFile, hashFiles, hashTree, readJson } from './cutover-evidence.mts';
import { verifyStaticCutoverContract, type Task14Metric } from './verify-rollback.mts';

const execFileAsync = promisify(execFile);
const commitPattern = /^[a-f0-9]{40}$/u;
const hashPattern = /^sha256:[a-f0-9]{64}$/u;

export interface PublicSiteEvidence {
  schema_version: 1;
  implementation_commit: string;
  release: null | {
    release_id: string;
    active_pointer_hash: string;
    manifest_hash: string;
    artifact_hash: string;
  };
  builds: null | {
    react_root: string;
    react_hash: string;
    astro_root: string;
    astro_hash: string;
    rollback_hash: string;
  };
  route_parity: null | {
    receipt_path: string;
    receipt_hash: string;
    inventory_hash: string;
    route_count: number;
    failures: string[];
  };
  task14: null | {
    eligible: boolean;
    report_path: string;
    report_hash: string;
    route_source_hashes: Record<string, string>;
    metric_summary: Task14Metric[];
  };
  local_proxy: null | {
    receipt_path: string;
    receipt_hash: string;
    transitions: ProxyTransition[];
    processes_cleaned: boolean;
    ports_free_after: boolean;
  };
  clean_host: null | {
    receipt_path: string;
    receipt_hash: string;
    eligible: boolean;
    implementation_commit: string;
    archive_hash: string;
    temp_removed: boolean;
  };
  execution_log: Array<Record<string, unknown>>;
  production_cutover_authorized: false | true;
  production_cutover_at: string | null;
  rollback_drill_at: string | null;
  observation_started_at: string | null;
  observation_completed_at: string | null;
  observation_errors: unknown[] | null;
  astro_removal_ready: false | true;
}

export interface ProxyTransition {
  target: 'react' | 'astro';
  routes: Array<{ path: string; status: number; target_header: string; body_hash: string }>;
}

interface VerifyOptions {
  mode: 'local' | 'astro-removal';
  authorizeProduction?: boolean;
  root?: string;
}

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

function directAuthorizationPresent(evidence: PublicSiteEvidence): boolean {
  return evidence.execution_log.some((entry) => (
    entry.type === 'direct-production-authorization'
      && typeof entry.host === 'string'
      && entry.host.length > 0
      && entry.release_id === evidence.release?.release_id
      && typeof entry.user_text === 'string'
      && entry.user_text.length > 0
  ));
}

function assertProductionGate(evidence: PublicSiteEvidence, options: VerifyOptions): void {
  if (!evidence.production_cutover_authorized
    || !evidence.production_cutover_at
    || !evidence.rollback_drill_at
    || !evidence.observation_started_at
    || !evidence.observation_completed_at
    || !Array.isArray(evidence.observation_errors)
    || evidence.observation_errors.length > 0
    || !evidence.astro_removal_ready) {
    throw new Error('Astro removal refused: production cutover, rollback, and observation evidence is incomplete');
  }
  if (!options.authorizeProduction) {
    throw new Error('Astro removal refused: --authorize-production is required in addition to direct authorization');
  }
  if (!directAuthorizationPresent(evidence)) {
    throw new Error('Astro removal refused: direct authorization record for the exact host and release is missing');
  }
}

function assertEvidenceShape(evidence: PublicSiteEvidence): void {
  if (evidence.schema_version !== 1) throw new Error('unsupported public-site evidence schema');
  if (!commitPattern.test(evidence.implementation_commit)) throw new Error('implementation commit is missing or invalid');
  if (!evidence.release) throw new Error('release evidence is missing');
  if (!evidence.builds) throw new Error('selected, Astro, and rollback build evidence is missing');
  if (!evidence.route_parity) throw new Error('route parity evidence is missing');
  if (!evidence.task14) throw new Error('Task 14 eligible evidence is missing');
  if (!evidence.local_proxy) throw new Error('local proxy evidence is missing');
  if (!evidence.clean_host) throw new Error('clean-host evidence is missing');
}

function safeRelativePath(path: string, label: string): string {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return path;
}

export async function verifyPublicSiteEvidence(
  evidence: PublicSiteEvidence,
  options: VerifyOptions,
): Promise<{ mode: VerifyOptions['mode']; status: 'passed'; implementation_commit: string }> {
  if (options.mode === 'astro-removal') assertProductionGate(evidence, options);
  assertEvidenceShape(evidence);
  const root = resolve(options.root ?? process.cwd());
  const commit = (await execFileAsync('git', ['rev-parse', `${evidence.implementation_commit}^{commit}`], { cwd: root }))
    .stdout.trim();
  if (commit !== evidence.implementation_commit) throw new Error('implementation commit is not exact');

  const active = await readActiveRelease(join(root, 'build/public-releases'));
  if (evidence.release!.release_id !== active.manifest.releaseId
    || evidence.release!.active_pointer_hash !== active.activePointerHash
    || evidence.release!.manifest_hash !== active.manifestHash
    || evidence.release!.artifact_hash !== active.artifactHash) {
    throw new Error('active public release no longer matches evidence');
  }

  const builds = evidence.builds!;
  if (!hashPattern.test(builds.react_hash)
    || builds.react_hash !== await hashTree(join(root, safeRelativePath(builds.react_root, 'React build root')))
    || builds.astro_hash !== await hashTree(join(root, safeRelativePath(builds.astro_root, 'Astro build root')))
    || builds.rollback_hash !== builds.astro_hash) {
    throw new Error('selected, Astro, or rollback build hash no longer matches');
  }

  const parity = evidence.route_parity!;
  const parityPath = join(root, safeRelativePath(parity.receipt_path, 'route parity receipt'));
  if (await hashFile(parityPath) !== parity.receipt_hash || parity.route_count !== 80 || parity.failures.length > 0) {
    throw new Error('route parity receipt is missing, changed, incomplete, or failing');
  }
  const parityReceipt = await readJson<Record<string, unknown>>(parityPath);
  if (parityReceipt.implementation_commit !== evidence.implementation_commit
    || parityReceipt.inventory_hash !== parity.inventory_hash
    || parityReceipt.route_count !== 80
    || JSON.stringify(parityReceipt.failures) !== '[]') {
    throw new Error('route parity summary does not recompute from its receipt');
  }
  const recomputedParity = await verifyStaticCutoverContract({
    root,
    reactRoot: join(root, builds.react_root),
    astroRoot: join(root, builds.astro_root),
    baselinePath: join(root, 'tests/fixtures/parity/astro-public-baseline.json'),
  });
  if (recomputedParity.route_count !== parity.route_count
    || recomputedParity.inventory_hash !== parity.inventory_hash
    || recomputedParity.failures.length > 0) {
    throw new Error('route parity no longer recomputes from current selected and rollback outputs');
  }

  const task14 = evidence.task14!;
  const task14Path = join(root, safeRelativePath(task14.report_path, 'Task 14 report'));
  if (await hashFile(task14Path) !== task14.report_hash) throw new Error('Task 14 report changed');
  const task14Text = await readFile(task14Path, 'utf8');
  if (!task14Text.includes('Status: **PASS') || !task14Text.includes('Mandatory issues') || !task14Text.includes('0 errors, warnings, or hints')) {
    throw new Error('Task 14 report is not eligible');
  }
  if (!task14.eligible || task14Text.includes('Task 15 changed-surface status: **BLOCKED**')) {
    throw new Error('Task 14 changed-surface evidence is not eligible');
  }
  if (task14.metric_summary.length !== 8
    || task14.metric_summary.some(({ mandatory_issues }) => mandatory_issues !== 0)) {
    throw new Error('Task 14 metric summary is incomplete or failing');
  }
  for (const [route, paths] of Object.entries(task14RoutePaths)) {
    const current = await hashFiles(root, paths);
    if (task14.route_source_hashes[route] !== current || !task14Text.includes(current)) {
      throw new Error(`Task 14 source hash changed for ${route}`);
    }
  }

  const proxy = evidence.local_proxy!;
  const proxyPath = join(root, safeRelativePath(proxy.receipt_path, 'local proxy receipt'));
  const proxyReceipt = await readJson<{ transitions?: ProxyTransition[]; processes_cleaned?: boolean; ports_free_after?: boolean }>(proxyPath);
  if (await hashFile(proxyPath) !== proxy.receipt_hash
    || JSON.stringify(proxy.transitions.map(({ target }) => target)) !== JSON.stringify(['react', 'astro', 'react'])
    || JSON.stringify(proxyReceipt.transitions) !== JSON.stringify(proxy.transitions)
    || proxyReceipt.processes_cleaned !== true
    || proxyReceipt.ports_free_after !== true
    || !proxy.processes_cleaned
    || !proxy.ports_free_after) {
    throw new Error('safe local proxy lifecycle evidence is missing or changed');
  }

  const clean = evidence.clean_host!;
  const cleanPath = join(root, safeRelativePath(clean.receipt_path, 'clean-host receipt'));
  const cleanReceipt = await readJson<Record<string, unknown>>(cleanPath);
  if (await hashFile(cleanPath) !== clean.receipt_hash
    || !clean.eligible
    || clean.implementation_commit !== evidence.implementation_commit
    || cleanReceipt.implementation_commit !== evidence.implementation_commit
    || cleanReceipt.archive_hash !== clean.archive_hash
    || cleanReceipt.eligible !== true
    || cleanReceipt.temp_removed !== true
    || !clean.temp_removed) {
    throw new Error('eligible clean-host receipt is missing or changed');
  }

  return { mode: options.mode, status: 'passed', implementation_commit: evidence.implementation_commit };
}

interface CliArguments {
  mode: VerifyOptions['mode'];
  evidence: string;
  authorizeProduction: boolean;
}

function parseCli(argv: readonly string[]): CliArguments {
  let mode: VerifyOptions['mode'] | undefined;
  let evidence: string | undefined;
  let authorizeProduction = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--authorize-production') {
      if (authorizeProduction) throw new Error('duplicate --authorize-production');
      authorizeProduction = true;
      continue;
    }
    if (key !== '--mode' && key !== '--evidence') throw new Error(`unknown argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires one value`);
    if (key === '--mode') {
      if (mode) throw new Error('duplicate --mode');
      if (value !== 'local' && value !== 'astro-removal') throw new Error('invalid --mode');
      mode = value;
    } else {
      if (evidence) throw new Error('duplicate --evidence');
      evidence = value;
    }
    index += 1;
  }
  if (!mode || !evidence) throw new Error('usage: --mode <local|astro-removal> --evidence <path> [--authorize-production]');
  return { mode, evidence, authorizeProduction };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const evidence = await readJson<PublicSiteEvidence>(resolve(cli.evidence));
  const result = await verifyPublicSiteEvidence(evidence, {
    mode: cli.mode,
    authorizeProduction: cli.authorizeProduction,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
