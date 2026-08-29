import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_SECURITY_HEADERS } from '../app/delivery';
import { startStaticSiteServer } from '../serve-static';

const servers: Array<Awaited<ReturnType<typeof startStaticSiteServer>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('React-only static host', () => {
  it('serves directory indexes and static artifacts with the sealed headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'form-thought-static-'));
    await mkdir(join(root, 'articles'), { recursive: true });
    await writeFile(join(root, 'articles/index.html'), '<h1>Articles</h1>');
    await writeFile(join(root, 'robots.txt'), 'User-agent: *\n');
    await writeFile(join(root, '404.html'), '<h1>Not found</h1>');
    const server = await startStaticSiteServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);

    const article = await fetch(`${server.origin}/articles/`);
    expect(article.status).toBe(200);
    expect(await article.text()).toContain('Articles');
    for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
      expect(article.headers.get(name)).toBe(value);
    }
    expect((await fetch(`${server.origin}/robots.txt`)).status).toBe(200);
  });

  it('returns the branded 404 body with an actual 404 status and rejects traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'form-thought-static-'));
    await writeFile(join(root, '404.html'), '<h1>Not found</h1>');
    const server = await startStaticSiteServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);

    for (const path of ['/definitely-missing/', '/..%2Fpackage.json']) {
      const response = await fetch(`${server.origin}${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain('Not found');
    }
  });

  it('never follows a final-file or nested-directory symlink outside the static root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'form-thought-static-'));
    const outside = await mkdtemp(join(tmpdir(), 'form-thought-outside-'));
    await mkdir(join(outside, 'nested'));
    await writeFile(join(outside, 'secret.txt'), 'outside final secret');
    await writeFile(join(outside, 'nested/index.html'), 'outside nested secret');
    await writeFile(join(root, '404.html'), '<h1>Not found</h1>');
    await writeFile(join(root, 'safe.txt'), 'safe public file');
    await symlink(join(outside, 'secret.txt'), join(root, 'leak.txt'));
    await symlink(join(outside, 'nested'), join(root, 'nested'));
    const server = await startStaticSiteServer({ root, host: '127.0.0.1', port: 0 });
    servers.push(server);

    const safe = await fetch(`${server.origin}/safe.txt`);
    expect(safe.status).toBe(200);
    expect(await safe.text()).toBe('safe public file');
    for (const path of ['/leak.txt', '/nested/']) {
      const response = await fetch(`${server.origin}${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain('Not found');
    }
  });

  it('rejects a symlinked 404 fallback instead of reading outside-root bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'form-thought-static-'));
    const outside = await mkdtemp(join(tmpdir(), 'form-thought-outside-'));
    await writeFile(join(outside, 'secret.html'), '<h1>outside fallback secret</h1>');
    await symlink(join(outside, 'secret.html'), join(root, '404.html'));

    await expect(startStaticSiteServer({ root, host: '127.0.0.1', port: 0 }))
      .rejects.toThrow(/404|symbolic|symlink|outside/iu);
  });
});
