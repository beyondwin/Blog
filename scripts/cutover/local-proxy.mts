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
  api: URL;
  pidFile?: string;
}

const allowedValueArguments = new Set(['--listen', '--react', '--api', '--pid-file']);
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
const API_BODY_LIMIT_BYTES = 4 * 1024;
const API_DEADLINE_MS = 12_000;
const API_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-length',
  'content-type',
  'origin',
  'sec-fetch-site',
  'transfer-encoding',
  'user-agent',
]);
const API_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-type',
  'retry-after',
  'vary',
  'x-answer-release-id',
  'x-content-release-id',
]);

function parseListen(value: string): ProxyArguments['listen'] {
  const match = value.match(/^(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/u);
  if (!match) throw new Error('--listen requires an exact loopback address and port');
  const port = Number(match[2]);
  if (port > 65_535) throw new Error('--listen port is out of range');
  return { host: match[1] === '[::1]' ? '::1' : '127.0.0.1', port };
}

function parseUpstream(value: string, argument: '--api' | '--react'): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${argument} requires one valid URL`, { cause: error });
  }
  if (url.protocol !== 'http:') throw new Error(`${argument} permits HTTP only`);
  if (!['127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`${argument} permits exact loopback upstreams only`);
  if (!url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${argument} requires only an origin with an explicit port`);
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
  for (const required of ['--listen', '--react', '--api']) {
    if (!values.has(required)) throw new Error(`missing required argument: ${required}`);
  }
  if (!check && !values.has('--pid-file')) throw new Error('--pid-file is required at runtime');
  return {
    check,
    listen: parseListen(values.get('--listen')!),
    react: parseUpstream(values.get('--react')!, '--react'),
    api: parseUpstream(values.get('--api')!, '--api'),
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
  for (const port of [4390, 4391, 4392]) if (!await checker(port)) occupied.push(port);
  if (occupied.length > 0) throw new Error(`React cutover drill port occupied: ${occupied.join(', ')}`);
}

function filteredHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const connectionTokens = new Set((headers.connection ?? '').split(',').map((value) => value.trim().toLowerCase()));
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => (
    value !== undefined && !hopByHopHeaders.has(name.toLowerCase()) && !connectionTokens.has(name.toLowerCase())
  )));
}

function listenerAuthority(listen: ProxyArguments['listen']): string {
  return `${listen.host === '::1' ? '[::1]' : listen.host}:${listen.port}`;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withoutUntrustedIdentity(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(Object.entries(filteredHeaders(headers)).filter(([name]) => {
    const lower = name.toLowerCase();
    return lower !== 'host'
      && lower !== 'forwarded'
      && !lower.startsWith('x-forwarded-')
      && lower !== 'x-real-ip'
      && lower !== 'cookie'
      && lower !== 'authorization'
      && lower !== 'proxy-authorization';
  }));
}

function trustedForwardingHeaders(
  request: http.IncomingMessage,
  authority: string,
  upstream: URL,
): IncomingHttpHeaders {
  return {
    host: upstream.host,
    'x-forwarded-for': request.socket.remoteAddress ?? '',
    'x-forwarded-proto': 'http',
    'x-forwarded-host': authority,
  };
}

function apiRequestHeaders(
  request: http.IncomingMessage,
  authority: string,
  upstream: URL,
): IncomingHttpHeaders {
  const approved = Object.fromEntries(Object.entries(request.headers).filter(([name, value]) => (
    value !== undefined && API_REQUEST_HEADERS.has(name.toLowerCase())
  )));
  return { ...approved, ...trustedForwardingHeaders(request, authority, upstream) };
}

function apiResponseHeaders(status: number, headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const approved = Object.fromEntries(Object.entries(headers).filter(([name, value]) => (
    value !== undefined
      && API_RESPONSE_HEADERS.has(name.toLowerCase())
      && (name.toLowerCase() !== 'retry-after' || status === 429 || status === 503)
  )));
  return {
    ...approved,
    'cache-control': firstHeader(headers['cache-control']) ?? 'no-store',
    ...PUBLIC_SECURITY_HEADERS,
  };
}

function rejectRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  status: 400 | 404 | 405 | 413,
): void {
  request.resume();
  response.writeHead(status, {
    ...PUBLIC_SECURITY_HEADERS,
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end('Request is not available on the public proxy\n');
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
    const authority = listenerAuthority(options.listen);
    if (firstHeader(request.headers.host) !== authority) {
      rejectRequest(request, response, 400);
      return;
    }
    const requestTarget = request.url ?? '/';
    let pathname: string;
    try {
      pathname = new URL(requestTarget, 'http://public.local.invalid').pathname;
    } catch {
      rejectRequest(request, response, 400);
      return;
    }
    const publicAsk = requestTarget === '/api/public/ask' && request.method === 'POST';
    const staticRequest = !pathname.startsWith('/api/')
      && pathname !== '/api'
      && !pathname.startsWith('/health/')
      && pathname !== '/health'
      && (request.method === 'GET' || request.method === 'HEAD');

    if (publicAsk) {
      const declaredLength = Number(firstHeader(request.headers['content-length']) ?? '0');
      if (!Number.isSafeInteger(declaredLength) || declaredLength > API_BODY_LIMIT_BYTES) {
        rejectRequest(request, response, 413);
        return;
      }
      const upstreamRequest = http.request({
        protocol: options.api.protocol,
        hostname: options.api.hostname,
        port: options.api.port,
        method: 'POST',
        path: '/api/public/ask',
        headers: apiRequestHeaders(request, authority, options.api),
      }, (upstreamResponse) => {
        if (response.destroyed) {
          upstreamResponse.destroy();
          return;
        }
        const status = upstreamResponse.statusCode ?? 502;
        response.writeHead(status, apiResponseHeaders(status, upstreamResponse.headers));
        upstreamResponse.pipe(response);
      });
      let received = 0;
      let settled = false;
      const abortUpstream = () => {
        if (!settled) upstreamRequest.destroy();
      };
      response.once('finish', () => { settled = true; });
      response.once('close', () => {
        if (!response.writableEnded) abortUpstream();
      });
      request.once('aborted', abortUpstream);
      upstreamRequest.setTimeout(API_DEADLINE_MS, () => upstreamRequest.destroy(new Error('deadline')));
      upstreamRequest.once('error', (error) => {
        if (response.headersSent || response.destroyed) {
          response.destroy();
          return;
        }
        response.writeHead(error.message === 'deadline' ? 504 : 502, {
          ...PUBLIC_SECURITY_HEADERS,
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        });
        response.end('Public answer origin is unavailable\n');
      });
      request.on('data', (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > API_BODY_LIMIT_BYTES) {
          upstreamRequest.destroy();
          if (!response.headersSent) rejectRequest(request, response, 413);
          return;
        }
        if (!upstreamRequest.destroyed) upstreamRequest.write(chunk);
      });
      request.once('end', () => {
        if (!upstreamRequest.destroyed) upstreamRequest.end();
      });
      return;
    }
    if (!staticRequest) {
      rejectRequest(request, response, request.method === 'GET' || request.method === 'HEAD' ? 404 : 405);
      return;
    }
    const upstreamRequest = http.request({
      protocol: options.react.protocol,
      hostname: options.react.hostname,
      port: options.react.port,
      method: request.method,
      path: request.url ?? '/',
      headers: {
        ...withoutUntrustedIdentity(request.headers),
        ...trustedForwardingHeaders(request, authority, options.react),
      },
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
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
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
    process.stdout.write(`${JSON.stringify({ check: 'passed', ports: [4390, 4391, 4392], renderer: 'react' })}\n`);
    return;
  }
  await createProxyServer(arguments_);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
