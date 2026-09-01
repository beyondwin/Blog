import { spawn, execFile as execFileCallback, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, '../..');
const tsx = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const compose = resolve(root, 'apps/server/compose.test.yml');
const outputRoot = resolve(root, 'output/playwright/task8');
const rawQuestions = [
  'AI 시대에도 왜 계속 책을 읽나요?',
  'AI 시대에도 왜 책을 계속 읽어야 하나요?',
  'Graphify',
  'Graphify를 공개 기록에서 찾아주세요',
  'AI',
  '---',
  '가'.repeat(120),
];

export function scrubDiagnostic(value: string, drivenValues: readonly string[] = rawQuestions): string {
  return [...new Set(drivenValues)].filter(Boolean).sort((left, right) => right.length - left.length)
    .reduce((output, drivenValue) => output.replaceAll(drivenValue, '[driven-value]'), value);
}

type Cleanup = readonly [name: string, operation: () => Promise<unknown>];

export interface CleanupRegistry {
  register(name: string, operation: () => Promise<unknown>): () => Promise<unknown>;
  entries(): readonly Cleanup[];
  forget(name: string): void;
}

export function createCleanupRegistry(): CleanupRegistry {
  const operations = new Map<string, () => Promise<unknown>>();
  return Object.freeze({
    register(name: string, operation: () => Promise<unknown>) {
      if (operations.has(name)) throw new Error(`duplicate owned cleanup: ${name}`);
      let inFlight: Promise<unknown> | undefined;
      const cleanup = () => {
        inFlight ??= Promise.resolve().then(operation).finally(() => {
          if (operations.get(name) === cleanup) operations.delete(name);
        });
        return inFlight;
      };
      operations.set(name, cleanup);
      return cleanup;
    },
    entries: () => [...operations.entries()],
    forget(name: string) { operations.delete(name); },
  });
}

export async function settleCleanup(primary: unknown, cleanups: readonly Cleanup[]): Promise<unknown> {
  const results = await Promise.allSettled(cleanups.map(([, operation]) => operation()));
  const cleanupErrors = results.flatMap((result, index) => result.status === 'rejected'
    ? [new Error(`${cleanups[index]![0]} cleanup: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)]
    : []);
  if (cleanupErrors.length === 0) return primary;
  return new AggregateError(primary === undefined ? cleanupErrors : [primary, ...cleanupErrors], 'owned resource cleanup failed');
}

export async function publishEvidenceDirectory(staging: string, destination: string): Promise<void> {
  const backup = `${destination}.previous-${String(process.pid)}-${String(Date.now())}`;
  let previousMoved = false;
  try {
    await rename(destination, backup);
    previousMoved = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(staging, destination);
  } catch (error) {
    if (previousMoved) await rename(backup, destination);
    throw error;
  }
  if (previousMoved) await rm(backup, { force: true, recursive: true });
}

interface OwnedChild {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

export interface ObserverReceipt {
  authorizationPresent: boolean;
  constructedForEqualsPeer: boolean;
  constructedHostEqualsProxy: boolean;
  constructedProtoHttp: boolean;
  cookiePresent: boolean;
  forwardedPresent: boolean;
  proxyAuthorizationPresent: boolean;
  refererPresent: boolean;
  unexpectedForwardedPresent: boolean;
  xRealIpPresent: boolean;
}

const activeChildren = new Set<OwnedChild>();
const cleanupRegistry = createCleanupRegistry();

function registerCleanup(name: string, operation: () => Promise<unknown>): () => Promise<unknown> {
  return cleanupRegistry.register(name, operation);
}

interface RunnerSignalSource {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  removeListener(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

export function installRunnerSignalHandlers(input: {
  source?: RunnerSignalSource;
  children: () => readonly Pick<OwnedChild, 'stop'>[];
  cleanups: () => readonly Cleanup[];
}) {
  const source = input.source ?? process;
  let interrupted: 'SIGINT' | 'SIGTERM' | undefined;
  let cleanupOutcome: Promise<unknown> | undefined;
  const handle = (signal: 'SIGINT' | 'SIGTERM') => {
    if (cleanupOutcome) return;
    interrupted = signal;
    cleanupOutcome = settleCleanup(new Error(`runner interrupted by ${signal}`), [
      ...input.children().map((child, index) => [
        `signal-child-${String(index + 1)}`,
        async () => child.stop('SIGTERM'),
      ] as const),
      ...input.cleanups(),
    ]);
  };
  const onInt = () => handle('SIGINT');
  const onTerm = () => handle('SIGTERM');
  source.once('SIGINT', onInt);
  source.once('SIGTERM', onTerm);
  return Object.freeze({
    interrupted: () => interrupted,
    outcome: () => cleanupOutcome ?? Promise.resolve(undefined),
    remove() {
      source.removeListener('SIGINT', onInt);
      source.removeListener('SIGTERM', onTerm);
    },
  });
}

function mergeFailures(primary: unknown, secondary: unknown): unknown {
  if (primary === undefined) return secondary;
  if (secondary === undefined) return primary;
  return new AggregateError([primary, secondary], 'runner and signal cleanup failed');
}

function spawnOwned(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): OwnedChild {
  const child = spawn(command, [...args], {
    cwd: root,
    env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout?.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => accept({ code, signal }));
  });
  let stopping: Promise<void> | undefined;
  const stopProcess = async (signal: NodeJS.Signals) => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise<false>((accept) => setTimeout(accept, 10_000, false)),
    ]);
    if (stopped) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    await Promise.race([exited, new Promise((accept) => setTimeout(accept, 2_000))]);
  };
  const owned: OwnedChild = {
    child,
    output: () => text,
    exited,
    stop(signal = 'SIGINT') {
      stopping ??= stopProcess(signal);
      return stopping;
    },
  };
  activeChildren.add(owned);
  void exited.then(
    () => activeChildren.delete(owned),
    () => activeChildren.delete(owned),
  );
  return owned;
}

async function freePort(): Promise<number> {
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

async function distinctPorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

async function waitHttp(url: string, child: OwnedChild, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.child.exitCode !== null || child.child.signalCode !== null) {
      throw new Error(`owned process exited before readiness\n${child.output()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch { /* retry until bounded deadline */ }
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error(`owned process readiness deadline elapsed for ${url}\n${child.output()}`);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}

function firstHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function startObserver(port: number, apiPort: number, proxyPort: number) {
  const receipts: ObserverReceipt[] = [];
  const server = http.createServer((request, response) => {
    const forwardedFor = firstHeader(request.headers, 'x-forwarded-for');
    const forwardedHost = firstHeader(request.headers, 'x-forwarded-host');
    const forwardedProto = firstHeader(request.headers, 'x-forwarded-proto');
    receipts.push({
      authorizationPresent: request.headers.authorization !== undefined,
      constructedForEqualsPeer: forwardedFor === '127.0.0.1' || forwardedFor === '::ffff:127.0.0.1',
      constructedHostEqualsProxy: forwardedHost === `127.0.0.1:${proxyPort}`,
      constructedProtoHttp: forwardedProto === 'http',
      cookiePresent: request.headers.cookie !== undefined,
      forwardedPresent: request.headers.forwarded !== undefined,
      proxyAuthorizationPresent: request.headers['proxy-authorization'] !== undefined,
      refererPresent: request.headers.referer !== undefined,
      unexpectedForwardedPresent: Object.keys(request.headers).some((name) => (
        name.startsWith('x-forwarded-') && !['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].includes(name)
      )),
      xRealIpPresent: request.headers['x-real-ip'] !== undefined,
    });
    const upstream = http.request({
      host: '127.0.0.1',
      port: apiPort,
      method: request.method,
      path: request.url,
      headers: request.headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    const abort = () => upstream.destroy();
    request.once('aborted', abort);
    response.once('close', () => { if (!response.writableEnded) abort(); });
    upstream.once('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('observer upstream unavailable');
    });
    request.pipe(upstream);
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return { server, receipts };
}

async function startRedirectStub(firstPort: number, trapPort: number, status: 307 | 308) {
  const trap = { bodyBytes: 0, connections: 0, headerCount: 0 };
  const trapServer = http.createServer((request, response) => {
    trap.connections += 1;
    trap.headerCount += Object.keys(request.headers).length;
    request.on('data', (chunk: Buffer) => { trap.bodyBytes += chunk.byteLength; });
    response.writeHead(204).end();
  });
  const firstServer = http.createServer((request, response) => {
    request.resume();
    response.writeHead(status, { location: `http://127.0.0.1:${trapPort}/trap` }).end();
  });
  await Promise.all([
    new Promise<void>((accept, reject) => { trapServer.once('error', reject); trapServer.listen(trapPort, '127.0.0.1', accept); }),
    new Promise<void>((accept, reject) => { firstServer.once('error', reject); firstServer.listen(firstPort, '127.0.0.1', accept); }),
  ]);
  return { firstServer, trapServer, trap };
}

async function runPlaywright(
  tag: string,
  proxyOrigin: string,
  previewOrigin: string,
  apiOrigin: string,
  evidenceRoot: string,
  databaseUrl?: string,
) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  Object.assign(env, {
    FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
    FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: proxyOrigin,
    FORM_THOUGHT_E2E_PREVIEW_ORIGIN: previewOrigin,
    FORM_THOUGHT_E2E_API_ORIGIN: apiOrigin,
    FORM_THOUGHT_E2E_EVIDENCE_ROOT: evidenceRoot,
  });
  if (databaseUrl) env.FORM_THOUGHT_E2E_DATABASE_URL = databaseUrl;
  else delete env.FORM_THOUGHT_E2E_DATABASE_URL;
  const child = spawnOwned(process.execPath, [
    resolve(root, 'node_modules/@playwright/test/cli.js'),
    'test', 'tests/e2e/search-provider.spec.ts', '--project=chromium-151', '--grep', tag,
  ], env);
  const result = await child.exited;
  if (result.code !== 0) throw new Error(scrubDiagnostic(`Playwright ${tag} failed\n${child.output()}`));
  process.stdout.write(child.output());
}

async function hostileHeaderProbe(proxyPort: number) {
  const body = JSON.stringify({
    version: 1,
    question: 'Graphify',
    contentReleaseId: '0'.repeat(64),
    answerReleaseId: '0'.repeat(64),
  });
  await new Promise<void>((accept, reject) => {
    const request = http.request({
      host: '127.0.0.1', port: proxyPort, path: '/api/public/ask', method: 'POST',
      headers: {
        host: `127.0.0.1:${proxyPort}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        authorization: 'Bearer must-not-cross',
        cookie: 'hostile=must-not-cross',
        forwarded: 'for=192.0.2.1',
        'proxy-authorization': 'Basic must-not-cross',
        referer: 'https://hostile.invalid/',
        'x-forwarded-for': '192.0.2.2',
        'x-forwarded-host': 'hostile.invalid',
        'x-forwarded-proto': 'https',
        'x-forwarded-sentinel': 'must-not-cross',
        'x-real-ip': '192.0.2.3',
      },
    }, (response) => { response.resume(); response.once('end', accept); });
    request.once('error', reject);
    request.end(body);
  });
}

async function fixtureDatabaseUrl(fixturePid: number) {
  const project = `beyondwin-public-answer-serve-${fixturePid}`;
  const { stdout } = await execFile('docker', ['compose', '-p', project, '-f', compose, 'port', 'postgres', '5432'], { cwd: root });
  const port = Number(stdout.trim().slice(stdout.trim().lastIndexOf(':') + 1));
  if (!Number.isSafeInteger(port)) throw new Error('fixture Postgres port receipt is invalid');
  return `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`;
}

async function postgresReceipt(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    let active = 1;
    for (let attempt = 0; attempt < 100 && active > 0; attempt += 1) {
      const result = await pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM pg_stat_activity
        WHERE datname=current_database() AND query LIKE 'SELECT pg_sleep(30)%' AND state='active'
      `);
      active = Number(result.rows[0]!.count);
      if (active > 0) await new Promise((accept) => setTimeout(accept, 20));
    }
    const recovered = (await pool.query<{ recovered: number }>('SELECT 1 AS recovered')).rows[0]?.recovered === 1;
    return { noSleepingQuery: active === 0, poolRecovered: recovered };
  } finally { await pool.end(); }
}

function assertPrivacyReceipts(receipts: readonly ObserverReceipt[], expectedCount: number) {
  if (receipts.length !== expectedCount) {
    throw new Error(`API observer recorded ${String(receipts.length)} requests, expected ${String(expectedCount)}`);
  }
  for (const receipt of receipts) {
    if (receipt.authorizationPresent || receipt.cookiePresent || receipt.forwardedPresent
      || receipt.proxyAuthorizationPresent || receipt.refererPresent || receipt.unexpectedForwardedPresent
      || receipt.xRealIpPresent || !receipt.constructedForEqualsPeer
      || !receipt.constructedHostEqualsProxy || !receipt.constructedProtoHttp) {
      throw new Error(`API observer privacy receipt failed: ${JSON.stringify(receipt)}`);
    }
  }
}

export function canonicalObserverEvidence(receipts: readonly ObserverReceipt[], expectedRequestCount: number) {
  const canonicalReceipts = receipts.map((receipt) => ({
    authorizationPresent: receipt.authorizationPresent,
    constructedForEqualsPeer: receipt.constructedForEqualsPeer,
    constructedHostEqualsProxy: receipt.constructedHostEqualsProxy,
    constructedProtoHttp: receipt.constructedProtoHttp,
    cookiePresent: receipt.cookiePresent,
    forwardedPresent: receipt.forwardedPresent,
    proxyAuthorizationPresent: receipt.proxyAuthorizationPresent,
    refererPresent: receipt.refererPresent,
    unexpectedForwardedPresent: receipt.unexpectedForwardedPresent,
    xRealIpPresent: receipt.xRealIpPresent,
  }));
  const receiptChecksum = `sha256:${createHash('sha256').update(JSON.stringify(canonicalReceipts)).digest('hex')}`;
  return Object.freeze({
    requestCount: canonicalReceipts.length,
    expectedRequestCount,
    receiptChecksum,
    receipts: Object.freeze(canonicalReceipts),
  });
}

async function runFixtureCell(input: {
  tag: string;
  scenario: 'success' | 'provider-disabled' | 'insufficient-evidence' | 'unavailable' | 'timeout' | 'release-mismatch' | 'slow-sql' | 'stress-max' | 'replace-active';
  previewOrigin: string;
  root: string;
  evidenceRoot: string;
  expectedRequests: number;
}) {
  const [proxyPort, observerPort, apiPort] = await distinctPorts(3);
  const proxyOrigin = `http://127.0.0.1:${proxyPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  const fixture = spawnOwned(process.execPath, [
    '--import', 'tsx', resolve(root, 'apps/server/scripts/with-test-postgres.mts'),
    'serve-fixture', '--host', '127.0.0.1', '--port', String(apiPort),
    '--public-origin', proxyOrigin, '--fixture-scenario', input.scenario,
  ], env);
  let observer: Awaited<ReturnType<typeof startObserver>> | undefined;
  let proxy: OwnedChild | undefined;
  const cutoverRoot = await mkdtemp('/tmp/beyondwin-cutover.');
  let primary: unknown;
  try {
    await waitHttp(`${apiOrigin}/health/ready`, fixture);
    const databaseUrl = input.scenario === 'slow-sql' || input.scenario === 'replace-active'
      ? await fixtureDatabaseUrl(fixture.child.pid!)
      : undefined;
    observer = await startObserver(observerPort, apiPort, proxyPort);
    proxy = spawnOwned(process.execPath, [
      tsx, resolve(root, 'scripts/cutover/local-proxy.mts'),
      '--listen', `127.0.0.1:${proxyPort}`,
      '--react', input.previewOrigin,
      '--api', `http://127.0.0.1:${observerPort}`,
      '--pid-file', `${cutoverRoot}/proxy.pid`,
    ], env);
    await waitHttp(`${proxyOrigin}/search/`, proxy);
    if (input.tag === '@success-core') await hostileHeaderProbe(proxyPort);
    await runPlaywright(input.tag, proxyOrigin, input.previewOrigin, apiOrigin, input.evidenceRoot, databaseUrl);
    assertPrivacyReceipts(observer.receipts, input.expectedRequests);
    await writeFile(resolve(input.root, `${input.tag.slice(1)}-observer.json`), `${JSON.stringify(
      canonicalObserverEvidence(observer.receipts, input.expectedRequests), null, 2,
    )}\n`);
    if (databaseUrl) {
      const receipt = await postgresReceipt(databaseUrl);
      if (!receipt.noSleepingQuery || !receipt.poolRecovered) throw new Error('slow SQL cancellation receipt failed');
      await writeFile(resolve(input.root, `${input.tag.slice(1)}-postgres.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    }
  } catch (error) {
    primary = new Error(scrubDiagnostic(
      `fixture cell ${input.tag} failed; observer=${JSON.stringify(observer?.receipts ?? [])}; `
      + `fixture-exit=${String(fixture.child.exitCode ?? fixture.child.signalCode ?? 'running')}; `
      + `failure=${error instanceof Error ? error.message : String(error)}; `
      + `fixture-log=${JSON.stringify(scrubDiagnostic(fixture.output()))}; `
      + `proxy-log=${JSON.stringify(scrubDiagnostic(proxy?.output() ?? ''))}`,
    ));
  } finally {
    const logs = fixture.output() + (proxy?.output() ?? '');
    if (rawQuestions.some((question) => logs.includes(question))) primary ??= new Error('owned server logs contain a raw question');
    const settled = await settleCleanup(primary, [
      ['proxy', async () => proxy?.stop()],
      ['observer', async () => { if (observer) await closeServer(observer.server); }],
      ['fixture', async () => fixture.stop()],
      ['cutover-root', async () => rm(cutoverRoot, { recursive: true, force: true })],
    ]);
    if (settled !== undefined) throw settled;
  }
}

async function runRedirectCell(status: 307 | 308, previewOrigin: string, receiptRoot: string) {
  const [proxyPort, firstPort, trapPort] = await distinctPorts(3);
  const proxyOrigin = `http://127.0.0.1:${proxyPort}`;
  const redirect = await startRedirectStub(firstPort, trapPort, status);
  const cutoverRoot = await mkdtemp('/tmp/beyondwin-cutover.');
  const proxy = spawnOwned(process.execPath, [
    tsx, resolve(root, 'scripts/cutover/local-proxy.mts'),
    '--listen', `127.0.0.1:${proxyPort}`,
    '--react', previewOrigin,
    '--api', `http://127.0.0.1:${firstPort}`,
    '--pid-file', `${cutoverRoot}/proxy.pid`,
  ]);
  let primary: unknown;
  try {
    await waitHttp(`${proxyOrigin}/search/`, proxy);
    await runPlaywright(`@redirect-${status}`, proxyOrigin, previewOrigin, `http://127.0.0.1:${firstPort}`, receiptRoot);
    if (redirect.trap.connections !== 0 || redirect.trap.headerCount !== 0 || redirect.trap.bodyBytes !== 0) {
      throw new Error(`redirect ${status} reached the second hop`);
    }
    await writeFile(resolve(receiptRoot, `redirect-${status}.json`), `${JSON.stringify(redirect.trap, null, 2)}\n`);
  } catch (error) {
    primary = new Error(scrubDiagnostic(`redirect ${String(status)} cell failed: ${error instanceof Error ? error.message : String(error)}; proxy-log=${proxy.output()}`));
  } finally {
    const settled = await settleCleanup(primary, [
      ['redirect-proxy', async () => proxy.stop()],
      ['redirect-first-hop', async () => closeServer(redirect.firstServer)],
      ['redirect-trap', async () => closeServer(redirect.trapServer)],
      ['redirect-cutover-root', async () => rm(cutoverRoot, { recursive: true, force: true })],
    ]);
    if (settled !== undefined) throw settled;
  }
}

async function hashTree(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(current: string, relative = ''): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) {
        hash.update(childRelative, 'utf8');
        hash.update('\0');
        hash.update(await readFile(child));
        hash.update('\0');
      }
    }
  }
  await visit(directory);
  return `sha256:${hash.digest('hex')}`;
}

async function sourceHash(): Promise<string> {
  const { stdout } = await execFile('git', ['ls-files', '-z', '--', 'apps/site', 'apps/server', 'packages/content', 'src', 'scripts/cutover', 'tests/e2e']);
  const files = stdout.split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file, 'utf8');
    hash.update('\0');
    hash.update(await readFile(resolve(root, file)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function runOwnedCommand(command: string, args: readonly string[], label: string): Promise<void> {
  const child = spawnOwned(command, args);
  const result = await child.exited;
  if (result.code !== 0) throw new Error(scrubDiagnostic(`${label} failed\n${child.output()}`));
  process.stdout.write(child.output());
}

export async function runSearchProviderStack() {
  if (process.env.OPENAI_API_KEY !== undefined) throw new Error('search provider fixture stack refuses OPENAI_API_KEY');
  const outputParent = resolve(root, 'output/playwright');
  await mkdir(outputParent, { recursive: true });
  const stagingRoot = await mkdtemp(resolve(outputParent, '.task8-stage-'));
  const stagingCleanup = registerCleanup('staging-root', async () => rm(stagingRoot, { recursive: true, force: true }));
  let preview: OwnedChild | undefined;
  let previewCleanup: (() => Promise<unknown>) | undefined;
  const signals = installRunnerSignalHandlers({
    children: () => [...activeChildren],
    cleanups: () => cleanupRegistry.entries(),
  });
  let primary: unknown;
  try {
    const receiptRoot = resolve(stagingRoot, 'receipts');
    await mkdir(receiptRoot, { recursive: true });
    await runOwnedCommand('npm', ['run', 'site:build'], 'fresh site build');
    const { stdout: head } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: root });
    const contentActive = JSON.parse(await readFile(resolve(root, 'build/public-releases/active.json'), 'utf8')) as { releaseId: string };
    const answerActive = JSON.parse(await readFile(resolve(root, 'build/public-answer-releases/active.json'), 'utf8')) as { releaseId?: string; answerReleaseId?: string };
    const buildReceipt = {
      built: true,
      commit: head.trim(),
      sourceHash: await sourceHash(),
      clientBuildHash: await hashTree(resolve(root, 'apps/site/build/client')),
      contentReleaseId: contentActive.releaseId,
      answerReleaseId: answerActive.answerReleaseId ?? answerActive.releaseId,
    };
    await writeFile(resolve(receiptRoot, 'build-receipt.json'), `${JSON.stringify(buildReceipt, null, 2)}\n`);
    const [previewPort] = await distinctPorts(1);
    const previewOrigin = `http://127.0.0.1:${previewPort}`;
    preview = spawnOwned('npm', ['run', 'site:preview', '--', '--host', '127.0.0.1', '--port', String(previewPort)]);
    previewCleanup = registerCleanup('preview', async () => preview?.stop());
    await waitHttp(`${previewOrigin}/search/`, preview);
    const fixtureCells = [
      ['@success-core', 'success', 2],
      ['@provider-disabled', 'provider-disabled', 1],
      ['@insufficient-evidence', 'insufficient-evidence', 1],
      ['@unavailable', 'unavailable', 1],
      ['@timeout', 'timeout', 1],
      ['@release-mismatch', 'release-mismatch', 1],
      ['@unsupported', 'success', 1],
      ['@second-submit', 'replace-active', 2],
      ['@navigation', 'success', 0],
      ['@canonical-fallback', 'insufficient-evidence', 1],
      ['@popstate-active', 'slow-sql', 1],
      ['@slow-sql', 'slow-sql', 1],
      ['@rate-limit', 'success', 4],
      ['@viewport-desktop', 'success', 3],
      ['@viewport-tablet', 'success', 3],
      ['@viewport-mobile', 'success', 3],
      ['@viewport-minimum', 'success', 3],
      ['@viewport-short', 'success', 3],
      ['@stress-max', 'stress-max', 1],
    ] as const;
    const focusedTag = process.env.FORM_THOUGHT_STACK_FOCUSED_TAG;
    if (focusedTag && !fixtureCells.some(([tag]) => tag === focusedTag)) {
      throw new Error('FORM_THOUGHT_STACK_FOCUSED_TAG is not an allowlisted fixture cell');
    }
    for (const [tag, scenario, expectedRequests] of fixtureCells.filter(([tag]) => !focusedTag || tag === focusedTag)) {
      if (signals.interrupted()) throw new Error(`runner interrupted by ${signals.interrupted()}`);
      await runFixtureCell({ tag, scenario, expectedRequests, previewOrigin, root: receiptRoot, evidenceRoot: stagingRoot });
    }
    if (focusedTag) {
      process.stdout.write(`search provider stack focused cell: PASS (${focusedTag})\n`);
      return;
    }
    await runRedirectCell(307, previewOrigin, receiptRoot);
    await runRedirectCell(308, previewOrigin, receiptRoot);
    const receiptFiles = (await readdir(receiptRoot)).sort();
    await writeFile(resolve(stagingRoot, 'search-provider-stack-summary.json'), `${JSON.stringify({
      status: 'PASS',
      fixtureMode: true,
      liveProviderCalls: 0,
      scenarios: 21,
      receiptFiles,
      buildReceipt,
      productionAvatarDerivative: 'not_authorized',
      productionAvatarPerformance: 'not_measured',
    }, null, 2)}\n`);
    cleanupRegistry.forget('staging-root');
    await publishEvidenceDirectory(stagingRoot, outputRoot);
    process.stdout.write('search provider stack: PASS (21 owned cells, fixture mode, live provider calls 0)\n');
  } catch (error) {
    primary = error;
  } finally {
    signals.remove();
    primary = mergeFailures(primary, await signals.outcome());
    if (preview && rawQuestions.some((question) => preview.output().includes(question))) {
      primary ??= new Error('preview logs contain a raw question');
    }
    const settled = await settleCleanup(primary, [
      ['preview', async () => previewCleanup?.()],
      ['staging', stagingCleanup],
    ]);
    if (settled !== undefined) throw settled;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runSearchProviderStack();
}
