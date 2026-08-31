import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as requestHttp, type IncomingHttpHeaders, type Server } from 'node:http';
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

export interface PublicAnswerNginxReceipt {
  applicationHeaders: string[];
  configurationValidated: true;
  forbiddenHeaders: readonly string[];
  image: string;
  nginxBuild: string;
  nginxVersion: string;
  platform: keyof typeof NGINX_VERIFIER_IMAGES;
  productServer: string | null;
  proofScope: 'enumerated-forbidden-response-headers-only';
  statuses: number[];
  transportHeaders: string[];
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

function requestThroughNginx(port: number, status: number): Promise<{
  body: string;
  headers: IncomingHttpHeaders;
  rawHeaders: string[];
  status: number;
}> {
  return new Promise((resolveRequest, reject) => {
    const body = JSON.stringify({ status });
    const request = requestHttp({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/public/ask',
      headers: {
        Host: 'localhost:4389',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
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

async function waitForNginx(port: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await requestThroughNginx(port, 200);
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

  const temporaryRoot = await mkdtemp(join(root, '.superpowers/nginx-verifier-'));
  const containerName = `beyondwin-public-answer-nginx-${process.pid}-${randomBytes(4).toString('hex')}`;
  const react = createServer((_request, response) => response.end('react'));
  const observedApiRequests: IncomingHttpHeaders[] = [];
  const api = createApiStub(observedApiRequests);
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
    await docker([
      'run', '--rm', '--platform', selected.platform,
      '-v', `${preparedPath}:/etc/nginx/conf.d/public-site.conf:ro`,
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
    if (observedApiRequests.length < STATUSES.length) throw new Error('Nginx API verifier missed upstream requests');
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
    return {
      applicationHeaders: [...APPLICATION_HEADERS],
      configurationValidated: true,
      forbiddenHeaders: ENUMERATED_FORBIDDEN_RESPONSE_HEADERS,
      image: selected.image,
      nginxBuild: build,
      nginxVersion: version,
      platform: selected.platform,
      productServer,
      proofScope: 'enumerated-forbidden-response-headers-only',
      statuses: [...STATUSES],
      transportHeaders: [...transport].sort(),
    };
  } finally {
    if (containerStarted) await docker(['rm', '-f', containerName]).catch(() => undefined);
    await Promise.allSettled([close(react), close(api)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  parseNginxVerifierArguments(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(await verifyPublicAnswerNginx({ repositoryRoot: process.cwd() }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
