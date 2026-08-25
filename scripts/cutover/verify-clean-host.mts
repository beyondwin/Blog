import { spawn, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import type { AstroBaseline } from '../../tools/parity/src/html-contract.ts';
import { hashFile, hashTree, readJson, sha256 } from './cutover-evidence.mts';

interface CommandEvidence {
  command: string;
  pid: number;
  exit_code: number;
  stopped: true;
}

interface CleanHostReceipt {
  schema_version: 1;
  implementation_commit: string;
  created_at: string;
  completed_at: string;
  eligible: boolean;
  archive_hash: string;
  archive_inventory_hash: string;
  archive_inventory_count: number;
  exclusions: {
    dependencies: true;
    generated_output: true;
    secrets_and_environment: true;
    top_level_private_memory: true;
  };
  node: string;
  npm: string;
  commands: CommandEvidence[];
  release: null | {
    release_id: string;
    active_pointer_hash: string;
    manifest_hash: string;
    artifact_hash: string;
  };
  selected_build_hash: string | null;
  route_count: number;
  inventory_hash: string;
  representative_routes: string[];
  smoke: Array<{ path: string; status: number; body_hash: string }>;
  preview_port: number | null;
  temp_removed: boolean;
  errors: string[];
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

export function cleanHostCommandEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const {
    NODE_ENV,
    npm_config_omit,
    npm_config_only,
    npm_config_production,
    NPM_CONFIG_OMIT,
    NPM_CONFIG_ONLY,
    NPM_CONFIG_PRODUCTION,
    ...environment
  } = input;
  return environment;
}

function parseArguments(argv: readonly string[]): { commit: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if ((key !== '--commit' && key !== '--output') || !value || value.startsWith('--')) {
      throw new Error('usage: --commit <immutable-sha> --output <receipt>');
    }
    if (values.has(key)) throw new Error(`duplicate argument: ${key}`);
    values.set(key, value);
  }
  const commit = values.get('--commit');
  const output = values.get('--output');
  if (!commit || !/^[a-f0-9]{40}$/u.test(commit) || !output) {
    throw new Error('usage: --commit <immutable-sha> --output <receipt>');
  }
  return { commit, output: resolve(output) };
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  records: CommandEvidence[],
): Promise<void> {
  await new Promise<void>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: cleanHostCommandEnvironment(),
      stdio: 'inherit',
      shell: false,
    });
    if (!child.pid) {
      reject(new Error(`failed to create command: ${command}`));
      return;
    }
    const record = {
      command: [command, ...args].join(' '),
      pid: child.pid,
      exit_code: -1,
      stopped: true as const,
    };
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      record.exit_code = code ?? 128;
      records.push(record);
      if (code === 0) resolveCommand();
      else reject(new Error(`${record.command} failed with ${signal ?? `exit ${String(code)}`}`));
    });
  });
}

function archiveInventoryRejected(path: string): boolean {
  const normalized = path.replace(/\/$/u, '');
  return normalized === 'memory'
    || normalized.startsWith('memory/')
    || normalized.split('/').includes('node_modules')
    || normalized === 'build'
    || normalized.startsWith('build/')
    || normalized === 'output'
    || normalized.startsWith('output/')
    || normalized === '.superpowers'
    || normalized.startsWith('.superpowers/')
    || normalized.split('/').some((part) => part === '.env' || part.startsWith('.env.'));
}

async function assertCleanHostRoot(path: string): Promise<void> {
  const state = await lstat(path);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error('clean-host temp root must be one real directory');
  if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
    throw new Error('clean-host temp root must be owned by the current user');
  }
  const expected = join(await realpath('/tmp'), basename(path));
  if (!/^beyondwin-clean-host\.[A-Za-z0-9_-]+$/u.test(basename(path)) || await realpath(path) !== expected) {
    throw new Error('clean-host temp root is outside /tmp/beyondwin-clean-host.*');
  }
}

function mimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function startStaticServer(root: string): Promise<{ server: Server; port: number }> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.split('/').includes('..')) throw new Error('unsafe request path');
      const relativePath = decoded.endsWith('/') ? `${decoded.slice(1)}index.html` : decoded.slice(1);
      const path = join(root, relativePath || 'index.html');
      const state = await lstat(path);
      if (state.isSymbolicLink() || !state.isFile()) throw new Error('not a regular file');
      response.writeHead(200, { 'content-type': mimeType(path) });
      if (request.method === 'HEAD') response.end();
      else response.end(await readFile(path));
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found\n');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('clean-host preview did not bind a TCP port');
  return { server, port: address.port };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
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

  const tempRoot = await mkdtemp('/tmp/beyondwin-clean-host.');
  await assertCleanHostRoot(tempRoot);
  const archivePath = join(tempRoot, 'source.tar');
  const extractedRoot = join(tempRoot, 'repository');
  const commands: CommandEvidence[] = [];
  let server: Server | undefined;
  const receipt: CleanHostReceipt = {
    schema_version: 1,
    implementation_commit: cli.commit,
    created_at: new Date().toISOString(),
    completed_at: '',
    eligible: false,
    archive_hash: '',
    archive_inventory_hash: '',
    archive_inventory_count: 0,
    exclusions: {
      dependencies: true,
      generated_output: true,
      secrets_and_environment: true,
      top_level_private_memory: true,
    },
    node: process.version,
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    commands,
    release: null,
    selected_build_hash: null,
    route_count: 0,
    inventory_hash: '',
    representative_routes: [...representativeRoutes],
    smoke: [],
    preview_port: null,
    temp_removed: false,
    errors: [],
  };

  try {
    await runCommand('git', [
      'archive', '--format=tar', `--output=${archivePath}`, cli.commit, '--', '.',
      ':(exclude)memory', ':(exclude)build', ':(exclude)output', ':(exclude).superpowers',
      ':(exclude).env', ':(exclude).env.*',
    ], root, commands);
    receipt.archive_hash = await hashFile(archivePath);
    const inventoryText = execFileSync('tar', ['-tf', archivePath], { encoding: 'utf8' });
    const inventory = inventoryText.split('\n').filter(Boolean).sort();
    const rejected = inventory.filter(archiveInventoryRejected);
    if (rejected.length > 0) throw new Error(`clean-host archive contains excluded paths: ${rejected.join(', ')}`);
    receipt.archive_inventory_count = inventory.length;
    receipt.archive_inventory_hash = sha256(`${inventory.join('\n')}\n`);
    await mkdir(extractedRoot);
    await runCommand('tar', ['-xf', archivePath, '-C', extractedRoot], root, commands);
    await runCommand('npm', ['ci'], extractedRoot, commands);
    await runCommand('npm', ['run', 'public-release:build'], extractedRoot, commands);
    await runCommand('npm', ['run', 'public-release:verify'], extractedRoot, commands);
    await runCommand('npm', ['run', 'site:build'], extractedRoot, commands);

    const active = await readActiveRelease(join(extractedRoot, 'build/public-releases'));
    receipt.release = {
      release_id: active.manifest.releaseId,
      active_pointer_hash: active.activePointerHash,
      manifest_hash: active.manifestHash,
      artifact_hash: active.artifactHash,
    };
    const clientRoot = join(extractedRoot, 'apps/site/build/client');
    receipt.selected_build_hash = await hashTree(clientRoot);
    const baseline = await readJson<AstroBaseline>(join(extractedRoot, 'tests/fixtures/parity/astro-public-baseline.json'));
    receipt.route_count = baseline.routes.length;
    receipt.inventory_hash = sha256(`${baseline.routes.map(({ path }) => path).sort().join('\n')}\n`);
    const preview = await startStaticServer(clientRoot);
    server = preview.server;
    receipt.preview_port = preview.port;
    for (const route of baseline.routes.map(({ path }) => path)) {
      const response = await fetch(`http://127.0.0.1:${preview.port}${route}`, { redirect: 'manual' });
      const body = Buffer.from(await response.arrayBuffer());
      if (response.status !== 200 || body.length === 0) throw new Error(`clean-host HTTP smoke failed for ${route}`);
      receipt.smoke.push({ path: route, status: response.status, body_hash: sha256(body) });
    }
    await closeServer(server);
    server = undefined;
    receipt.eligible = receipt.route_count === 80 && receipt.smoke.length === 80;
  } catch (error) {
    receipt.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    if (server) {
      try {
        await closeServer(server);
      } catch (error) {
        receipt.errors.push(`server cleanup: ${String(error)}`);
      }
    }
    await assertCleanHostRoot(tempRoot);
    await rm(tempRoot, { recursive: true, force: true });
    receipt.temp_removed = true;
    receipt.completed_at = new Date().toISOString();
    await mkdir(dirname(cli.output), { recursive: true });
    await writeFile(cli.output, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (!receipt.eligible || receipt.errors.length > 0) {
    throw new Error(`clean-host proof failed; receipt: ${cli.output}`);
  }
  process.stdout.write(`${JSON.stringify({ eligible: true, commit: cli.commit, routes: receipt.route_count, tempRemoved: true, output: cli.output })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
