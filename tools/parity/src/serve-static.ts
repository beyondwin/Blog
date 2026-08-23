import { gzipSync } from 'node:zlib';
import { createServer, type ServerResponse } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.rsc': 'text/x-component; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface StaticServerOptions {
  root: string;
  host: string;
  port: number;
}

export interface StaticServer {
  baseUrl: string;
  host: string;
  port: number;
  close: () => Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function validateLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Renderer static server host must be explicit loopback, got ${host}`);
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate);
  return candidateRelative === ''
    || (!candidateRelative.startsWith(`..${sep}`) && candidateRelative !== '..' && !isAbsolute(candidateRelative));
}

function send(response: ServerResponse, status: number, body: string): void {
  const bytes = Buffer.from(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': String(bytes.byteLength),
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(bytes);
}

async function resolveRequestFile(root: string, requestPath: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const relativePath = decoded.replace(/^\/+/, '');
  const initial = resolve(root, relativePath || 'index.html');
  if (!isWithinRoot(root, initial)) return null;

  let candidate = initial;
  try {
    const stats = await lstat(candidate);
    if (stats.isDirectory()) candidate = join(candidate, 'index.html');
  } catch {
    if (decoded.endsWith('/')) candidate = join(initial, 'index.html');
  }

  try {
    const canonical = await realpath(candidate);
    if (!isWithinRoot(root, canonical)) return null;
    const stats = await lstat(canonical);
    return stats.isFile() ? canonical : null;
  } catch {
    return null;
  }
}

export async function startStaticServer(options: StaticServerOptions): Promise<StaticServer> {
  validateLoopbackHost(options.host);
  const root = await realpath(options.root);
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory()) throw new Error(`Static root is not a directory: ${options.root}`);

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, 405, 'Method not allowed');
        return;
      }

      const requestUrl = new URL(request.url ?? '/', `http://${options.host}`);
      const file = await resolveRequestFile(root, requestUrl.pathname);
      if (!file) {
        send(response, 404, 'Not found');
        return;
      }

      const source = await readFile(file);
      const extension = extname(file).toLowerCase();
      const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';
      const shouldGzip = (extension === '.js' || extension === '.mjs')
        && /(?:^|,)\s*gzip\s*(?:,|$)/iu.test(request.headers['accept-encoding'] ?? '');
      const body = shouldGzip ? gzipSync(source, { level: 9 }) : source;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(body.byteLength),
        'content-type': contentType,
        ...(shouldGzip ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      send(response, 500, error instanceof Error ? error.message : 'Static server error');
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const reject = (error: Error) => rejectListen(error);
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Static server did not expose a TCP address');
  }

  let closed = false;
  return {
    baseUrl: `http://${options.host}:${address.port}`,
    host: options.host,
    port: address.port,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(error) : resolveClose());
      });
    },
  };
}
