import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import { fullPublicPaths } from '../../apps/site/app/release.server.ts';
import { startStaticSiteServer } from '../../apps/site/serve-static.ts';
import { LOCAL_SITE_ORIGIN, PUBLIC_SECURITY_HEADERS } from '../../apps/site/app/delivery.ts';
import { assertReactCleanHostReceipt } from './evidence-contracts.mts';
import { verifyStaticDelivery } from './verify-public-site.mts';

const STANDARD_PATH = '/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const COMMANDS = [
  'npm ci',
  'npm run public-release:build',
  'npm run public-release:verify',
  'npm run site:build',
] as const;

export function cleanHostCommandEnvironment(
  _input: NodeJS.ProcessEnv = process.env,
  tempRoot = '/tmp/beyondwin-clean-host.invalid',
): NodeJS.ProcessEnv {
  return {
    PATH: STANDARD_PATH,
    CI: '1',
    NO_COLOR: '1',
    TZ: 'UTC',
    TMPDIR: join(tempRoot, 'tmp'),
    XDG_CACHE_HOME: join(tempRoot, 'cache/xdg'),
    XDG_CONFIG_HOME: join(tempRoot, 'config/xdg'),
    NPM_CONFIG_CACHE: join(tempRoot, 'cache/npm'),
    NPM_CONFIG_USERCONFIG: join(tempRoot, 'config/npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(tempRoot, 'config/npmrc-global'),
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  };
}

function parseArguments(argv: readonly string[]): { commit: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if ((key !== '--commit' && key !== '--output') || !value || value.startsWith('--') || values.has(key)) {
      throw new Error('usage: --commit <immutable-sha> --output <receipt>');
    }
    values.set(key, value);
  }
  const commit = values.get('--commit');
  const output = values.get('--output');
  if (!commit || !/^[a-f0-9]{40}$/u.test(commit) || !output) {
    throw new Error('usage: --commit <immutable-sha> --output <receipt>');
  }
  return { commit, output: resolve(output) };
}

function run(command: (typeof COMMANDS)[number], cwd: string, environment: NodeJS.ProcessEnv): void {
  const [executable, ...arguments_] = command.split(' ');
  execFileSync(executable!, arguments_, { cwd, env: environment, stdio: 'inherit' });
}

async function main(): Promise<void> {
  const cli = parseArguments(process.argv.slice(2));
  if (process.version.split('.')[0] !== 'v24') throw new Error(`clean-host proof requires Node 24, got ${process.version}`);
  const repositoryRoot = process.cwd();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const resolvedCommit = execFileSync('git', ['rev-parse', `${cli.commit}^{commit}`], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  if (head !== cli.commit || resolvedCommit !== cli.commit) throw new Error('clean-host proof requires the exact immutable HEAD commit');
  execFileSync('git', ['diff', '--quiet'], { cwd: repositoryRoot });
  execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: repositoryRoot });

  const tempRoot = mkdtempSync('/tmp/beyondwin-clean-host.');
  const archive = join(tempRoot, 'source.tar');
  const extracted = join(tempRoot, 'repository');
  let staticServer: Awaited<ReturnType<typeof startStaticSiteServer>> | undefined;
  try {
    await Promise.all([
      mkdir(extracted, { recursive: true }),
      mkdir(join(tempRoot, 'tmp'), { recursive: true }),
      mkdir(join(tempRoot, 'cache/npm'), { recursive: true }),
      mkdir(join(tempRoot, 'cache/xdg'), { recursive: true }),
      mkdir(join(tempRoot, 'config/xdg'), { recursive: true }),
      mkdir(join(tempRoot, 'config'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(tempRoot, 'config/npmrc'), ''),
      writeFile(join(tempRoot, 'config/npmrc-global'), ''),
    ]);
    execFileSync('git', [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      cli.commit,
      '--',
      '.',
      ':(exclude)memory',
      ':(exclude)build',
      ':(exclude)output',
      ':(exclude).superpowers',
      ':(exclude).env',
      ':(exclude).env.*',
    ], { cwd: repositoryRoot, stdio: 'inherit' });
    execFileSync('tar', ['-xf', archive, '-C', extracted], { stdio: 'inherit' });
    const environment = cleanHostCommandEnvironment(process.env, tempRoot);
    for (const command of COMMANDS) run(command, extracted, environment);

    const active = await readActiveRelease(join(extracted, 'build/public-releases'));
    const paths = fullPublicPaths(active);
    if (paths.length !== 93) throw new Error(`clean-host route inventory expected 93, got ${paths.length}`);
    const publicRoot = join(extracted, 'apps/site/build/client');
    await verifyStaticDelivery(publicRoot, paths, LOCAL_SITE_ORIGIN);
    staticServer = await startStaticSiteServer({ root: publicRoot, host: '127.0.0.1', port: 0 });
    for (const path of paths) {
      const response = await fetch(new URL(path, staticServer.origin));
      if (response.status !== 200) throw new Error(`clean-host route ${path} returned ${response.status}`);
    }
    const missing = await fetch(new URL('/not-a-public-route/', staticServer.origin));
    if (missing.status !== 404 || !Object.entries(PUBLIC_SECURITY_HEADERS).every(([name, value]) => (
      missing.headers.get(name) === value
    ))) throw new Error('clean-host actual 404/security-header smoke failed');
    const archiveHash = `sha256:${createHash('sha256').update(await readFile(archive)).digest('hex')}`;
    const receipt = {
      schemaVersion: 3,
      renderer: 'react-router',
      implementationCommit: cli.commit,
      releaseId: active.manifest.releaseId,
      routeCount: paths.length,
      smokeCount: paths.length,
      commands: [...COMMANDS],
      archiveHash,
      eligible: true,
      errors: [],
    };
    assertReactCleanHostReceipt(receipt);
    await mkdir(dirname(cli.output), { recursive: true });
    await writeFile(cli.output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ eligible: true, output: cli.output, routeCount: paths.length })}\n`);
  } finally {
    if (staticServer) await staticServer.close();
    const actual = await realpath(tempRoot);
    if (!/^beyondwin-clean-host\.[A-Za-z0-9_-]+$/u.test(basename(tempRoot)) || !actual.endsWith(basename(tempRoot))) {
      throw new Error('clean-host temporary root safety check failed');
    }
    await rm(tempRoot, { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
