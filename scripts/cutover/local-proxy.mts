import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  realpath,
} from 'node:fs/promises';
import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ProxyTarget = 'react' | 'astro';

export interface ProxyArguments {
  check: boolean;
  listen: { host: '127.0.0.1' | '::1'; port: number };
  react: URL;
  astro: URL;
  statePath: string;
  pidFile?: string;
}

const allowedValueArguments = new Set(['--listen', '--react', '--astro', '--state', '--pid-file']);
const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const cutoverRootPattern = /^\/tmp\/beyondwin-cutover\.[A-Za-z0-9_-]+$/u;

function parseListen(value: string): ProxyArguments['listen'] {
  const match = value.match(/^(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/u);
  if (!match) throw new Error('--listen requires an exact loopback address and port');
  const port = Number(match[2]);
  if (port > 65_535) throw new Error('--listen port is out of range');
  return { host: match[1] === '[::1]' ? '::1' : '127.0.0.1', port };
}

function parseUpstream(label: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${label} requires one valid URL`, { cause: error });
  }
  if (url.protocol !== 'http:') throw new Error(`${label} permits HTTP only`);
  if (!['127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${label} permits exact loopback upstreams only`);
  }
  if (!url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} requires only an origin with an explicit port`);
  }
  return url;
}

export function parseProxyArguments(argv: readonly string[]): ProxyArguments {
  const values = new Map<string, string>();
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--check') {
      if (check) throw new Error('duplicate argument: --check');
      check = true;
      continue;
    }
    if (!allowedValueArguments.has(argument)) throw new Error(`unknown argument: ${argument}`);
    if (values.has(argument)) throw new Error(`duplicate argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires one value`);
    values.set(argument, value);
    index += 1;
  }
  for (const required of ['--listen', '--react', '--astro', '--state']) {
    if (!values.has(required)) throw new Error(`missing required argument: ${required}`);
  }
  if (!check && !values.has('--pid-file')) throw new Error('--pid-file is required at runtime');
  return {
    check,
    listen: parseListen(values.get('--listen')!),
    react: parseUpstream('--react', values.get('--react')!),
    astro: parseUpstream('--astro', values.get('--astro')!),
    statePath: resolve(values.get('--state')!),
    ...(values.has('--pid-file') ? { pidFile: resolve(values.get('--pid-file')!) } : {}),
  };
}

export async function assertOwnedCutoverPath(path: string): Promise<string> {
  const resolved = resolve(path);
  const root = dirname(resolved);
  if (!cutoverRootPattern.test(root)) {
    throw new Error('state and PID paths must be direct children of /tmp/beyondwin-cutover.*');
  }
  const state = await lstat(root);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error('cutover root must be one real directory, not a symbolic link');
  }
  if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
    throw new Error('cutover root must be owned by the current user');
  }
  const expectedRealPath = join(await realpath('/tmp'), basename(root));
  if (await realpath(root) !== expectedRealPath) throw new Error('cutover root real path changed');
  return root;
}

async function readStateFile(path: string): Promise<ProxyTarget> {
  await assertOwnedCutoverPath(path);
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error('proxy state must not be a symbolic link');
    }
    throw error;
  }
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1) throw new Error('proxy state must be one regular file');
    if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
      throw new Error('proxy state must be owned by the current user');
    }
    const value = (await handle.readFile('utf8')).trim();
    if (value !== 'react' && value !== 'astro') throw new Error('proxy state must be react or astro');
    return value;
  } finally {
    await handle.close();
  }
}

export async function prepareStateFile(path: string): Promise<ProxyTarget> {
  await assertOwnedCutoverPath(path);
  let created = false;
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
        throw new Error('proxy state must not be a symbolic link');
      }
      throw error;
    }
  }
  if (created && handle) {
    try {
      await handle.writeFile('react\n', 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  return readStateFile(path);
}

export async function writeProxyTarget(path: string, target: ProxyTarget): Promise<void> {
  if (target !== 'react' && target !== 'astro') throw new Error('proxy target must be react or astro');
  await readStateFile(path);
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.nlink !== 1) throw new Error('proxy state must be one regular file');
    if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
      throw new Error('proxy state must be owned by the current user');
    }
    await handle.writeFile(`${target}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
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

export async function checkExactDrillPorts(
  checker: (port: number) => Promise<boolean> = portIsFree,
): Promise<void> {
  const occupied: number[] = [];
  for (const port of [4390, 4391, 4392]) {
    if (!await checker(port)) occupied.push(port);
  }
  if (occupied.length > 0) throw new Error(`cutover drill port occupied: ${occupied.join(', ')}`);
}

function filteredHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const connectionTokens = new Set((headers.connection ?? '').split(',').map((value) => value.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => (
    value !== undefined && !hopByHopHeaders.has(name.toLowerCase()) && !connectionTokens.has(name.toLowerCase())
  )));
}

async function writePidFile(path: string): Promise<void> {
  await assertOwnedCutoverPath(path);
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    throw new Error('proxy PID file must be absent and non-symbolic', { cause: error });
  }
  try {
    await handle.writeFile(`${process.pid}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function createProxyServer(options: ProxyArguments): Promise<Server> {
  await prepareStateFile(options.statePath);
  if (!options.pidFile) throw new Error('proxy PID file is required at runtime');
  await assertOwnedCutoverPath(options.pidFile);
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      response.end('public cutover proxy accepts GET and HEAD only\n');
      return;
    }
    let target: ProxyTarget;
    try {
      target = await readStateFile(options.statePath);
    } catch (error) {
      response.writeHead(503, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-beyondwin-cutover-target': 'invalid',
      });
      response.end(`invalid cutover state: ${String(error)}\n`);
      return;
    }
    const upstream = target === 'react' ? options.react : options.astro;
    const upstreamRequest = http.request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url ?? '/',
      headers: {
        ...filteredHeaders(request.headers),
        host: upstream.host,
      },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        ...filteredHeaders(upstreamResponse.headers),
        'x-beyondwin-cutover-target': target,
      });
      upstreamResponse.pipe(response);
    });
    upstreamRequest.once('error', (error) => {
      if (response.headersSent) response.destroy(error);
      else {
        response.writeHead(502, {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          'x-beyondwin-cutover-target': target,
        });
        response.end(`cutover target ${target} is unreachable\n`);
      }
    });
    request.pipe(upstreamRequest);
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.listen.port, options.listen.host, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  try {
    await writePidFile(options.pidFile);
  } catch (error) {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw error;
  }
  return server;
}

async function main(): Promise<void> {
  const options = parseProxyArguments(process.argv.slice(2));
  await prepareStateFile(options.statePath);
  if (options.check) {
    await checkExactDrillPorts();
    process.stdout.write(`${JSON.stringify({ check: 'passed', ports: [4390, 4391, 4392], state: 'react' })}\n`);
    return;
  }
  const server = await createProxyServer(options);
  process.stdout.write(`${JSON.stringify({ pid: process.pid, listen: options.listen, statePath: options.statePath })}\n`);
  const stop = (): void => {
    server.close((error) => {
      if (error) {
        process.stderr.write(`${String(error)}\n`);
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
