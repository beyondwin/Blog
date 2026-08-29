import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_SECURITY_HEADERS } from '../../apps/site/app/delivery';
import { assertOwnedCutoverPath, checkExactDrillPorts, createProxyServer, parseProxyArguments } from './local-proxy.mts';

const closeables: Array<{ close(callback: (error?: Error) => void): void }> = [];
const createdRoots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(closeables.splice(0).map((server) => new Promise<void>((resolve, reject) => (
    server.close((error) => (error ? reject(error) : resolve()))
  ))));
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('React-only local cutover proxy', () => {
  it('accepts one exact loopback React origin and rejects Astro/state arguments', () => {
    const valid = [
      '--listen', '127.0.0.1:4390',
      '--react', 'http://127.0.0.1:4391',
      '--pid-file', '/tmp/beyondwin-cutover.example/proxy.pid',
    ];
    expect(parseProxyArguments(valid)).toMatchObject({
      listen: { host: '127.0.0.1', port: 4390 },
      react: new URL('http://127.0.0.1:4391'),
    });
    expect(() => parseProxyArguments([...valid, '--astro', 'http://127.0.0.1:4392'])).toThrow('unknown');
    expect(() => parseProxyArguments([...valid, '--state', '/tmp/state'])).toThrow('unknown');
    expect(() => parseProxyArguments(valid.map((value) => value === 'http://127.0.0.1:4391'
      ? 'http://example.com:4391'
      : value))).toThrow('loopback');
  });

  it('confines the PID file to one real owned cutover directory', async () => {
    const root = await mkdtemp('/tmp/beyondwin-cutover.');
    createdRoots.push(root);
    await expect(assertOwnedCutoverPath(join(root, 'proxy.pid'))).resolves.toBe(root);
    await expect(assertOwnedCutoverPath(join(root, '..', 'escaped'))).rejects.toThrow('cutover');
  });

  it('checks only the React proxy and origin ports and never stops an occupant', async () => {
    const visited: number[] = [];
    await expect(checkExactDrillPorts(async (port) => {
      visited.push(port);
      return port !== 4391;
    })).rejects.toThrow('4391');
    expect(visited).toEqual([4390, 4391]);
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
    const root = await mkdtemp('/tmp/beyondwin-cutover.');
    createdRoots.push(root);
    const parsed = parseProxyArguments([
      '--listen', '127.0.0.1:4390',
      '--react', `http://127.0.0.1:${address.port}`,
      '--pid-file', join(root, 'proxy.pid'),
    ]);
    const proxy = await createProxyServer({ ...parsed, listen: { ...parsed.listen, port: 0 } });
    closeables.push(proxy);
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('proxy did not bind');
    const response = await fetch(`http://127.0.0.1:${proxyAddress.port}/`);
    expect(await response.text()).toBe('react-only\n');
    expect(response.headers.get('x-beyondwin-renderer')).toBe('react');
    for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }

    const rejected = await fetch(`http://127.0.0.1:${proxyAddress.port}/`, { method: 'POST' });
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

    const root = await mkdtemp('/tmp/beyondwin-cutover.');
    createdRoots.push(root);
    const parsed = parseProxyArguments([
      '--listen', '127.0.0.1:4390',
      '--react', `http://127.0.0.1:${unavailableAddress.port}`,
      '--pid-file', join(root, 'proxy.pid'),
    ]);
    const proxy = await createProxyServer({ ...parsed, listen: { ...parsed.listen, port: 0 } });
    closeables.push(proxy);
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('proxy did not bind');

    const response = await fetch(`http://127.0.0.1:${proxyAddress.port}/unreachable`);
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
    expect(configuration.match(/^upstream /gmu)).toHaveLength(1);
    expect(configuration).toContain('upstream beyondwin_public_react');
    expect(configuration).not.toMatch(/astro|rollback/iu);
    expect(configuration).toContain('Content-Security-Policy');
    expect(configuration).toContain('Referrer-Policy');
    expect(configuration).toContain('X-Content-Type-Options');
  });
});
