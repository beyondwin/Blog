import { createServer } from 'node:http';
import { constants as fsConstants, type Stats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_SECURITY_HEADERS } from './app/delivery';

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

export interface StaticSiteServer {
  origin: string;
  close(): Promise<void>;
}

function safeRequestPath(root: string, rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const normalized = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const candidate = resolve(root, normalized || 'index.html');
  const rootPrefix = `${resolve(root)}${sep}`;
  return candidate === resolve(root) || candidate.startsWith(rootPrefix) ? candidate : null;
}

interface StaticRootIdentity {
  dev: number;
  ino: number;
  realPath: string;
}

interface StaticFile {
  body: Buffer;
  extension: string;
}

function sameNode(left: Stats, right: Pick<Stats, 'dev' | 'ino'>): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function contained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function rootIdentity(root: string): Promise<StaticRootIdentity> {
  const absolute = resolve(root);
  const state = await lstat(absolute);
  if (state.isSymbolicLink() || !state.isDirectory()) {
    throw new Error('Static root must be one real directory');
  }
  return { dev: state.dev, ino: state.ino, realPath: await realpath(absolute) };
}

async function rootIsCurrent(root: StaticRootIdentity): Promise<boolean> {
  const state = await lstat(root.realPath).catch(() => null);
  return Boolean(state && !state.isSymbolicLink() && state.isDirectory() && sameNode(state, root));
}

async function nonSymbolicCandidate(root: string, candidate: string): Promise<Stats | null> {
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') return null;
  let current = root;
  const segments = relativePath.split(sep);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const state = await lstat(current).catch(() => null);
    if (!state || state.isSymbolicLink()) return null;
    if (index < segments.length - 1 && !state.isDirectory()) return null;
    if (index === segments.length - 1) return state;
  }
  return null;
}

async function secureStaticFile(root: StaticRootIdentity, rawPath: string): Promise<StaticFile | null> {
  if (!await rootIsCurrent(root)) throw new Error('Static root changed after validation');
  const lexical = safeRequestPath(root.realPath, rawPath);
  if (!lexical) return null;
  let candidate = lexical;
  let state = await nonSymbolicCandidate(root.realPath, candidate);
  if (state?.isDirectory()) {
    candidate = join(candidate, 'index.html');
    state = await nonSymbolicCandidate(root.realPath, candidate);
  }
  if (!state?.isFile()) return null;
  const candidateRealPath = await realpath(candidate).catch(() => null);
  if (!candidateRealPath || !contained(root.realPath, candidateRealPath)) return null;

  const handle = await open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW).catch(() => null);
  if (!handle) return null;
  try {
    const opened = await handle.stat();
    const [current, currentRealPath, currentRoot] = await Promise.all([
      lstat(candidate).catch(() => null),
      realpath(candidate).catch(() => null),
      rootIsCurrent(root),
    ]);
    if (!opened.isFile()
      || !current
      || current.isSymbolicLink()
      || !sameNode(current, opened)
      || !currentRealPath
      || !contained(root.realPath, currentRealPath)
      || !currentRoot) return null;
    return { body: await handle.readFile(), extension: extname(candidate).toLowerCase() };
  } finally {
    await handle.close();
  }
}

export async function startStaticSiteServer({
  root,
  host = '127.0.0.1',
  port = 4173,
}: {
  root: string;
  host?: string;
  port?: number;
}): Promise<StaticSiteServer> {
  const staticRoot = await rootIdentity(root);
  const notFoundFile = await secureStaticFile(staticRoot, '/404.html');
  if (!notFoundFile) throw new Error('404 fallback must be a non-symbolic file inside the static root');
  const notFound = notFoundFile.body;
  const server = createServer(async (request, response) => {
    try {
      for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) response.setHeader(name, value);
      const method = request.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }
      const pathname = new URL(request.url ?? '/', 'http://static.local.invalid').pathname;
      const file = await secureStaticFile(staticRoot, pathname);
      if (!file) {
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(method === 'HEAD' ? undefined : notFound);
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[file.extension] ?? 'application/octet-stream',
        'Content-Length': String(file.body.byteLength),
      });
      response.end(method === 'HEAD' ? undefined : file.body);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : 'Static host failure');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static host did not bind a TCP port');
  return {
    origin: `http://${host}:${address.port}`,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    }),
  };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write([
      'FORM & THOUGHT static preview',
      'Usage: npm run site:preview -- [--root PATH] [--host HOST] [--port PORT]',
      '',
    ].join('\n'));
    process.exit(0);
  }
  const root = option('--root') ?? fileURLToPath(new URL('./build/client', import.meta.url));
  const host = option('--host') ?? '127.0.0.1';
  const rawPort = option('--port') ?? '4173';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`Invalid port: ${rawPort}`);
  const server = await startStaticSiteServer({ root, host, port });
  process.stdout.write(`FORM & THOUGHT static host: ${server.origin}\n`);
}
