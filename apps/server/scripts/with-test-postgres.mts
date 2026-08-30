import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseServerConfig, type FixtureScenario } from '../src/config/server-config.js';
import { indexAnswerRelease } from '../src/index-answer-release.js';
import { runPostgresMigrations } from '../src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { createPostgresPool } from '../src/modules/public-answer/infrastructure/postgres/postgres-pool.js';
import { readVerifiedAnswerReleaseAuthority } from '../src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';

export interface HarnessRun {
  command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; capture: boolean;
}

export interface TestPostgresHarnessDependencies {
  repositoryRoot: string; composeFile: string; postgresConfig: string; vitestEntrypoint: string;
  projectName: string; env: NodeJS.ProcessEnv; execPath: string;
  discover(): Promise<readonly string[]>;
  run(input: HarnessRun): Promise<string>;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ServeFixtureOptions {
  readonly host: string;
  readonly port: number;
  readonly publicOrigin: string;
  readonly fixtureScenario: FixtureScenario;
}

export interface OwnedServerProcess {
  readonly wait: Promise<void>;
  signal(signal: 'SIGINT' | 'SIGTERM'): void;
}

export interface ServeFixtureHarnessDependencies {
  readonly env: NodeJS.ProcessEnv;
  startDatabase(): Promise<{ databaseUrl: string; stop(): Promise<void> }>;
  verifyReleases(env: NodeJS.ProcessEnv): Promise<void>;
  migrate(env: NodeJS.ProcessEnv): Promise<void>;
  indexFixture(env: NodeJS.ProcessEnv): Promise<void>;
  startServer(env: NodeJS.ProcessEnv): OwnedServerProcess;
  ready(origin: string): Promise<boolean>;
  sleep(milliseconds: number): Promise<void>;
  clock(): number;
  onSignal(handler: (signal: 'SIGINT' | 'SIGTERM') => void): () => void;
}

const fixtureScenarios = new Set<FixtureScenario>([
  'success', 'provider-disabled', 'insufficient-evidence', 'unavailable', 'timeout', 'release-mismatch', 'slow-sql',
]);

function loopback(value: string): boolean {
  const family = isIP(value);
  return (family === 4 && value.startsWith('127.')) || (family === 6 && value === '::1');
}

function optionValues(argv: readonly string[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) throw new Error('serve-fixture accepts only explicit named options');
    const separator = token.indexOf('=');
    const name = separator >= 0 ? token.slice(2, separator) : token.slice(2);
    const value = separator >= 0 ? token.slice(separator + 1) : argv[++index];
    if (!value || result.has(name)) throw new Error('serve-fixture options must be complete and unique');
    result.set(name, value);
  }
  return result;
}

export function parseServeFixtureArguments(argv: readonly string[]): ServeFixtureOptions {
  if (argv[0] !== 'serve-fixture') throw new Error('serve-fixture mode is required');
  const options = optionValues(argv);
  if ([...options.keys()].some((key) => !['host', 'port', 'public-origin', 'fixture-scenario'].includes(key))) {
    throw new Error('serve-fixture received an unknown option');
  }
  const host = options.get('host');
  const portText = options.get('port');
  const publicOrigin = options.get('public-origin');
  const scenario = options.get('fixture-scenario') ?? 'success';
  if (!host || !portText || !publicOrigin || !loopback(host) || !/^[1-9]\d{0,4}$/u.test(portText)) {
    throw new Error('serve-fixture requires an explicit loopback host, port, and public origin');
  }
  const port = Number(portText);
  if (port > 65_535 || !fixtureScenarios.has(scenario as FixtureScenario)) {
    throw new Error('serve-fixture port or scenario is invalid');
  }
  try {
    const origin = new URL(publicOrigin);
    const originHost = origin.hostname.replace(/^\[|\]$/gu, '');
    if (origin.protocol !== 'http:' || !loopback(originHost) || originHost !== host || origin.port !== portText
      || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || origin.toString() !== publicOrigin) throw new Error();
  } catch { throw new Error('serve-fixture public origin must exactly match its loopback host and port'); }
  return Object.freeze({ host, port, publicOrigin, fixtureScenario: scenario as FixtureScenario });
}

function spawnRun(input: HarnessRun): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd, env: input.env, stdio: input.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', shell: false,
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept(output) : reject(new Error(`${input.command} exited ${code ?? signal}`)));
  });
}

function productionDependencies(): TestPostgresHarnessDependencies {
  return {
    repositoryRoot,
    composeFile: resolve(repositoryRoot, 'apps/server/compose.test.yml'),
    postgresConfig: resolve(repositoryRoot, 'apps/server/vitest.postgres.config.ts'),
    vitestEntrypoint: resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs'),
    projectName: `beyondwin-public-answer-${process.pid}`,
    env: process.env,
    execPath: process.execPath,
    async discover() {
      return (await readdir(resolve(repositoryRoot, 'apps/server/test/postgres'))).filter((name) => name.endsWith('.test.ts'));
    },
    run: spawnRun,
  };
}

function productionServeFixtureDependencies(): ServeFixtureHarnessDependencies {
  const composeFile = resolve(repositoryRoot, 'apps/server/compose.test.yml');
  const projectName = `beyondwin-public-answer-serve-${process.pid}`;
  const docker = (args: readonly string[], capture = false) => spawnRun({
    command: 'docker', args, cwd: repositoryRoot, env: process.env, capture,
  });
  return {
    env: process.env,
    async startDatabase() {
      await docker(['compose', '-p', projectName, '-f', composeFile, 'up', '-d', '--wait']);
      const mapped = (await docker(['compose', '-p', projectName, '-f', composeFile, 'port', 'postgres', '5432'], true)).trim();
      const port = mapped.slice(mapped.lastIndexOf(':') + 1);
      if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
      return {
        databaseUrl: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`,
        async stop() {
          await docker(['compose', '-p', projectName, '-f', composeFile, 'down', '-v', '--remove-orphans']);
        },
      };
    },
    async verifyReleases(env) {
      await readVerifiedAnswerReleaseAuthority(await parseServerConfig(env));
    },
    async migrate(env) {
      const config = await parseServerConfig(env);
      const pool = createPostgresPool(config.databaseUrl);
      try { await runPostgresMigrations(pool); } finally { await pool.end(); }
    },
    async indexFixture(env) {
      await indexAnswerRelease(['--embedding-mode=fixture'], env, () => undefined);
    },
    startServer(env) {
      const child = spawn(process.execPath, [
        resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
        '--tsconfig',
        resolve(repositoryRoot, 'apps/server/tsconfig.json'),
        resolve(repositoryRoot, 'apps/server/src/main.ts'),
      ], { cwd: repositoryRoot, env, stdio: 'inherit', shell: false });
      const wait = new Promise<void>((accept, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`fixture server exited ${code ?? signal}`)));
      });
      return { wait, signal(signal) { child.kill(signal); } };
    },
    async ready(origin) {
      try {
        const response = await fetch(new URL('/health/ready', origin), { signal: AbortSignal.timeout(1_000) });
        return response.status === 200;
      } catch { return false; }
    },
    sleep: (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds)),
    clock: performance.now.bind(performance),
    onSignal(handler) {
      const onInt = () => handler('SIGINT');
      const onTerm = () => handler('SIGTERM');
      process.once('SIGINT', onInt);
      process.once('SIGTERM', onTerm);
      return () => {
        process.removeListener('SIGINT', onInt);
        process.removeListener('SIGTERM', onTerm);
      };
    },
  };
}

export async function runServeFixtureHarness(
  options: ServeFixtureOptions,
  dependencies: ServeFixtureHarnessDependencies = productionServeFixtureDependencies(),
): Promise<void> {
  if (dependencies.env.OPENAI_API_KEY !== undefined) throw new Error('serve-fixture forbids a provider key');
  let database: Awaited<ReturnType<ServeFixtureHarnessDependencies['startDatabase']>> | undefined;
  let server: OwnedServerProcess | undefined;
  let serverCompleted = false;
  let removeSignals: () => void = () => undefined;
  try {
    database = await dependencies.startDatabase();
    const env: NodeJS.ProcessEnv = {
      ...dependencies.env,
      NODE_ENV: 'test',
      HOST: options.host,
      PORT: String(options.port),
      FORM_THOUGHT_PUBLIC_ORIGIN: options.publicOrigin,
      FORM_THOUGHT_PUBLIC_ASK_MODE: options.fixtureScenario === 'provider-disabled' ? 'disabled' : 'fixture',
      FORM_THOUGHT_TEST_FIXTURE_SCENARIO: options.fixtureScenario,
      FORM_THOUGHT_SERVER_REPLICA_COUNT: '1',
      FORM_THOUGHT_DATABASE_URL: database.databaseUrl,
      FORM_THOUGHT_CONTENT_RELEASE_ROOT: dependencies.env.FORM_THOUGHT_CONTENT_RELEASE_ROOT
        ?? resolve(repositoryRoot, 'build/public-releases'),
      FORM_THOUGHT_ANSWER_RELEASE_ROOT: dependencies.env.FORM_THOUGHT_ANSWER_RELEASE_ROOT
        ?? resolve(repositoryRoot, 'build/public-answer-releases'),
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: dependencies.env.FORM_THOUGHT_CORPUS_APPROVAL_PATH
        ?? resolve(repositoryRoot, 'src/data/public-answer-corpus-approval.v1.json'),
      FORM_THOUGHT_NETWORK_HMAC_SECRET: randomBytes(32).toString('hex'),
    };
    delete env.OPENAI_API_KEY;
    delete env.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT;
    delete env.FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT;
    const indexingEnv = { ...env, FORM_THOUGHT_PUBLIC_ASK_MODE: 'fixture' };
    await dependencies.verifyReleases(indexingEnv);
    await dependencies.migrate(indexingEnv);
    await dependencies.indexFixture(indexingEnv);
    server = dependencies.startServer(env);
    removeSignals = dependencies.onSignal((signal) => server?.signal(signal));
    const startupDeadline = dependencies.clock() + 20_000;
    while (!await dependencies.ready(options.publicOrigin)) {
      if (dependencies.clock() >= startupDeadline) throw new Error('fixture server readiness deadline elapsed');
      await Promise.race([
        dependencies.sleep(100),
        server.wait.then(() => { throw new Error('fixture server exited before readiness'); }),
      ]);
    }
    await server.wait;
    serverCompleted = true;
  } finally {
    removeSignals();
    if (server && !serverCompleted) {
      server.signal('SIGTERM');
      await Promise.race([
        server.wait.catch(() => undefined),
        dependencies.sleep(12_000),
      ]);
    }
    await database?.stop();
  }
}

export async function runTestPostgresHarness(
  mode: string | undefined,
  dependencies: TestPostgresHarnessDependencies = productionDependencies(),
): Promise<void> {
  const allowed = new Set(['test', 'eval', 'eval-hidden', 'eval-hidden-provider-live']);
  if (!mode || !allowed.has(mode)) throw new Error('mode must be exactly test, eval, eval-hidden, or eval-hidden-provider-live');
  if ((await dependencies.discover()).length === 0) throw new Error('dedicated Postgres config discovered zero owned tests');
  let started = false;
  const docker = (args: readonly string[], capture = false) => dependencies.run({
    command: 'docker', args, cwd: dependencies.repositoryRoot, env: dependencies.env, capture,
  });
  try {
    await docker(['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'up', '-d', '--wait']);
    started = true;
    const mapped = (await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'port', 'postgres', '5432',
    ], true)).trim();
    const port = mapped.slice(mapped.lastIndexOf(':') + 1);
    if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
    if (mode !== 'test') throw new Error(`${mode} is reserved until its owning runtime task installs the executable suite`);
    await dependencies.run({
      command: dependencies.execPath,
      args: [dependencies.vitestEntrypoint, 'run', '--config', dependencies.postgresConfig],
      cwd: dependencies.repositoryRoot,
      env: {
        ...dependencies.env,
        FORM_THOUGHT_TEST_DATABASE_URL: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`,
      },
      capture: false,
    });
  } finally {
    if (started) await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans',
    ]).catch((error) => {
      process.stderr.write(`Postgres cleanup failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
  }
}

export async function runTestPostgresHarnessFromArgv(
  argv: readonly string[],
  dependencies?: TestPostgresHarnessDependencies,
): Promise<void> {
  if (argv[0] === 'serve-fixture') {
    if (dependencies) throw new Error('serve-fixture uses its owned lifecycle dependencies');
    await runServeFixtureHarness(parseServeFixtureArguments(argv));
    return;
  }
  const allowed = new Set(['test', 'eval', 'eval-hidden', 'eval-hidden-provider-live']);
  if (argv.length !== 1 || !allowed.has(argv[0]!)) {
    throw new Error('expected exactly one mode: test, eval, eval-hidden, or eval-hidden-provider-live');
  }
  await runTestPostgresHarness(argv[0], dependencies);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await runTestPostgresHarnessFromArgv(process.argv.slice(2));
}
