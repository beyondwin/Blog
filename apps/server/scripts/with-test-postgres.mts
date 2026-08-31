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
  signal?: AbortSignal;
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
  readonly startup: Promise<void>;
  readonly wait: Promise<void>;
  signal(signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): void;
}

export interface ServeFixtureHarnessDependencies {
  readonly env: NodeJS.ProcessEnv;
  startDatabase(signal: AbortSignal): Promise<{ databaseUrl: string; stop(): Promise<void> }>;
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
    if (input.signal?.aborted) { reject(input.signal.reason ?? new Error('owned process start aborted')); return; }
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd, env: input.env, stdio: input.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', shell: false,
    });
    let output = '';
    let killTimer: NodeJS.Timeout | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      killTimer.unref();
    };
    input.signal?.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', (error) => {
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener('abort', abort);
      code === 0 ? accept(output) : reject(input.signal?.reason ?? new Error(`${input.command} exited ${code ?? signal}`));
    });
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
  return {
    env: process.env,
    async startDatabase(signal) {
      return startOwnedFixtureDatabase({ repositoryRoot, composeFile, projectName, env: process.env, run: spawnRun }, signal);
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
      ], {
        cwd: repositoryRoot,
        env,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        shell: false,
        detached: process.platform !== 'win32',
      });
      const startup = new Promise<void>((accept, reject) => {
        const message = (value: unknown) => {
          if (value && typeof value === 'object'
            && (value as { type?: unknown }).type === 'beyondwin-public-answer-listening') {
            cleanup();
            accept();
          }
        };
        const failed = (error: unknown) => { cleanup(); reject(error); };
        const exited = (code: number | null, signal: NodeJS.Signals | null) => {
          failed(new Error(`fixture server exited before startup ${code ?? signal}`));
        };
        const cleanup = () => {
          child.removeListener('message', message);
          child.removeListener('error', failed);
          child.removeListener('exit', exited);
        };
        child.on('message', message);
        child.once('error', failed);
        child.once('exit', exited);
      });
      const wait = new Promise<void>((accept, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`fixture server exited ${code ?? signal}`)));
      });
      return {
        startup,
        wait,
        signal(signal) {
          if (!child.pid) return;
          try {
            if (process.platform === 'win32') child.kill(signal);
            else process.kill(-child.pid, signal);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        },
      };
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

export async function startOwnedFixtureDatabase(
  dependencies: Readonly<Pick<TestPostgresHarnessDependencies,
    'repositoryRoot' | 'composeFile' | 'projectName' | 'env' | 'run'>>,
  signal?: AbortSignal,
): Promise<{ databaseUrl: string; stop(): Promise<void> }> {
  const docker = (args: readonly string[], capture = false, interruptible = true) => dependencies.run({
    command: 'docker', args, cwd: dependencies.repositoryRoot, env: dependencies.env, capture,
    ...(interruptible ? { signal } : {}),
  });
  let startupAttempted = false;
  try {
    startupAttempted = true;
    await docker(['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'up', '-d', '--wait']);
    const mapped = (await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'port', 'postgres', '5432',
    ], true)).trim();
    const port = mapped.slice(mapped.lastIndexOf(':') + 1);
    if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
    return {
      databaseUrl: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`,
      async stop() {
        await docker([
          'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans',
        ], false, false);
      },
    };
  } catch (error) {
    if (startupAttempted) await dependencies.run({
      command: 'docker',
      args: ['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans'],
      cwd: dependencies.repositoryRoot,
      env: dependencies.env,
      capture: false,
    }).catch(() => undefined);
    throw error;
  }
}

export async function runServeFixtureHarness(
  options: ServeFixtureOptions,
  dependencies: ServeFixtureHarnessDependencies = productionServeFixtureDependencies(),
): Promise<void> {
  if (dependencies.env.OPENAI_API_KEY !== undefined) throw new Error('serve-fixture forbids a provider key');
  let database: Awaited<ReturnType<ServeFixtureHarnessDependencies['startDatabase']>> | undefined;
  let databaseStartup: Promise<Awaited<ReturnType<ServeFixtureHarnessDependencies['startDatabase']>>> | undefined;
  let server: OwnedServerProcess | undefined;
  let serverCompleted = false;
  let childTerminationUnconfirmed = false;
  const startupController = new AbortController();
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
  let notifyInterrupted!: (signal: 'SIGINT' | 'SIGTERM') => void;
  const interruption = new Promise<'SIGINT' | 'SIGTERM'>((resolve) => { notifyInterrupted = resolve; });
  const removeSignals = dependencies.onSignal((signal) => {
    if (!interrupted) { interrupted = signal; notifyInterrupted(signal); }
    startupController.abort(new Error(`serve-fixture interrupted by ${signal}`));
    server?.signal(signal);
  });
  const interruptible = async <T,>(operation: Promise<T>): Promise<T> => Promise.race([
    operation,
    interruption.then((signal) => { throw new Error(`serve-fixture interrupted by ${signal}`); }),
  ]);
  try {
    databaseStartup = dependencies.startDatabase(startupController.signal);
    database = await interruptible(databaseStartup);
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
    await interruptible(dependencies.verifyReleases(indexingEnv));
    await interruptible(dependencies.migrate(indexingEnv));
    await interruptible(dependencies.indexFixture(indexingEnv));
    const startupDeadline = dependencies.clock() + 20_000;
    server = dependencies.startServer(env);
    void server.wait.catch(() => undefined);
    if (interrupted) server.signal(interrupted);
    let startupTimer: NodeJS.Timeout | undefined;
    const startupTimedOut = new Promise<never>((_resolve, reject) => {
      startupTimer = setTimeout(
        () => reject(new Error('fixture server startup deadline elapsed')),
        Math.max(0, startupDeadline - dependencies.clock()),
      );
      startupTimer.unref();
    });
    try {
      await interruptible(Promise.race([
        server.startup,
        server.wait.then(
          () => { throw new Error('fixture server exited before startup acknowledgement'); },
          (error) => { throw error; },
        ),
        startupTimedOut,
      ]));
    } finally {
      if (startupTimer) clearTimeout(startupTimer);
    }
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
      let stopped = false;
      const observed = server.wait.then(() => { stopped = true; }, () => { stopped = true; });
      await Promise.race([
        observed,
        dependencies.sleep(10_000),
      ]);
      if (!stopped) {
        server.signal('SIGKILL');
        await Promise.race([observed, dependencies.sleep(2_000)]);
        if (!stopped) childTerminationUnconfirmed = true;
      }
    }
    if (!database && databaseStartup) {
      database = await databaseStartup.catch(() => undefined);
    }
    if (childTerminationUnconfirmed) {
      throw new Error('fixture server termination was not confirmed; database retained for owned-process safety');
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
