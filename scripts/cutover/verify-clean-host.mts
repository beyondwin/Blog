import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import type { AstroBaseline } from '../../tools/parity/src/html-contract.ts';
import { hashFile, hashTree, readJson, sha256 } from './cutover-evidence.mts';
import { npmObservedCommandLine } from './evidence-contracts.mts';
import {
  completeOwnedProcess,
  installOwnedSignalHandlers,
  observeOwnedGroup,
  registerOwnedProcess,
  stabilizeOwnedProcess,
  terminateOwnedProcess,
  type OwnedProcessEvidence,
  type ProcessSnapshot,
  type SignalTarget,
} from './owned-process-lifecycle.mts';

const execFileAsync = promisify(execFile);

type CommandEvidence = OwnedProcessEvidence & {
  phase: 'install' | 'build';
  environment_keys: string[];
};

interface CleanHostReceipt {
  schema_version: 2;
  implementation_commit: string;
  created_at: string;
  completed_at: string;
  eligible: boolean;
  archive_hash: string;
  archive_inventory_hash: string;
  archive_inventory_count: number;
  archive_inventory: string[];
  exclusions: { dependencies: true; generated_output: true; secrets_and_environment: true; top_level_private_memory: true };
  controller: Record<string, unknown>;
  environment: { allowed_keys: string[]; npm_userconfig_hash: string; npm_globalconfig_hash: string; config_inventory_hash: string; cache_inventory_hash_before: string };
  commands: CommandEvidence[];
  release: null | { release_id: string; active_pointer_hash: string; manifest_hash: string; artifact_hash: string };
  selected_build_hash: string | null;
  route_count: number;
  inventory_hash: string;
  smoke: Array<{ path: string; status: number; body_hash: string }>;
  temp_root: { pattern: '/tmp/beyondwin-clean-host.*'; path: string; realpath: string; realpath_validated: boolean; removed: boolean; preview_port: number | null };
  errors: string[];
}

const STANDARD_PATH = '/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';

export function cleanHostCommandEnvironment(
  _input: NodeJS.ProcessEnv = process.env,
  options: { tempRoot: string; phase: 'install' | 'build' } = { tempRoot: '/tmp/beyondwin-clean-host.invalid', phase: 'install' },
): NodeJS.ProcessEnv {
  return {
    PATH: STANDARD_PATH,
    CI: '1',
    NO_COLOR: '1',
    TZ: 'UTC',
    TMPDIR: join(options.tempRoot, 'tmp'),
    XDG_CACHE_HOME: join(options.tempRoot, 'cache/xdg'),
    XDG_CONFIG_HOME: join(options.tempRoot, 'config/xdg'),
    NPM_CONFIG_CACHE: join(options.tempRoot, 'cache/npm'),
    NPM_CONFIG_USERCONFIG: join(options.tempRoot, 'config/npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(options.tempRoot, 'config/npmrc-global'),
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    ...(options.phase === 'build' ? { NODE_ENV: 'production' } : {}),
  };
}

function parseArguments(argv: readonly string[]): { commit: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if ((key !== '--commit' && key !== '--output') || !value || value.startsWith('--')) throw new Error('usage: --commit <immutable-sha> --output <receipt>');
    if (values.has(key)) throw new Error(`duplicate argument: ${key}`);
    values.set(key, value);
  }
  const commit = values.get('--commit'); const output = values.get('--output');
  if (!commit || !/^[a-f0-9]{40}$/u.test(commit) || !output) throw new Error('usage: --commit <immutable-sha> --output <receipt>');
  return { commit, output: resolve(output) };
}

interface RuntimeCommand { evidence: CommandEvidence; child: ChildProcess; exit: Promise<{ exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null }> }

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
    return start?.stdout.trim() ? { ...identity, start_identity: start.stdout.trim() } : null;
  }));
  return snapshots.filter((snapshot): snapshot is ProcessSnapshot => snapshot !== null).sort((left, right) => left.pid - right.pid);
}

function expectedObservedCommand(argv: readonly string[]): string {
  return argv[0] === 'npm' ? npmObservedCommandLine(argv) : argv.join(' ');
}

async function stopRuntime(runtime: RuntimeCommand): Promise<void> {
  await terminateOwnedProcess(runtime.evidence, {
    snapshot: processSnapshot,
    groupMembers: processGroupSnapshots,
    signalGroup: (pgid, signal) => process.kill(-pgid, signal),
    waitForRootExit: () => Promise.race([
      runtime.exit,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`owned ${runtime.evidence.role} root did not exit after TERM`)), 15_000)),
    ]),
  });
}

async function runCommand(
  argv: readonly string[], cwd: string, tempRoot: string, phase: 'install' | 'build', records: CommandEvidence[], runtimes: RuntimeCommand[],
): Promise<void> {
  const environment = cleanHostCommandEnvironment(process.env, { tempRoot, phase });
  const startedAt = new Date().toISOString();
  const child = spawn(argv[0]!, argv.slice(1), { cwd, env: environment, stdio: 'inherit', shell: false, detached: true });
  if (!child.pid) throw new Error(`failed to create command: ${argv.join(' ')}`);
  const base = registerOwnedProcess(records, { role: `${phase}:${argv[0]}`, argv, rootPid: child.pid, controllerPid: process.pid, startedAt }) as CommandEvidence;
  base.phase = phase; base.environment_keys = Object.keys(environment).sort();
  const exit = new Promise<{ exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolveExit({ exited_at: new Date().toISOString(), exit_code: exitCode, signal }));
  });
  const runtime = { evidence: base, child, exit }; runtimes.push(runtime);
  await stabilizeOwnedProcess(base, () => processSnapshot(child.pid!), expectedObservedCommand(argv));
  observeOwnedGroup(base, await processGroupSnapshots(base.root_pgid));
  const result = await exit;
  await completeOwnedProcess(base, result, { groupMembers: processGroupSnapshots });
  if (result.exit_code !== 0) throw new Error(`${argv.join(' ')} failed with ${result.signal ?? `exit ${String(result.exit_code)}`}`);
}

export function archiveInventoryRejected(path: string): boolean {
  const normalized = path.replace(/\/$/u, '');
  return normalized === 'memory' || normalized.startsWith('memory/') || normalized.split('/').includes('node_modules')
    || normalized === 'build' || normalized.startsWith('build/') || normalized === 'output' || normalized.startsWith('output/')
    || normalized === '.superpowers' || normalized.startsWith('.superpowers/')
    || normalized.split('/').some((part) => part === '.env' || part.startsWith('.env.'));
}

async function assertCleanHostRoot(path: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error('clean-host temp root must be one real directory');
  if (typeof process.getuid === 'function' && state.uid !== process.getuid()) throw new Error('clean-host temp root must be owned by the current user');
  const expected = join(await realpath('/tmp'), basename(path));
  if (!/^beyondwin-clean-host\.[A-Za-z0-9_-]+$/u.test(basename(path)) || await realpath(path) !== expected) throw new Error('clean-host temp root is outside /tmp/beyondwin-clean-host.*');
}

function mimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (/\.jpe?g$/u.test(path)) return 'image/jpeg';
  return 'application/octet-stream';
}

async function startStaticServer(root: string): Promise<{ server: Server; port: number }> {
  const server = createServer(async (request, response) => {
    try {
      const decoded = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      if (decoded.includes('\0') || decoded.split('/').includes('..')) throw new Error('unsafe request path');
      const path = join(root, decoded.endsWith('/') ? `${decoded.slice(1)}index.html` : decoded.slice(1));
      const state = await lstat(path);
      if (state.isSymbolicLink() || !state.isFile()) throw new Error('not a regular file');
      response.writeHead(200, { 'content-type': mimeType(path) }); response.end(await readFile(path));
    } catch { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('not found\n'); }
  });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('clean-host preview did not bind a TCP port');
  return { server, port: address.port };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

async function main(): Promise<void> {
  const cli = parseArguments(process.argv.slice(2));
  if (process.version.split('.')[0] !== 'v24') throw new Error(`clean-host proof requires Node 24, got ${process.version}`);
  const root = process.cwd();
  const exactCommit = execFileSync('git', ['rev-parse', `${cli.commit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (exactCommit !== cli.commit || head !== cli.commit) throw new Error('clean-host proof requires the exact immutable HEAD commit');
  const dirty = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (dirty) throw new Error(`clean-host proof requires a clean tracked worktree:\n${dirty}`);

  const tempRoot = await mkdtemp('/tmp/beyondwin-clean-host.'); await assertCleanHostRoot(tempRoot);
  const archivePath = join(tempRoot, 'source.tar'); const extractedRoot = join(tempRoot, 'repository');
  const configRoot = join(tempRoot, 'config'); const cacheRoot = join(tempRoot, 'cache');
  await Promise.all([
    mkdir(join(tempRoot, 'tmp'), { recursive: true }), mkdir(join(configRoot, 'xdg'), { recursive: true }),
    mkdir(join(cacheRoot, 'xdg'), { recursive: true }), mkdir(join(cacheRoot, 'npm'), { recursive: true }),
  ]);
  await writeFile(join(configRoot, 'npmrc'), '', { mode: 0o600 });
  await writeFile(join(configRoot, 'npmrc-global'), '', { mode: 0o600 });
  const installEnvironment = cleanHostCommandEnvironment(process.env, { tempRoot, phase: 'install' });
  const buildEnvironment = cleanHostCommandEnvironment(process.env, { tempRoot, phase: 'build' });
  const commands: CommandEvidence[] = []; const runtimes: RuntimeCommand[] = []; let server: Server | undefined;
  const controllerObserved = await processSnapshot(process.pid);
  const controller = {
    pid: process.pid, ppid: process.ppid, pgid: controllerObserved.pgid, argv: [...process.argv],
    start_identity: controllerObserved.start_identity, observed: controllerObserved,
  };
  let cleanupPromise: Promise<void> | null = null;
  const cleanupProcesses = async (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      let cleanupError: unknown;
      for (const runtime of [...runtimes].reverse()) if (!runtime.evidence.stopped) {
        try {
          if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) {
            await completeOwnedProcess(runtime.evidence, await runtime.exit, { groupMembers: processGroupSnapshots });
          } else await stopRuntime(runtime);
        } catch (error) { cleanupError ??= error; }
      }
      if (cleanupError) throw cleanupError;
    })();
    return cleanupPromise;
  };
  const signalHandlers = installOwnedSignalHandlers(process as unknown as SignalTarget, async () => {
    await cleanupProcesses();
    if (server) { await closeServer(server); server = undefined; }
    await assertCleanHostRoot(tempRoot); await rm(tempRoot, { recursive: true });
  }, (code) => process.exit(code));
  const receipt: CleanHostReceipt = {
    schema_version: 2, implementation_commit: cli.commit, created_at: new Date().toISOString(), completed_at: '', eligible: false,
    archive_hash: '', archive_inventory_hash: '', archive_inventory_count: 0, archive_inventory: [],
    exclusions: { dependencies: true, generated_output: true, secrets_and_environment: true, top_level_private_memory: true },
    controller: { ...controller, signal_handlers: signalHandlers.evidence() },
    environment: {
      allowed_keys: [...new Set([...Object.keys(installEnvironment), ...Object.keys(buildEnvironment)])].sort(),
      npm_userconfig_hash: await hashFile(join(configRoot, 'npmrc')),
      npm_globalconfig_hash: await hashFile(join(configRoot, 'npmrc-global')),
      config_inventory_hash: await hashTree(configRoot), cache_inventory_hash_before: await hashTree(cacheRoot),
    },
    commands, release: null, selected_build_hash: null, route_count: 0, inventory_hash: '', smoke: [],
    temp_root: { pattern: '/tmp/beyondwin-clean-host.*', path: tempRoot, realpath: await realpath(tempRoot), realpath_validated: true, removed: false, preview_port: null }, errors: [],
  };
  try {
    await runCommand(['git', 'archive', '--format=tar', `--output=${archivePath}`, cli.commit, '--', '.',
      ':(exclude)memory', ':(exclude)build', ':(exclude)output', ':(exclude).superpowers', ':(exclude).env', ':(exclude).env.*'], root, tempRoot, 'install', commands, runtimes);
    receipt.archive_hash = await hashFile(archivePath);
    receipt.archive_inventory = execFileSync('tar', ['-tf', archivePath], { encoding: 'utf8', env: installEnvironment }).split('\n').filter(Boolean).sort();
    const rejected = receipt.archive_inventory.filter(archiveInventoryRejected);
    if (rejected.length > 0) throw new Error(`clean-host archive contains excluded paths: ${rejected.join(', ')}`);
    receipt.archive_inventory_count = receipt.archive_inventory.length;
    receipt.archive_inventory_hash = sha256(`${receipt.archive_inventory.join('\n')}\n`);
    await mkdir(extractedRoot);
    await runCommand(['tar', '-xf', archivePath, '-C', extractedRoot], root, tempRoot, 'install', commands, runtimes);
    await runCommand(['npm', 'ci'], extractedRoot, tempRoot, 'install', commands, runtimes);
    await runCommand(['npm', 'run', 'public-release:build'], extractedRoot, tempRoot, 'build', commands, runtimes);
    await runCommand(['npm', 'run', 'public-release:verify'], extractedRoot, tempRoot, 'build', commands, runtimes);
    await runCommand(['npm', 'run', 'site:build'], extractedRoot, tempRoot, 'build', commands, runtimes);
    const active = await readActiveRelease(join(extractedRoot, 'build/public-releases'));
    receipt.release = { release_id: active.manifest.releaseId, active_pointer_hash: active.activePointerHash, manifest_hash: active.manifestHash, artifact_hash: active.artifactHash };
    const clientRoot = join(extractedRoot, 'apps/site/build/client'); receipt.selected_build_hash = await hashTree(clientRoot);
    const baseline = await readJson<AstroBaseline>(join(extractedRoot, 'tests/fixtures/parity/astro-public-baseline.json'));
    const routes = baseline.routes.map(({ path }) => path); receipt.route_count = routes.length;
    receipt.inventory_hash = sha256(`${[...routes].sort().join('\n')}\n`);
    const preview = await startStaticServer(clientRoot); server = preview.server; receipt.temp_root.preview_port = preview.port;
    for (const route of routes) {
      const response = await fetch(`http://127.0.0.1:${preview.port}${route}`, { redirect: 'manual' });
      const body = Buffer.from(await response.arrayBuffer());
      if (response.status !== 200 || body.length === 0) throw new Error(`clean-host HTTP smoke failed for ${route}`);
      receipt.smoke.push({ path: route, status: response.status, body_hash: sha256(body) });
    }
    await closeServer(server); server = undefined; receipt.eligible = routes.length === 80 && receipt.smoke.length === 80;
  } catch (error) { receipt.errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); }
  finally {
    if (server) try { await closeServer(server); } catch (error) { receipt.errors.push(`server cleanup: ${String(error)}`); }
    try { await cleanupProcesses(); signalHandlers.complete(); } catch (error) { receipt.errors.push(`owned process cleanup: ${String(error)}`); }
    receipt.controller = { ...controller, signal_handlers: signalHandlers.evidence() };
    await assertCleanHostRoot(tempRoot); await rm(tempRoot, { recursive: true }); receipt.temp_root.removed = true;
    receipt.completed_at = new Date().toISOString(); await mkdir(dirname(cli.output), { recursive: true });
    await writeFile(cli.output, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (!receipt.eligible || receipt.errors.length > 0) throw new Error(`clean-host proof failed; receipt: ${cli.output}`);
  process.stdout.write(`${JSON.stringify({ eligible: true, commit: cli.commit, routes: receipt.route_count, tempRemoved: true, output: cli.output })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
