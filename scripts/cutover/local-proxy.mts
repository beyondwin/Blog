import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import http, { type IncomingHttpHeaders, type Server } from 'node:http';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_SECURITY_HEADERS } from '../../apps/site/app/delivery.ts';

export interface ProxyArguments {
  check: boolean;
  listen: { host: '127.0.0.1' | '::1'; port: number };
  react: URL;
  pidFile?: string;
}

const allowedValueArguments = new Set(['--listen', '--react', '--pid-file']);
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

function parseUpstream(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('--react requires one valid URL', { cause: error });
  }
  if (url.protocol !== 'http:') throw new Error('--react permits HTTP only');
  if (!['127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('--react permits exact loopback upstreams only');
  if (!url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('--react requires only an origin with an explicit port');
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
  for (const required of ['--listen', '--react']) {
    if (!values.has(required)) throw new Error(`missing required argument: ${required}`);
  }
  if (!check && !values.has('--pid-file')) throw new Error('--pid-file is required at runtime');
  return {
    check,
    listen: parseListen(values.get('--listen')!),
    react: parseUpstream(values.get('--react')!),
    ...(values.has('--pid-file') ? { pidFile: resolve(values.get('--pid-file')!) } : {}),
  };
}

export async function assertOwnedCutoverPath(path: string): Promise<string> {
  const resolved = resolve(path);
  const root = dirname(resolved);
  if (!cutoverRootPattern.test(root)) throw new Error('PID path must be a direct child of /tmp/beyondwin-cutover.*');
  const state = await lstat(root);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error('cutover root must be one real directory');
  if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
    throw new Error('cutover root must be owned by the current user');
  }
  const expectedRealPath = join(await realpath('/tmp'), basename(root));
  if (await realpath(root) !== expectedRealPath) throw new Error('cutover root real path changed');
  return root;
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
  for (const port of [4390, 4391]) if (!await checker(port)) occupied.push(port);
  if (occupied.length > 0) throw new Error(`React cutover drill port occupied: ${occupied.join(', ')}`);
}

function filteredHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const connectionTokens = new Set((headers.connection ?? '').split(',').map((value) => value.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => (
    value !== undefined && !hopByHopHeaders.has(name.toLowerCase()) && !connectionTokens.has(name.toLowerCase())
  )));
}

async function writePidFile(path: string): Promise<void> {
  await assertOwnedCutoverPath(path);
  const handle = await open(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600,
  ).catch((error) => { throw new Error('proxy PID file must be absent and non-symbolic', { cause: error }); });
  try {
    await handle.writeFile(`${process.pid}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function createProxyServer(options: ProxyArguments): Promise<Server> {
  if (!options.pidFile) throw new Error('proxy PID file is required at runtime');
  await assertOwnedCutoverPath(options.pidFile);
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {
        ...PUBLIC_SECURITY_HEADERS,
        allow: 'GET, HEAD',
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end('public proxy accepts GET and HEAD only\n');
      return;
    }
    const upstreamRequest = http.request({
      protocol: options.react.protocol,
      hostname: options.react.hostname,
      port: options.react.port,
      method: request.method,
      path: request.url ?? '/',
      headers: { ...filteredHeaders(request.headers), host: options.react.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        ...filteredHeaders(upstreamResponse.headers),
        ...PUBLIC_SECURITY_HEADERS,
        'X-Beyondwin-Renderer': 'react',
      });
      upstreamResponse.pipe(response);
    });
    upstreamRequest.once('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, {
          ...PUBLIC_SECURITY_HEADERS,
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          'X-Beyondwin-Renderer': 'react',
        });
        response.end('React public origin is unreachable\n');
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
  const arguments_ = parseProxyArguments(process.argv.slice(2));
  if (arguments_.check) {
    await checkExactDrillPorts();
    process.stdout.write(`${JSON.stringify({ check: 'passed', ports: [4390, 4391], renderer: 'react' })}\n`);
    return;
  }
  await createProxyServer(arguments_);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
