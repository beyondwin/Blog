import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createLocalProviderAuthorization,
  readLocalProviderAuthorization,
  writeLocalProviderAuthorization,
} from '../../apps/server/src/config/local-provider-authorization.js';
import { indexAnswerRelease, providerIndexBudget } from '../../apps/server/src/index-answer-release.js';
import { LocalBudgetLedger } from '../../apps/server/src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { PROVIDER_MODEL_POLICY } from '../../apps/server/src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { runPostgresMigrations } from '../../apps/server/src/modules/public-answer/infrastructure/postgres/postgres-migrations.js';
import { createPostgresPool } from '../../apps/server/src/modules/public-answer/infrastructure/postgres/postgres-pool.js';
import { readVerifiedAnswerReleaseAuthority } from '../../apps/server/src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import { stopOwnedChildrenInReverse } from '../cutover/owned-process-lifecycle.mts';
import { startOwnedPostgres, type OwnedComposeRun } from './owned-postgres.mts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsxEntrypoint = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const composeFile = resolve(repositoryRoot, 'apps/server/compose.test.yml');
const liveTempPattern = /^\/tmp\/beyondwin-public-answer-live\.[A-Za-z0-9_-]+$/u;
const cutoverTempPattern = /^\/tmp\/beyondwin-cutover\.[A-Za-z0-9_-]+$/u;

export interface LocalLiveArguments {
  readonly host: '127.0.0.1';
  readonly port: number | null;
}

export interface OwnedLiveProcess {
  readonly role: 'nest' | 'preview' | 'proxy';
  readonly startup: Promise<void>;
  readonly wait: Promise<void>;
  output(): string;
  signal(signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): void;
}

export interface LocalLiveOwnedState {
  readonly tempRoot: string;
  readonly stateRoot: string;
  readonly cutoverRoot: string;
  readonly authorizationPath: string;
  readonly ledgerPath: string;
  readonly embeddingReceiptRoot: string;
}

export interface LocalLiveHarnessDependencies {
  readonly env: NodeJS.ProcessEnv;
  readonly nodeMajor: number;
  readonly startupDeadlineMs: number;
  readonly redactValues: readonly string[];
  dockerAvailable(): Promise<boolean>;
  portIsFree(port: number | null): Promise<boolean>;
  reservePorts(requested: number | null): Promise<Readonly<{ proxy: number; nest: number; preview: number }>>;
  verifyReleases(env: NodeJS.ProcessEnv): Promise<void>;
  createOwnedState(): Promise<LocalLiveOwnedState>;
  writeAuthorization(path: string): Promise<void>;
  openLedger(path: string): Promise<Readonly<{ snapshot(): Promise<Readonly<{ availableMicroUsd: number }>> }>>;
  calculateIndexReservation(env: NodeJS.ProcessEnv): Promise<number>;
  startDatabase(signal: AbortSignal): Promise<{ databaseUrl: string; stop(): Promise<void> }>;
  migrate(env: NodeJS.ProcessEnv): Promise<void>;
  index(env: NodeJS.ProcessEnv): Promise<void>;
  reopenBinding(env: NodeJS.ProcessEnv): Promise<void>;
  buildSite(env: NodeJS.ProcessEnv): Promise<void>;
  startNest(env: NodeJS.ProcessEnv, port: number): OwnedLiveProcess;
  startPreview(env: NodeJS.ProcessEnv, port: number): OwnedLiveProcess;
  startProxy(env: NodeJS.ProcessEnv, input: Readonly<{
    listenPort: number;
    previewPort: number;
    nestPort: number;
    pidFile: string;
  }>): OwnedLiveProcess;
  ready(url: string): Promise<boolean>;
  print(value: string): void;
  sleep(milliseconds: number): Promise<void>;
  clock(): number;
  onSignal(handler: (signal: 'SIGINT' | 'SIGTERM') => void): () => void;
  waitAttached(): Promise<void>;
  removeTempState(paths: readonly string[]): Promise<void>;
}

export function parseLocalLiveArguments(argv: readonly string[]): LocalLiveArguments {
  let port: number | null = null;
  let seenPort = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '--port' || token.startsWith('--port=')) {
      if (seenPort) throw new Error('duplicate argument: --port');
      seenPort = true;
      const value = token === '--port' ? argv[++index] : token.slice('--port='.length);
      if (!value || value.startsWith('--')) throw new Error('--port requires one value');
      if (!/^[1-9]\d{0,4}$/u.test(value)) throw new Error('--port is invalid');
      const parsed = Number(value);
      if (parsed > 65_535) throw new Error('--port is out of range');
      port = parsed;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  return { host: '127.0.0.1', port };
}

export function preflight(
  env: NodeJS.ProcessEnv,
  options: Readonly<{ nodeMajor?: number; dockerAvailable?: boolean }> = {},
): void {
  const nodeMajor = options.nodeMajor ?? Number.parseInt(process.versions.node.split('.')[0]!, 10);
  if (nodeMajor !== 24) throw new Error('local live harness requires Node major 24');
  const key = env.OPENAI_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') throw new Error('OPENAI_API_KEY is required');
  if (options.dockerAvailable === false) throw new Error('Docker is unavailable');
}

export function redactLiveDiagnostics(
  value: string,
  env: NodeJS.ProcessEnv,
  extra: readonly string[] = [],
): string {
  const secrets = [...extra];
  if (typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY !== '') secrets.push(env.OPENAI_API_KEY);
  const unique = [...new Set(secrets.filter(Boolean))].sort((left, right) => right.length - left.length);
  return unique.reduce((output, secret) => output.replaceAll(secret, '[redacted-secret]'), value);
}

function spawnRun(input: OwnedComposeRun): Promise<string> {
  return new Promise((accept, reject) => {
    if (input.signal?.aborted) { reject(input.signal.reason ?? new Error('owned process start aborted')); return; }
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd, env: input.env, stdio: input.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false,
    });
    let output = '';
    let killTimer: NodeJS.Timeout | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      killTimer.unref();
    };
    input.signal?.addEventListener('abort', abort, { once: true });
    const append = (chunk: Buffer) => { output += chunk.toString('utf8'); };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
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

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolvePort, reject) => {
    const server = http.createServer();
    server.unref();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolvePort(false);
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

async function allocateFreePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { reject(new Error('owned port unavailable')); return; }
      server.close((error) => error ? reject(error) : accept(address.port));
    });
  });
}

function spawnLiveProcess(
  role: OwnedLiveProcess['role'],
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  options: { ipc?: boolean } = {},
): OwnedLiveProcess {
  const child = spawn(command, [...args], {
    cwd: repositoryRoot,
    env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: options.ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  const append = (chunk: Buffer) => { text += chunk.toString('utf8'); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  const wait = new Promise<void>((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => (
      code === 0 ? accept() : reject(new Error(`owned ${role} exited ${code ?? signal}`))
    ));
  });
  const startup = options.ipc ? new Promise<void>((accept, reject) => {
    const message = (value: unknown) => {
      if (value && typeof value === 'object' && (value as { type?: unknown }).type === 'beyondwin-public-answer-listening') {
        cleanup();
        accept();
      }
    };
    const failed = (error: unknown) => { cleanup(); reject(error); };
    const exited = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      failed(new Error(`owned ${role} exited before startup ${code ?? exitSignal}`));
    };
    const cleanup = () => {
      child.removeListener('message', message);
      child.removeListener('error', failed);
      child.removeListener('exit', exited);
    };
    child.on('message', message);
    child.once('error', failed);
    child.once('exit', exited);
  }) : Promise.resolve();
  return {
    role,
    startup,
    wait,
    output: () => text,
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
}

function productionDependencies(): LocalLiveHarnessDependencies {
  const env = process.env;
  const stateRoot = resolve(repositoryRoot, '.superpowers/runtime/public-answer-live');
  const contentReleaseRoot = resolve(repositoryRoot, 'build/public-releases');
  const answerReleaseRoot = resolve(repositoryRoot, 'build/public-answer-releases');
  const corpusApprovalPath = resolve(repositoryRoot, 'src/data/public-answer-corpus-approval.v1.json');
  return {
    env,
    nodeMajor: Number.parseInt(process.versions.node.split('.')[0]!, 10),
    startupDeadlineMs: 20_000,
    redactValues: [],
    async dockerAvailable() {
      try {
        await spawnRun({
          command: 'docker', args: ['compose', 'version'], cwd: repositoryRoot, env, capture: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    async portIsFree(port) {
      if (port === null) return true;
      return portIsFree(port);
    },
    async reservePorts(requested) {
      const used = new Set<number>();
      const allocate = async () => {
        let port = await allocateFreePort();
        while (used.has(port)) port = await allocateFreePort();
        used.add(port);
        return port;
      };
      const proxy = requested ?? await allocate();
      used.add(proxy);
      return { proxy, nest: await allocate(), preview: await allocate() };
    },
    async verifyReleases(childEnv) {
      for (const script of [
        'public-release:build',
        'public-release:verify',
        'public-answer-release:build',
        'public-answer-release:verify',
      ]) {
        await spawnRun({
          command: 'npm', args: ['run', script], cwd: repositoryRoot, env: childEnv, capture: true,
        });
      }
    },
    async createOwnedState() {
      const embeddingReceiptRoot = join(stateRoot, 'embedding-receipts');
      await mkdir(embeddingReceiptRoot, { recursive: true, mode: 0o700 });
      const tempRoot = await mkdtemp('/tmp/beyondwin-public-answer-live.');
      const cutoverRoot = await mkdtemp('/tmp/beyondwin-cutover.');
      return {
        tempRoot,
        stateRoot,
        cutoverRoot,
        authorizationPath: join(stateRoot, 'authorization.json'),
        ledgerPath: join(stateRoot, 'budget-ledger.json'),
        embeddingReceiptRoot,
      };
    },
    async writeAuthorization(path) {
      try {
        await writeLocalProviderAuthorization(path, createLocalProviderAuthorization({
          createdAt: new Date().toISOString(),
          policyHash: PROVIDER_MODEL_POLICY.policyHash,
          monthlyHardCapMicroUsd: 1_000_000,
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await readLocalProviderAuthorization(path);
      }
    },
    openLedger: (path) => LocalBudgetLedger.open(path),
    async calculateIndexReservation() {
      const { answer } = await readVerifiedAnswerReleaseAuthority({
        corpusApprovalPath, contentReleaseRoot, answerReleaseRoot,
      });
      return providerIndexBudget(answer.indexInputs).costUpperBoundMicroUsd;
    },
    startDatabase(signal) {
      return startOwnedPostgres({
        repositoryRoot,
        composeFile,
        projectName: `beyondwin-public-answer-live-${process.pid}`,
        env,
        run: spawnRun,
      }, signal);
    },
    async migrate(childEnv) {
      const pool = createPostgresPool(childEnv.FORM_THOUGHT_DATABASE_URL!);
      try { await runPostgresMigrations(pool); } finally { await pool.end(); }
    },
    async index(childEnv) {
      await indexAnswerRelease(
        ['--embedding-mode=provider', '--confirm-live-provider', '--provider-authority=local'],
        childEnv,
        () => undefined,
      );
    },
    async reopenBinding(childEnv) {
      const pool = createPostgresPool(childEnv.FORM_THOUGHT_DATABASE_URL!);
      try {
        const result = await pool.query('SELECT binding_id FROM public_answer_release_bindings WHERE state=$1', ['active']);
        if (result.rowCount !== 1) throw new Error('active binding reopen failed');
      } finally { await pool.end(); }
    },
    async buildSite(childEnv) {
      await spawnRun({
        command: 'npm', args: ['run', 'site:build'], cwd: repositoryRoot, env: childEnv, capture: true,
      });
    },
    startNest(childEnv, port) {
      return spawnLiveProcess('nest', process.execPath, [
        tsxEntrypoint,
        '--tsconfig',
        resolve(repositoryRoot, 'apps/server/tsconfig.json'),
        resolve(repositoryRoot, 'apps/server/src/main.ts'),
      ], { ...childEnv, HOST: '127.0.0.1', PORT: String(port) }, { ipc: true });
    },
    startPreview(childEnv, port) {
      return spawnLiveProcess('preview', 'npm', [
        'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', String(port),
      ], childEnv);
    },
    startProxy(childEnv, input) {
      return spawnLiveProcess('proxy', process.execPath, [
        tsxEntrypoint,
        resolve(repositoryRoot, 'scripts/cutover/local-proxy.mts'),
        '--listen', `127.0.0.1:${input.listenPort}`,
        '--react', `http://127.0.0.1:${input.previewPort}/`,
        '--api', `http://127.0.0.1:${input.nestPort}/`,
        '--pid-file', input.pidFile,
      ], childEnv);
    },
    async ready(url) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        return response.status === 200;
      } catch {
        return false;
      }
    },
    print(value) { process.stdout.write(value); },
    sleep: (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds)),
    clock: Date.now,
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
    waitAttached: () => new Promise(() => undefined),
    async removeTempState(paths) {
      for (const path of paths) {
        if (!liveTempPattern.test(path) && !cutoverTempPattern.test(path)) continue;
        await rm(path, { recursive: true, force: true });
      }
    },
  };
}

export async function runLocalLiveHarness(
  args: LocalLiveArguments,
  dependencies: LocalLiveHarnessDependencies = productionDependencies(),
): Promise<void> {
  preflight(dependencies.env, { nodeMajor: dependencies.nodeMajor });
  const extras = [...dependencies.redactValues];
  const redact = (error: unknown) => new Error(redactLiveDiagnostics(
    error instanceof Error ? error.message : String(error),
    dependencies.env,
    extras,
  ));
  let primary: unknown;
  let database: Awaited<ReturnType<LocalLiveHarnessDependencies['startDatabase']>> | undefined;
  let databaseStartup: Promise<Awaited<ReturnType<LocalLiveHarnessDependencies['startDatabase']>>> | undefined;
  const children: OwnedLiveProcess[] = [];
  let childTerminationUnconfirmed = false;
  let tempPaths: string[] = [];
  const startupController = new AbortController();
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
  let notifyInterrupted!: (signal: 'SIGINT' | 'SIGTERM') => void;
  const interruption = new Promise<'SIGINT' | 'SIGTERM'>((resolveInterruption) => {
    notifyInterrupted = resolveInterruption;
  });
  const removeSignals = dependencies.onSignal((signal) => {
    if (!interrupted) {
      interrupted = signal;
      notifyInterrupted(signal);
    }
    startupController.abort(new Error(`local live harness interrupted by ${signal}`));
  });
  const interruptible = async <T,>(operation: Promise<T>): Promise<T> => Promise.race([
    operation,
    interruption.then((signal) => { throw new Error(`local live harness interrupted by ${signal}`); }),
  ]);
  try {
    if (!await dependencies.dockerAvailable()) throw new Error('Docker is unavailable');
    if (!await dependencies.portIsFree(args.port)) {
      throw new Error(`requested loopback port occupied${args.port === null ? '' : `: ${args.port}`}`);
    }
    const ports = await dependencies.reservePorts(args.port);
    await interruptible(dependencies.verifyReleases(dependencies.env));
    const state = await dependencies.createOwnedState();
    tempPaths = [state.tempRoot, state.cutoverRoot];
    await interruptible(dependencies.writeAuthorization(state.authorizationPath));
    const ledger = await interruptible(dependencies.openLedger(state.ledgerPath));
    const reservation = await interruptible(dependencies.calculateIndexReservation(dependencies.env));
    const snapshot = await interruptible(ledger.snapshot());
    if (reservation > snapshot.availableMicroUsd) {
      throw new Error('indexing reservation does not fit the monthly budget');
    }
    databaseStartup = dependencies.startDatabase(startupController.signal);
    database = await interruptible(databaseStartup);
    extras.push(database.databaseUrl);
    const hmac = randomBytes(32).toString('hex');
    extras.push(hmac);
    const liveEnv: NodeJS.ProcessEnv = {
      ...dependencies.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(ports.nest),
      FORM_THOUGHT_PUBLIC_ASK_MODE: 'provider',
      FORM_THOUGHT_DATABASE_URL: database.databaseUrl,
      FORM_THOUGHT_CONTENT_RELEASE_ROOT: dependencies.env.FORM_THOUGHT_CONTENT_RELEASE_ROOT
        ?? resolve(repositoryRoot, 'build/public-releases'),
      FORM_THOUGHT_ANSWER_RELEASE_ROOT: dependencies.env.FORM_THOUGHT_ANSWER_RELEASE_ROOT
        ?? resolve(repositoryRoot, 'build/public-answer-releases'),
      FORM_THOUGHT_CORPUS_APPROVAL_PATH: dependencies.env.FORM_THOUGHT_CORPUS_APPROVAL_PATH
        ?? resolve(repositoryRoot, 'src/data/public-answer-corpus-approval.v1.json'),
      FORM_THOUGHT_NETWORK_HMAC_SECRET: hmac,
      FORM_THOUGHT_PROVIDER_EMBEDDING_RECEIPT_ROOT: state.embeddingReceiptRoot,
      FORM_THOUGHT_PUBLIC_ORIGIN: `http://127.0.0.1:${ports.proxy}`,
      FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION: state.authorizationPath,
      FORM_THOUGHT_LOCAL_BUDGET_LEDGER: state.ledgerPath,
      FORM_THOUGHT_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      FORM_THOUGHT_SERVER_REPLICA_COUNT: '1',
    };
    delete liveEnv.FORM_THOUGHT_OPENAI_DATA_CONTROL_RECEIPT;
    const publicEnv: NodeJS.ProcessEnv = { ...liveEnv };
    delete publicEnv.OPENAI_API_KEY;
    await interruptible(dependencies.migrate(liveEnv));
    await interruptible(dependencies.index(liveEnv));
    await interruptible(dependencies.reopenBinding(liveEnv));
    await interruptible(dependencies.buildSite({ ...publicEnv, FORM_THOUGHT_LOCAL_LIVE_DISCLOSURE: 'true' }));
    const deadlineAt = dependencies.clock() + dependencies.startupDeadlineMs;
    const awaitChild = async (child: OwnedLiveProcess) => {
      children.push(child);
      void child.wait.catch(() => undefined);
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('owned child startup deadline elapsed')),
          Math.max(0, deadlineAt - dependencies.clock()),
        );
        timer.unref();
      });
      try {
        await interruptible(Promise.race([
          child.startup,
          child.wait.then(
            () => { throw new Error(`owned ${child.role} exited before startup acknowledgement`); },
            (error) => { throw error instanceof Error ? error : new Error(String(error)); },
          ),
          timedOut,
        ]));
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    await awaitChild(dependencies.startNest(liveEnv, ports.nest));
    await awaitChild(dependencies.startPreview(publicEnv, ports.preview));
    await awaitChild(dependencies.startProxy(publicEnv, {
      listenPort: ports.proxy,
      previewPort: ports.preview,
      nestPort: ports.nest,
      pidFile: join(state.cutoverRoot, 'proxy.pid'),
    }));
    // local-proxy does not forward /health; readiness is Nest /health/ready plus proxy /search/.
    for (const url of [
      `http://127.0.0.1:${ports.nest}/health/ready`,
      `http://127.0.0.1:${ports.proxy}/search/`,
    ]) {
      while (!await dependencies.ready(url)) {
        if (dependencies.clock() >= deadlineAt) throw new Error('owned stack readiness deadline elapsed');
        await interruptible(Promise.race([
          dependencies.sleep(100),
          ...children.map((child) => child.wait.then(() => {
            throw new Error(`owned ${child.role} exited before readiness`);
          })),
        ]));
      }
    }
    dependencies.print(`http://127.0.0.1:${ports.proxy}/search/\n`);
    await interruptible(dependencies.waitAttached());
  } catch (error) {
    primary = error;
  } finally {
    removeSignals();
    const stopped = await stopOwnedChildrenInReverse(children, {
      sleep: dependencies.sleep,
      gracefulMs: 10_000,
      killMs: 2_000,
    });
    if (!stopped.confirmed) childTerminationUnconfirmed = true;
    if (!database && databaseStartup) {
      database = await databaseStartup.catch(() => undefined);
    }
    if (childTerminationUnconfirmed) {
      primary ??= new Error('owned child termination was not confirmed; database retained for owned-process safety');
    } else {
      try {
        await database?.stop();
      } catch (error) {
        primary ??= error;
      }
      if (tempPaths.length > 0) {
        try {
          await dependencies.removeTempState(tempPaths);
        } catch (error) {
          primary ??= error;
        }
      }
    }
  }
  if (childTerminationUnconfirmed) {
    throw redact(new Error('owned child termination was not confirmed; database retained for owned-process safety'));
  }
  if (primary !== undefined) throw redact(primary);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    await runLocalLiveHarness(parseLocalLiveArguments(process.argv.slice(2)));
  } catch (error) {
    const message = redactLiveDiagnostics(
      error instanceof Error ? error.message : String(error),
      process.env,
    );
    process.stderr.write(`${message}\n`);
    process.exitCode = /interrupted by SIGINT/u.test(message) ? 130
      : /interrupted by SIGTERM/u.test(message) ? 143
        : 1;
  }
}
