import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer, request as requestHttp, type IncomingHttpHeaders, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PUBLIC_SECURITY_HEADERS } from '../../apps/site/app/delivery.ts';

const execFileAsync = promisify(execFile);

export const NGINX_VERIFIER_IMAGES = {
  'linux/amd64': 'docker.io/library/nginx:1.28.0-alpine@sha256:09ab424a8c788f8d0fe3a64429f6d19dfa526885c8609b748d0943a75dcb9f8c',
  'linux/arm64': 'docker.io/library/nginx:1.28.0-alpine@sha256:e8552debd77891036e8928d45f6f6e6d9eee56ce720668c0cdd723f963c3a5c5',
} as const;

export const ENUMERATED_FORBIDDEN_RESPONSE_HEADERS = [
  'Set-Cookie',
  'Location',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Max-Age',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Server',
  'X-Powered-By',
  'X-Beyondwin-Forbidden-Sentinel',
] as const;

const APPLICATION_HEADERS = [
  'cache-control',
  'content-type',
  'retry-after',
  'vary',
  'x-answer-release-id',
  'x-content-release-id',
] as const;
const STATUSES = [200, 409, 429, 503] as const;
const PRIVATE_QUERY_MARKER = 'task7-private-query-marker-96f31b64';

export interface PublicAnswerNginxReceipt {
  accessLogMarkerAbsent: true;
  applicationHeaders: string[];
  configurationValidated: true;
  forbiddenHeaders: readonly string[];
  image: string;
  nginxBuild: string;
  nginxVersion: string;
  platform: keyof typeof NGINX_VERIFIER_IMAGES;
  productServer: string | null;
  proofScope: 'enumerated-forbidden-response-headers-only';
  rejectedApiHttpRequests: 0;
  rejectedApiTcpConnections: 0;
  requestGateBodiesBounded: true;
  requestGateStatuses: Record<string, number>;
  statuses: number[];
  transportHeaders: string[];
  validApiHttpRequests: number;
  validApiSocketsClosedBeforeRejected: true;
  validApiTcpConnections: number;
}

export function parseNginxVerifierArguments(argv: readonly string[]): Record<string, never> {
  if (argv.length !== 0) throw new Error('Nginx verifier accepts no argument or image override');
  return {};
}

export function selectNginxVerifierImage(
  platform: string = process.platform,
  architecture: string = process.arch,
): { image: string; platform: keyof typeof NGINX_VERIFIER_IMAGES } {
  if (!['darwin', 'linux'].includes(platform)) throw new Error(`unsupported Nginx verifier host platform: ${platform}`);
  const selected = architecture === 'x64'
    ? 'linux/amd64'
    : architecture === 'arm64' ? 'linux/arm64' : null;
  if (!selected) throw new Error(`unsupported Nginx verifier host architecture: ${architecture}`);
  return { image: NGINX_VERIFIER_IMAGES[selected], platform: selected };
}

export async function createNginxVerifierTemporaryRoot(repositoryRoot: string): Promise<{
  cleanup: () => Promise<void>;
  temporaryRoot: string;
}> {
  const root = resolve(repositoryRoot);
  const parent = join(root, '.superpowers');
  const ignoreFile = await readFile(join(root, '.gitignore'), 'utf8').catch(() => '');
  const ignoreRules = ignoreFile
    .split(/\r?\n/u)
    .map((line) => line.trim());
  if (!ignoreRules.includes('.superpowers/') && !ignoreRules.includes('/.superpowers/')) {
    throw new Error('Nginx verifier parent must be explicitly ignored by the repository');
  }
  let createdParent = false;
  try {
    await mkdir(parent, { mode: 0o700 });
    createdParent = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const state = await lstat(parent);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new Error('Nginx verifier parent must be one real directory');
  }
  if (typeof process.getuid === 'function' && state.uid !== process.getuid()) {
    throw new Error('Nginx verifier parent must be owned by the current user');
  }
  if (await realpath(parent) !== join(await realpath(root), '.superpowers')) {
    throw new Error('Nginx verifier parent real path changed');
  }
  const temporaryRoot = await mkdtemp(join(parent, 'nginx-verifier-'));
  let cleaned = false;
  return {
    temporaryRoot,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(temporaryRoot, { recursive: true, force: true });
      if (createdParent) {
        await rmdir(parent).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
        });
      }
    },
  };
}

async function docker(arguments_: readonly string[]): Promise<string> {
  const result = await execFileAsync('docker', [...arguments_], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60_000,
  });
  return `${result.stdout}${result.stderr}`.trim();
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('verifier stub did not bind');
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

async function waitForNoSockets(sockets: ReadonlySet<Socket>): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (sockets.size === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('Nginx verifier API valid-phase sockets did not close before rejection probes');
}

function hostileHeaders(): Record<string, string> {
  return Object.fromEntries(ENUMERATED_FORBIDDEN_RESPONSE_HEADERS.map((name) => [
    name,
    name === 'Set-Cookie' ? 'session=hostile' : `hostile-${name.toLowerCase()}`,
  ]));
}

function createApiStub(observed: IncomingHttpHeaders[]): Server {
  return createServer((request, response) => {
    observed.push(request.headers);
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      let status = 500;
      try {
        status = Number((JSON.parse(Buffer.concat(chunks).toString('utf8')) as { status?: unknown }).status);
      } catch {
        status = 400;
      }
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) status = 400;
      response.writeHead(status, {
        Connection: 'close',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, private',
        Vary: 'Origin',
        ...(status === 429 || status === 503 ? { 'Retry-After': '17' } : {}),
        'X-Content-Release-Id': 'content-release-id',
        'X-Answer-Release-Id': 'answer-release-id',
        ...hostileHeaders(),
      });
      response.end(JSON.stringify({ status }));
    });
  });
}

function replaceExactly(source: string, from: string, to: string): string {
  const matches = source.split(from).length - 1;
  if (matches !== 1) throw new Error(`prepared Nginx verifier expected exactly one replacement: ${from}`);
  return source.replace(from, to);
}

function harnessConfiguration(configuration: string, reactPort: number, apiPort: number): string {
  let result = replaceExactly(configuration, 'listen 127.0.0.1:4389;', 'listen 0.0.0.0:8080;');
  result = replaceExactly(result, 'server 127.0.0.1:4391;', `server host.docker.internal:${reactPort};`);
  result = replaceExactly(result, 'server 127.0.0.1:4392;', `server host.docker.internal:${apiPort};`);
  return result;
}

interface NginxProbeOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  path: string;
}

function requestNginx(port: number, options: NginxProbeOptions): Promise<{
  body: string;
  headers: IncomingHttpHeaders;
  rawHeaders: string[];
  status: number;
}> {
  return new Promise((resolveRequest, reject) => {
    const body = options.body ?? '';
    const request = requestHttp({
      hostname: '127.0.0.1',
      port,
      method: options.method ?? 'POST',
      path: options.path,
      headers: {
        Host: 'localhost:4389',
        ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
        ...options.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolveRequest({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
        rawHeaders: response.rawHeaders,
        status: response.statusCode ?? 0,
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

function requestThroughNginx(port: number, status: number): ReturnType<typeof requestNginx> {
  const body = JSON.stringify({ status });
  return requestNginx(port, {
    path: '/api/public/ask',
    body,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://public.example',
      'Sec-Fetch-Site': 'same-origin',
      Cookie: 'secret=1',
      Authorization: 'Bearer secret',
      Forwarded: 'for=hostile',
      'X-Forwarded-For': 'hostile',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Host': 'hostile.example',
      'X-Forwarded-Port': '666',
      'X-Real-IP': 'hostile',
      'X-Arbitrary-Request': 'hostile',
    },
  });
}

async function waitForNginx(port: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await requestNginx(port, { method: 'GET', path: '/' });
      if (response.status !== 200) throw new Error('not ready');
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error('pinned Nginx verifier did not become ready');
}

async function publishedContainerPort(containerName: string): Promise<number> {
  let last = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    last = await docker(['inspect', containerName, '--format', '{{json .NetworkSettings.Ports}}']);
    const match = last.match(/"8080\/tcp":\[\{"HostIp":"127\.0\.0\.1","HostPort":"(\d+)"\}\]/u);
    if (match) return Number(match[1]);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`cannot resolve owned Nginx verifier port map: ${last}`);
}

export async function verifyPublicAnswerNginx({
  repositoryRoot,
}: {
  repositoryRoot: string;
}): Promise<PublicAnswerNginxReceipt> {
  const root = resolve(repositoryRoot);
  const selected = selectNginxVerifierImage();
  const digest = selected.image.slice(selected.image.indexOf('@sha256:') + 1);
  const inspection = await docker(['image', 'inspect', selected.image, '--format', '{{json .RepoDigests}}|{{.Architecture}}']);
  const expectedArchitecture = selected.platform === 'linux/arm64' ? 'arm64' : 'amd64';
  if (!inspection.includes(digest) || !inspection.endsWith(`|${expectedArchitecture}`)) {
    throw new Error('Nginx verifier image platform or digest mismatch');
  }

  const version = await docker(['run', '--rm', '--platform', selected.platform, '--entrypoint', 'nginx', selected.image, '-v']);
  if (version !== 'nginx version: nginx/1.28.0') throw new Error(`unexpected pinned Nginx version: ${version}`);
  const build = await docker(['run', '--rm', '--platform', selected.platform, '--entrypoint', 'nginx', selected.image, '-V']);
  if (!build.startsWith('nginx version: nginx/1.28.0') || !build.includes('configure arguments:')) {
    throw new Error('pinned Nginx build receipt is incomplete');
  }

  const workspace = await createNginxVerifierTemporaryRoot(root);
  const { temporaryRoot } = workspace;
  const containerName = `beyondwin-public-answer-nginx-${process.pid}-${randomBytes(4).toString('hex')}`;
  const react = createServer((_request, response) => response.end('react'));
  const observedApiRequests: IncomingHttpHeaders[] = [];
  const api = createApiStub(observedApiRequests);
  let observedApiTcpConnections = 0;
  const activeApiSockets = new Set<Socket>();
  api.on('connection', (socket) => {
    observedApiTcpConnections += 1;
    activeApiSockets.add(socket);
    socket.once('close', () => activeApiSockets.delete(socket));
    socket.setNoDelay(true);
  });
  let containerStarted = false;
  try {
    const [reactPort, apiPort] = await Promise.all([listen(react), listen(api)]);
    const preparedPath = join(root, 'deploy/reverse-proxy/public-site.conf');
    const prepared = await readFile(preparedPath, 'utf8');
    for (const header of ENUMERATED_FORBIDDEN_RESPONSE_HEADERS) {
      if (!prepared.includes(`proxy_hide_header ${header};`)) {
        throw new Error(`prepared Nginx finite response seal is missing ${header}`);
      }
    }
    if (!prepared.includes('proxy_redirect off;') || !prepared.includes('server_tokens off;')) {
      throw new Error('prepared Nginx finite response seal is incomplete');
    }
    const mountedPreparedPath = await realpath(preparedPath);
    await docker([
      'run', '--rm', '--platform', selected.platform,
      '-v', `${mountedPreparedPath}:/etc/nginx/conf.d/public-site.conf:ro`,
      selected.image, 'nginx', '-t',
    ]);

    const harnessPath = join(temporaryRoot, 'public-site.conf');
    await writeFile(harnessPath, harnessConfiguration(prepared, reactPort, apiPort));
    const mountedHarnessPath = await realpath(harnessPath);
    await docker([
      'run', '-d', '--name', containerName, '--platform', selected.platform,
      '--add-host', 'host.docker.internal:host-gateway',
      '-p', '127.0.0.1:0:8080',
      '-v', `${mountedHarnessPath}:/etc/nginx/conf.d/public-site.conf:ro`,
      selected.image,
    ]);
    containerStarted = true;
    const state = await docker(['inspect', containerName, '--format', '{{.State.Status}}|{{.State.Error}}']);
    if (!state.startsWith('running|')) {
      const logs = await docker(['logs', containerName]).catch(() => 'logs unavailable');
      throw new Error(`owned Nginx verifier exited before readiness: ${state}\n${logs}`);
    }
    const port = await publishedContainerPort(containerName);
    await waitForNginx(port);

    const transport = new Set<string>();
    let productServer: string | null = null;
    const validHttpRequestBaseline = observedApiRequests.length;
    const validTcpConnectionBaseline = observedApiTcpConnections;
    for (const status of STATUSES) {
      const response = await requestThroughNginx(port, status);
      if (response.status !== status || JSON.parse(response.body).status !== status) {
        throw new Error(`Nginx verifier did not preserve upstream status ${status}`);
      }
      const raw = response.rawHeaders.join('\n').toLowerCase();
      for (const header of ENUMERATED_FORBIDDEN_RESPONSE_HEADERS) {
        const hostile = header === 'Set-Cookie' ? 'session=hostile' : `hostile-${header.toLowerCase()}`;
        if (raw.includes(hostile)) throw new Error(`Nginx leaked hostile ${header} value on ${status}`);
        if (header !== 'Server' && response.headers[header.toLowerCase()] !== undefined) {
          throw new Error(`Nginx leaked forbidden ${header} header on ${status}`);
        }
      }
      for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
        if (response.headers[name.toLowerCase()] !== value) throw new Error(`Nginx security header drift: ${name}`);
      }
      if (response.headers['content-type'] !== 'application/json'
        || response.headers['cache-control'] !== 'no-store, private'
        || response.headers.vary !== 'Origin'
        || response.headers['x-content-release-id'] !== 'content-release-id'
        || response.headers['x-answer-release-id'] !== 'answer-release-id') {
        throw new Error(`Nginx application response allowlist drift on ${status}`);
      }
      if ((status === 429 || status === 503) !== (response.headers['retry-after'] === '17')) {
        throw new Error(`Nginx conditional Retry-After drift on ${status}`);
      }
      productServer = response.headers.server ?? null;
      for (const name of Object.keys(response.headers)) {
        if (!APPLICATION_HEADERS.includes(name as (typeof APPLICATION_HEADERS)[number])
          && !Object.keys(PUBLIC_SECURITY_HEADERS).some((security) => security.toLowerCase() === name)) {
          transport.add(name);
        }
      }
    }
    const validApiHttpRequests = observedApiRequests.length - validHttpRequestBaseline;
    const validApiTcpConnections = observedApiTcpConnections - validTcpConnectionBaseline;
    if (validApiHttpRequests !== STATUSES.length || validApiTcpConnections !== STATUSES.length) {
      throw new Error('Nginx API verifier valid-phase HTTP request or TCP connection count drifted');
    }
    for (const headers of observedApiRequests) {
      if (headers.host !== '127.0.0.1:4392'
        || headers.origin !== 'https://public.example'
        || headers['sec-fetch-site'] !== 'same-origin'
        || headers['x-forwarded-proto'] !== 'http'
        || headers['x-forwarded-host'] !== 'localhost:4389'
        || !headers['x-forwarded-for']) {
        throw new Error('Nginx trusted request forwarding contract drifted');
      }
      if (JSON.stringify(headers).match(/secret|hostile|x-forwarded-port|x-real-ip|x-arbitrary-request/iu)) {
        throw new Error('Nginx leaked untrusted request identity or credentials upstream');
      }
    }
    await waitForNoSockets(activeApiSockets);
    const rejectedHttpRequestBaseline = observedApiRequests.length;
    const rejectedTcpConnectionBaseline = observedApiTcpConnections;
    const gateCases: Array<{
      expected: number;
      name: string;
      options: NginxProbeOptions;
    }> = [
      { name: 'query', expected: 404, options: { path: `/api/public/ask?question=${PRIVATE_QUERY_MARKER}`, body: '{}' } },
      { name: 'trailingSlash', expected: 404, options: { path: '/api/public/ask/', body: PRIVATE_QUERY_MARKER } },
      { name: 'doubleSlash', expected: 404, options: { path: '//api/public/ask', body: PRIVATE_QUERY_MARKER } },
      { name: 'dotSegment', expected: 404, options: { path: '/api/./public/ask', body: PRIVATE_QUERY_MARKER } },
      { name: 'encodedSegment', expected: 404, options: { path: '/api/public/%61sk', body: PRIVATE_QUERY_MARKER } },
      { name: 'wrongMethod', expected: 405, options: { method: 'GET', path: '/api/public/ask' } },
      { name: 'wrongHost', expected: 400, options: { path: '/api/public/ask', body: PRIVATE_QUERY_MARKER, headers: { Host: 'hostile.example' } } },
      { name: 'upgrade', expected: 400, options: { path: '/api/public/ask', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } } },
      { name: 'health', expected: 404, options: { path: '/health/live', body: PRIVATE_QUERY_MARKER } },
      { name: 'otherApi', expected: 404, options: { path: '/api/private', body: PRIVATE_QUERY_MARKER } },
      { name: 'oversized', expected: 413, options: { path: '/api/public/ask', body: PRIVATE_QUERY_MARKER.padEnd(4_097, 'x') } },
    ];
    const requestGateStatuses: Record<string, number> = {};
    for (const gate of gateCases) {
      const response = await requestNginx(port, gate.options);
      requestGateStatuses[gate.name] = response.status;
      if (response.status !== gate.expected) {
        throw new Error(`Nginx request gate ${gate.name} returned ${response.status}, expected ${gate.expected}`);
      }
      if (Buffer.byteLength(response.body) > 1_024 || response.body.includes(PRIVATE_QUERY_MARKER)) {
        throw new Error(`Nginx request gate ${gate.name} response was not bounded and generic`);
      }
    }
    const rejectedApiHttpRequests = observedApiRequests.length - rejectedHttpRequestBaseline;
    const rejectedApiTcpConnections = observedApiTcpConnections - rejectedTcpConnectionBaseline;
    if (rejectedApiHttpRequests !== 0 || rejectedApiTcpConnections !== 0) {
      throw new Error('Nginx connected or forwarded a rejected request to the API upstream');
    }
    const containerLogs = await docker(['logs', containerName]);
    if (containerLogs.includes(PRIVATE_QUERY_MARKER)) {
      throw new Error('Nginx logged a rejected private query marker');
    }
    return {
      accessLogMarkerAbsent: true,
      applicationHeaders: [...APPLICATION_HEADERS],
      configurationValidated: true,
      forbiddenHeaders: ENUMERATED_FORBIDDEN_RESPONSE_HEADERS,
      image: selected.image,
      nginxBuild: build,
      nginxVersion: version,
      platform: selected.platform,
      productServer,
      proofScope: 'enumerated-forbidden-response-headers-only',
      rejectedApiHttpRequests: 0,
      rejectedApiTcpConnections: 0,
      requestGateBodiesBounded: true,
      requestGateStatuses,
      statuses: [...STATUSES],
      transportHeaders: [...transport].sort(),
      validApiHttpRequests,
      validApiSocketsClosedBeforeRejected: true,
      validApiTcpConnections,
    };
  } finally {
    if (containerStarted) await docker(['rm', '-f', containerName]).catch(() => undefined);
    await Promise.allSettled([close(react), close(api)]);
    await workspace.cleanup();
  }
}

async function main(): Promise<void> {
  parseNginxVerifierArguments(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(await verifyPublicAnswerNginx({ repositoryRoot: process.cwd() }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
