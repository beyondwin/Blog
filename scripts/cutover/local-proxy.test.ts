import { createServer, request as requestHttp, type IncomingHttpHeaders, type Server } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_SECURITY_HEADERS } from '../../apps/site/app/delivery';
import { assertOwnedCutoverPath, checkExactDrillPorts, createProxyServer, parseProxyArguments } from './local-proxy.mts';

const closeables: Array<{ close(callback: (error?: Error) => void): void }> = [];
const createdRoots: string[] = [];

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closeables.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return address.port;
}

async function startProxy(reactPort: number, apiPort: number, apiDeadlineMs?: number) {
  const root = await mkdtemp('/tmp/beyondwin-cutover.');
  createdRoots.push(root);
  const reservation = createServer();
  const proxyPort = await listen(reservation);
  closeables.pop();
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  const parsed = parseProxyArguments([
    '--listen', `127.0.0.1:${proxyPort}`,
    '--react', `http://127.0.0.1:${reactPort}`,
    '--api', `http://127.0.0.1:${apiPort}`,
    '--pid-file', join(root, 'proxy.pid'),
  ]);
  const proxy = await createProxyServer(parsed, apiDeadlineMs === undefined ? {} : { apiDeadlineMs });
  closeables.push(proxy);
  return { origin: `http://127.0.0.1:${proxyPort}`, authority: `127.0.0.1:${proxyPort}` };
}

function rawRequest(origin: string, options: {
  body?: string;
  headers?: Record<string, string>;
  method: string;
  path: string;
}): Promise<{ body: string; headers: IncomingHttpHeaders; status: number }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = requestHttp({
      hostname: url.hostname,
      port: url.port,
      method: options.method,
      path: options.path,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
        status: response.statusCode ?? 0,
      }));
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(closeables.splice(0).map((server) => new Promise<void>((resolve, reject) => (
    server.close((error) => (error ? reject(error) : resolve()))
  ))));
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('React-only local cutover proxy', () => {
  it('accepts exact loopback React and API origins and rejects unapproved topology', () => {
    const valid = [
      '--listen', '127.0.0.1:4390',
      '--react', 'http://127.0.0.1:4391',
      '--api', 'http://127.0.0.1:4392',
      '--pid-file', '/tmp/beyondwin-cutover.example/proxy.pid',
    ];
    expect(parseProxyArguments(valid)).toMatchObject({
      listen: { host: '127.0.0.1', port: 4390 },
      react: new URL('http://127.0.0.1:4391'),
      api: new URL('http://127.0.0.1:4392'),
    });
    expect(() => parseProxyArguments([...valid, '--astro', 'http://127.0.0.1:4392'])).toThrow('unknown');
    expect(() => parseProxyArguments([...valid, '--state', '/tmp/state'])).toThrow('unknown');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4391'
      ? 'http://example.com:4391'
      : value))).toThrow('loopback');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4392'
      ? 'http://example.com:4392'
      : value))).toThrow('loopback');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4391'
      ? 'http://[::1]:4391'
      : value))).toThrow('127.0.0.1');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4392'
      ? 'http://[::1]:4392'
      : value))).toThrow('127.0.0.1');
  });

  it('confines the PID file to one real owned cutover directory', async () => {
    const root = await mkdtemp('/tmp/beyondwin-cutover.');
    createdRoots.push(root);
    await expect(assertOwnedCutoverPath(join(root, 'proxy.pid'))).resolves.toBe(root);
    await expect(assertOwnedCutoverPath(join(root, '..', 'escaped'))).rejects.toThrow('cutover');
  });

  it('checks only the proxy, React, and API ports and never stops an occupant', async () => {
    const visited: number[] = [];
    await expect(checkExactDrillPorts(async (port) => {
      visited.push(port);
      return port !== 4392;
    })).rejects.toThrow('4392');
    expect(visited).toEqual([4390, 4391, 4392]);
  });

  it('routes static GET/HEAD to React and only exact queryless POST to the API', async () => {
    let reactRequests = 0;
    let apiRequests = 0;
    const reactHeaders: IncomingHttpHeaders[] = [];
    const reactPort = await listen(createServer((request, response) => {
      reactRequests += 1;
      reactHeaders.push(request.headers);
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`react:${request.method}:${request.url}`);
    }));
    const apiPort = await listen(createServer((request, response) => {
      apiRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      request.pipe(response);
    }));
    const proxy = await startProxy(reactPort, apiPort);

    expect(await (await fetch(`${proxy.origin}/articles/`)).text()).toBe('react:GET:/articles/');
    expect((await rawRequest(proxy.origin, {
      method: 'HEAD', path: '/search/', headers: { Host: proxy.authority },
    })).status).toBe(200);
    expect((await rawRequest(proxy.origin, {
      method: 'GET',
      path: '/search/',
      headers: {
        Host: proxy.authority,
        Cookie: 'secret=1',
        Authorization: 'Bearer secret',
        Forwarded: 'for=hostile',
        'X-Forwarded-For': 'hostile',
        'X-Forwarded-Port': '666',
        'X-Real-IP': 'hostile',
      },
    })).status).toBe(200);
    expect(reactHeaders[2]).toMatchObject({
      host: `127.0.0.1:${reactPort}`,
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-proto': 'http',
      'x-forwarded-host': proxy.authority,
    });
    expect(JSON.stringify(reactHeaders[2])).not.toMatch(/secret|hostile|x-forwarded-port|x-real-ip/iu);
    const api = await rawRequest(proxy.origin, {
      method: 'POST',
      path: '/api/public/ask',
      body: '{"question":"Graphify"}',
      headers: { Host: proxy.authority, 'Content-Type': 'application/json' },
    });
    expect(api.status).toBe(200);
    expect(api.body).toBe('{"question":"Graphify"}');

    for (const path of [
      '/api/public/ask?q=secret', '/api/public/ask/', '//api/public/ask',
      '/api/./public/ask', '/api/public/%61sk', '/api/anything-else',
      '/health/live', '/health/ready',
    ]) {
      const rejected = await rawRequest(proxy.origin, {
        method: 'POST', path, body: 'do-not-reflect', headers: { Host: proxy.authority },
      });
      expect(rejected.status).toBeGreaterThanOrEqual(400);
      expect(rejected.body).not.toMatch(/secret|do-not-reflect/u);
    }
    for (const [method, path] of [['GET', '/api/public/ask'], ['POST', '/']] as const) {
      expect((await rawRequest(proxy.origin, { method, path, headers: { Host: proxy.authority } })).status)
        .toBeGreaterThanOrEqual(400);
    }
    expect(reactRequests).toBe(3);
    expect(apiRequests).toBe(1);
  });

  it('forwards only approved API request identity and seals success/error response headers', async () => {
    const observed: Array<{ headers: IncomingHttpHeaders; method?: string; url?: string }> = [];
    const reactPort = await listen(createServer((_request, response) => response.end('react')));
    const apiPort = await listen(createServer((request, response) => {
      observed.push({ headers: request.headers, method: request.method, url: request.url });
      const status = request.headers['accept-language'] === 'status-429' ? 429 : 200;
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, private',
        Vary: 'Origin',
        'Retry-After': '17',
        'X-Content-Release-Id': 'content-release',
        'X-Answer-Release-Id': 'answer-release',
        'Set-Cookie': 'session=hostile',
        Location: 'https://hostile.example',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Max-Age': '999',
        'Access-Control-Request-Headers': '*',
        'Access-Control-Request-Method': 'POST',
        Server: 'hostile-upstream',
        'X-Powered-By': 'hostile',
        'X-Arbitrary-Upstream': 'hostile',
      });
      response.end(JSON.stringify({ status }));
    }));
    const proxy = await startProxy(reactPort, apiPort);
    const response = await rawRequest(proxy.origin, {
      method: 'POST',
      path: '/api/public/ask',
      body: '{}',
      headers: {
        Host: proxy.authority,
        'Content-Type': 'application/json',
        Origin: 'https://public.example',
        'Sec-Fetch-Site': 'same-origin',
        Accept: 'application/json',
        'Accept-Language': 'status-429',
        Cookie: 'secret=1',
        Authorization: 'Bearer secret',
        'Proxy-Authorization': 'Basic secret',
        Forwarded: 'for=hostile',
        'X-Forwarded-For': 'hostile',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'hostile.example',
        'X-Forwarded-Port': '666',
        'X-Real-IP': '203.0.113.9',
      },
    });
    expect(response.status).toBe(429);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ method: 'POST', url: '/api/public/ask' });
    expect(observed[0]?.headers).toMatchObject({
      host: `127.0.0.1:${apiPort}`,
      origin: 'https://public.example',
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-proto': 'http',
      'x-forwarded-host': proxy.authority,
    });
    expect(JSON.stringify(observed[0]?.headers)).not.toMatch(/hostile|secret|x-forwarded-port|x-real-ip/iu);
    expect(response.headers).toMatchObject({
      'content-type': 'application/json',
      'cache-control': 'no-store, private',
      vary: 'Origin',
      'retry-after': '17',
      'x-content-release-id': 'content-release',
      'x-answer-release-id': 'answer-release',
    });
    expect(JSON.stringify(response.headers)).not.toMatch(
      /set-cookie|location|access-control|x-powered-by|x-arbitrary-upstream|hostile/iu,
    );
  });

  it('rejects missing or hostile Host before either upstream and returns bounded API outage errors', async () => {
    let reactConnections = 0;
    let apiConnections = 0;
    const reactPort = await listen(createServer((_request, response) => { reactConnections += 1; response.end('react'); }));
    const unavailable = createServer((_request, response) => { apiConnections += 1; response.end('{}'); });
    const apiPort = await listen(unavailable);
    closeables.pop();
    const proxy = await startProxy(reactPort, apiPort);

    for (const host of ['hostile.example']) {
      for (const [method, path] of [['POST', '/api/public/ask'], ['GET', '/search/']] as const) {
        const rejected = await rawRequest(proxy.origin, {
          method, path, headers: { Host: host }, body: method === 'POST' ? 'private-question' : undefined,
        });
        expect(rejected.status).toBe(400);
        expect(rejected.body).not.toContain('private-question');
      }
    }
    const url = new URL(proxy.origin);
    const missingHost = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(url.port), url.hostname);
      const chunks: Buffer[] = [];
      socket.once('error', reject);
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.once('connect', () => socket.write('GET /search/ HTTP/1.1\r\nConnection: close\r\n\r\n'));
    });
    expect(missingHost).toMatch(/^HTTP\/1\.1 400 Bad Request/iu);
    expect(apiConnections).toBe(0);
    await new Promise<void>((resolve, reject) => unavailable.close((error) => error ? reject(error) : resolve()));
    const outage = await rawRequest(proxy.origin, {
      method: 'POST', path: '/api/public/ask', headers: { Host: proxy.authority }, body: 'private-question',
    });
    expect(outage.status).toBe(502);
    expect(outage.body).not.toContain('private-question');
    expect(outage.headers['cache-control']).toBe('no-store');
    expect(reactConnections).toBe(0);
    expect(apiConnections).toBe(0);
  });

  it('preserves binding and no-store headers on API success and fallback statuses', async () => {
    const reactPort = await listen(createServer((_request, response) => response.end('react')));
    const apiPort = await listen(createServer((request, response) => {
      const status = Number(request.headers['accept-language']);
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, private',
        Vary: 'Origin',
        ...(status === 429 || status === 503 ? { 'Retry-After': '11' } : {}),
        'X-Content-Release-Id': 'content-release',
        'X-Answer-Release-Id': 'answer-release',
      });
      response.end('{}');
    }));
    const proxy = await startProxy(reactPort, apiPort);
    for (const status of [200, 409, 429, 503]) {
      const response = await rawRequest(proxy.origin, {
        method: 'POST',
        path: '/api/public/ask',
        body: '{}',
        headers: {
          Host: proxy.authority,
          'Content-Type': 'application/json',
          'Accept-Language': String(status),
        },
      });
      expect(response.status).toBe(status);
      expect(response.headers).toMatchObject({
        'cache-control': 'no-store, private',
        'x-content-release-id': 'content-release',
        'x-answer-release-id': 'answer-release',
      });
      expect(response.headers['retry-after']).toBe(status === 429 || status === 503 ? '11' : undefined);
    }
  });

  it('aborts an in-flight API request when the downstream closes and never retries it', async () => {
    let attempts = 0;
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
    const reactPort = await listen(createServer((_request, response) => response.end('react')));
    const apiPort = await listen(createServer((_request, response) => {
      attempts += 1;
      response.once('close', resolveClosed);
    }));
    const proxy = await startProxy(reactPort, apiPort);
    const url = new URL(proxy.origin);
    const client = requestHttp({
      hostname: url.hostname,
      port: url.port,
      method: 'POST',
      path: '/api/public/ask',
      headers: { Host: proxy.authority, 'Content-Type': 'application/json' },
    });
    client.once('error', () => undefined);
    client.end('{}');
    await new Promise((resolve) => setTimeout(resolve, 20));
    client.destroy();
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('upstream was not cancelled')), 1_000)),
    ]);
    expect(attempts).toBe(1);
  });

  it('settles a never-responding API request at the injected deadline and closes upstream work', async () => {
    let attempts = 0;
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
    const reactPort = await listen(createServer((_request, response) => response.end('react')));
    const apiPort = await listen(createServer((_request, response) => {
      attempts += 1;
      response.once('close', resolveClosed);
    }));
    const proxy = await startProxy(reactPort, apiPort, 40);
    const marker = 'private-never-settling-question-7a2d';
    const started = Date.now();
    const deadline = await rawRequest(proxy.origin, {
      method: 'POST',
      path: '/api/public/ask',
      body: JSON.stringify({ question: marker }),
      headers: { Host: proxy.authority, 'Content-Type': 'application/json' },
    });
    const elapsed = Date.now() - started;
    expect(deadline.status).toBe(504);
    expect(deadline.body).not.toContain(marker);
    expect(deadline.headers['cache-control']).toBe('no-store');
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(1_000);
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('deadline did not close upstream work')), 1_000)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(attempts).toBe(1);
  });

  it('rejects oversized bodies and HTTP upgrades before opening the API upstream', async () => {
    let attempts = 0;
    const reactPort = await listen(createServer((_request, response) => response.end('react')));
    const apiPort = await listen(createServer((_request, response) => { attempts += 1; response.end('{}'); }));
    const proxy = await startProxy(reactPort, apiPort);
    const oversized = await rawRequest(proxy.origin, {
      method: 'POST',
      path: '/api/public/ask',
      body: 'x'.repeat(4_097),
      headers: { Host: proxy.authority, 'Content-Type': 'application/json' },
    });
    expect(oversized.status).toBe(413);
    expect(oversized.body).not.toContain('x'.repeat(32));

    const url = new URL(proxy.origin);
    const rawUpgrade = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(url.port), url.hostname);
      const chunks: Buffer[] = [];
      socket.once('error', reject);
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.once('connect', () => socket.write(
        `GET /api/public/ask HTTP/1.1\r\nHost: ${proxy.authority}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      ));
    });
    expect(rawUpgrade).toMatch(/^HTTP\/1\.1 400 Bad Request/iu);
    expect(attempts).toBe(0);
  });

  it('proxies only to React and seals public security headers', async () => {
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('react-only\n');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    closeables.push(upstream);
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('upstream did not bind');
    const proxy = await startProxy(address.port, address.port);
    const response = await fetch(`${proxy.origin}/`);
    expect(await response.text()).toBe('react-only\n');
    expect(response.headers.get('x-beyondwin-renderer')).toBe('react');
    for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }

    const rejected = await fetch(`${proxy.origin}/`, { method: 'POST' });
    expect(rejected.status).toBe(405);
    for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
      expect(rejected.headers.get(name)).toBe(value);
    }
  });

  it('seals public security headers on an upstream connection failure', async () => {
    const unavailable = createServer();
    await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
    const unavailableAddress = unavailable.address();
    if (!unavailableAddress || typeof unavailableAddress === 'string') throw new Error('probe did not bind');
    await new Promise<void>((resolve, reject) => unavailable.close((error) => (error ? reject(error) : resolve())));

    const apiPort = await listen(createServer((_request, response) => response.end('{}')));
    const proxy = await startProxy(unavailableAddress.port, apiPort);

    const response = await fetch(`${proxy.origin}/unreachable`);
    expect(response.status).toBe(502);
    for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it('keeps the prepared reverse proxy on one React origin with the same required headers', async () => {
    const configuration = await readFile(
      new URL('../../deploy/reverse-proxy/public-site.conf', import.meta.url),
      'utf8',
    );
    expect(configuration.match(/^upstream /gmu)).toHaveLength(2);
    expect(configuration).toContain('upstream beyondwin_public_react');
    expect(configuration).toContain('upstream beyondwin_public_api');
    expect(configuration).not.toMatch(/astro|rollback/iu);
    expect(configuration).toContain('Content-Security-Policy');
    expect(configuration).toContain('Referrer-Policy');
    expect(configuration).toContain('X-Content-Type-Options');
    expect(configuration).toContain('location = /api/public/ask');
    expect(configuration).toContain('if ($request_uri != "/api/public/ask") { return 404; }');
    expect(configuration).toContain('proxy_pass_request_headers off;');
    expect(configuration).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(configuration).not.toContain('$proxy_add_x_forwarded_for');
    for (const header of [
      'Set-Cookie', 'Location', 'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials', 'Access-Control-Expose-Headers',
      'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods',
      'Access-Control-Max-Age', 'Access-Control-Request-Headers',
      'Access-Control-Request-Method', 'Server', 'X-Powered-By',
      'X-Beyondwin-Forbidden-Sentinel',
    ]) expect(configuration).toContain(`proxy_hide_header ${header};`);
    expect(configuration).toContain('proxy_redirect off;');
    expect(configuration).toContain('server_tokens off;');
    expect(configuration).toContain('access_log off;');
  });
});
