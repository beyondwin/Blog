import { spawn, execFile as execFileCallback, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, '../..');
const tsx = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const compose = resolve(root, 'apps/server/compose.test.yml');
const outputRoot = resolve(root, 'output/playwright/task8');
const rawQuestions = [
  'AI 시대에도 왜 계속 책을 읽나요?',
  'Graphify',
  'Graphify를 공개 기록에서 찾아주세요',
];

function redactRawQuestions(value: string): string {
  return rawQuestions.reduce((output, question) => output.replaceAll(question, '[raw-question-redacted]'), value);
}

interface OwnedChild {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

interface ObserverReceipt {
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
  const owned: OwnedChild = {
    child,
    output: () => text,
    exited,
    async stop(signal = 'SIGINT') {
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

async function runPlaywright(tag: string, proxyOrigin: string, previewOrigin: string, apiOrigin: string) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  Object.assign(env, {
    FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
    FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: proxyOrigin,
    FORM_THOUGHT_E2E_PREVIEW_ORIGIN: previewOrigin,
    FORM_THOUGHT_E2E_API_ORIGIN: apiOrigin,
  });
  const child = spawnOwned(process.execPath, [
    resolve(root, 'node_modules/@playwright/test/cli.js'),
    'test', 'tests/e2e/search-provider.spec.ts', '--project=chromium-151', '--grep', tag,
  ], env);
  const result = await child.exited;
  if (result.code !== 0) throw new Error(`Playwright ${tag} failed\n${child.output()}`);
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

async function postgresReceipt(fixturePid: number) {
  const project = `beyondwin-public-answer-serve-${fixturePid}`;
  const { stdout } = await execFile('docker', ['compose', '-p', project, '-f', compose, 'port', 'postgres', '5432'], { cwd: root });
  const port = Number(stdout.trim().slice(stdout.trim().lastIndexOf(':') + 1));
  if (!Number.isSafeInteger(port)) throw new Error('fixture Postgres port receipt is invalid');
  const pool = new Pool({ connectionString: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test` });
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

async function runFixtureCell(input: {
  tag: string;
  scenario: 'success' | 'provider-disabled' | 'insufficient-evidence' | 'unavailable' | 'timeout' | 'release-mismatch' | 'slow-sql';
  previewOrigin: string;
  root: string;
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
  try {
    await waitHttp(`${apiOrigin}/health/ready`, fixture);
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
    await runPlaywright(input.tag, proxyOrigin, input.previewOrigin, apiOrigin);
    const expectedRequests = input.tag === '@success-core' ? 2
      : input.tag === '@navigation' ? 0
        : input.tag === '@rate-limit' ? 4
          : input.tag === '@viewport' ? 2
          : 1;
    assertPrivacyReceipts(observer.receipts, expectedRequests);
    await writeFile(resolve(input.root, `${input.tag.slice(1)}-observer.json`), `${JSON.stringify(observer.receipts, null, 2)}\n`);
    if (input.scenario === 'slow-sql') {
      if (!fixture.child.pid) throw new Error('fixture process PID unavailable');
      const receipt = await postgresReceipt(fixture.child.pid);
      if (!receipt.noSleepingQuery || !receipt.poolRecovered) throw new Error('slow SQL cancellation receipt failed');
      await writeFile(resolve(input.root, 'slow-sql-postgres.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    }
  } catch (error) {
    throw new Error(
      `fixture cell ${input.tag} failed; observer=${JSON.stringify(observer?.receipts ?? [])}; `
      + `fixture-exit=${String(fixture.child.exitCode ?? fixture.child.signalCode ?? 'running')}; `
      + `fixture-log=${JSON.stringify(redactRawQuestions(fixture.output()))}; `
      + `proxy-log=${JSON.stringify(redactRawQuestions(proxy?.output() ?? ''))}`,
      { cause: error },
    );
  } finally {
    await proxy?.stop();
    if (observer) await closeServer(observer.server);
    await fixture.stop();
    const logs = fixture.output() + (proxy?.output() ?? '');
    if (rawQuestions.some((question) => logs.includes(question))) throw new Error('owned server logs contain a raw question');
    await rm(cutoverRoot, { recursive: true, force: true });
  }
}

async function runRedirectCell(status: 307 | 308, previewOrigin: string, receiptRoot: string) {
  const [proxyPort, firstPort, trapPort, apiPort] = await distinctPorts(4);
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
  try {
    await waitHttp(`${proxyOrigin}/search/`, proxy);
    await runPlaywright(`@redirect-${status}`, proxyOrigin, previewOrigin, `http://127.0.0.1:${apiPort}`);
    if (redirect.trap.connections !== 0 || redirect.trap.headerCount !== 0 || redirect.trap.bodyBytes !== 0) {
      throw new Error(`redirect ${status} reached the second hop`);
    }
    await writeFile(resolve(receiptRoot, `redirect-${status}.json`), `${JSON.stringify(redirect.trap, null, 2)}\n`);
  } finally {
    await proxy.stop();
    await Promise.all([closeServer(redirect.firstServer), closeServer(redirect.trapServer)]);
    await rm(cutoverRoot, { recursive: true, force: true });
  }
}

export async function runSearchProviderStack() {
  if (process.env.OPENAI_API_KEY !== undefined) throw new Error('search provider fixture stack refuses OPENAI_API_KEY');
  await mkdir(outputRoot, { recursive: true });
  const receiptRoot = await mkdtemp('/tmp/beyondwin-search-provider-stack.');
  const [previewPort] = await distinctPorts(1);
  const previewOrigin = `http://127.0.0.1:${previewPort}`;
  const preview = spawnOwned('npm', ['run', 'site:preview', '--', '--host', '127.0.0.1', '--port', String(previewPort)]);
  const onSignal = () => {
    for (const child of [...activeChildren]) void child.stop('SIGTERM');
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await waitHttp(`${previewOrigin}/search/`, preview);
    for (const [tag, scenario] of [
      ['@success-core', 'success'],
      ['@provider-disabled', 'provider-disabled'],
      ['@insufficient-evidence', 'insufficient-evidence'],
      ['@unavailable', 'unavailable'],
      ['@timeout', 'timeout'],
      ['@release-mismatch', 'release-mismatch'],
      ['@navigation', 'success'],
      ['@canonical-fallback', 'insufficient-evidence'],
      ['@slow-sql', 'slow-sql'],
      ['@rate-limit', 'success'],
      ['@viewport', 'success'],
    ] as const) {
      await runFixtureCell({ tag, scenario, previewOrigin, root: receiptRoot });
    }
    await runRedirectCell(307, previewOrigin, receiptRoot);
    await runRedirectCell(308, previewOrigin, receiptRoot);
    const receiptFiles = (await Promise.all([
      'success-core-observer.json', 'slow-sql-postgres.json', 'redirect-307.json', 'redirect-308.json',
    ].map(async (name) => ({ name, bytes: (await readFile(resolve(receiptRoot, name))).byteLength }))));
    await writeFile(resolve(outputRoot, 'search-provider-stack-summary.json'), `${JSON.stringify({
      fixtureMode: true,
      liveProviderCalls: 0,
      scenarios: 13,
      receiptFiles,
      productionAvatarDerivative: 'not_authorized',
      productionAvatarPerformance: 'not_measured',
    }, null, 2)}\n`);
    process.stdout.write('search provider stack: PASS (13 owned cells, fixture mode, live provider calls 0)\n');
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await preview.stop();
    if (rawQuestions.some((question) => preview.output().includes(question))) throw new Error('preview logs contain a raw question');
    await rm(receiptRoot, { recursive: true, force: true });
  }
}

await runSearchProviderStack();
