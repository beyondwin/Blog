import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = resolve(process.cwd(), 'apps/server');
const sourceRoot = resolve(serverRoot, 'src');
const testRoot = resolve(serverRoot, 'test');

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  }))).flat().sort();
}

function importedSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu),
    ...source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
  ].map((match) => match[1]);
}

function sourcePath(path: string): string {
  return relative(serverRoot, path).split(sep).join('/');
}

function resolvedImport(importer: string, specifier: string): string {
  return resolve(dirname(importer), specifier.replace(/\.js$/u, '.ts'));
}

describe('server architecture boundary', () => {
  it('keeps domain and application imports inside their allowed layers', async () => {
    const files = await collectTypeScriptFiles(sourceRoot);
    expect(files, 'apps/server/src must exist and contain TypeScript source').not.toHaveLength(0);

    const violations: string[] = [];
    for (const file of files) {
      const path = sourcePath(file);
      const layer = path.startsWith('src/domain/')
        ? 'domain'
        : path.startsWith('src/application/') ? 'application' : undefined;
      if (!layer) continue;

      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        const target = specifier.startsWith('.') ? sourcePath(resolvedImport(file, specifier)) : specifier;
        const allowed = layer === 'domain'
          ? target.startsWith('src/domain/')
          : target.startsWith('src/domain/') || target.startsWith('src/application/');
        if (!allowed) violations.push(`${path} -> ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps framework, process, filesystem, and decorators out of domain and application', async () => {
    const files = (await collectTypeScriptFiles(sourceRoot)).filter((file) => {
      const path = sourcePath(file);
      return path.startsWith('src/domain/') || path.startsWith('src/application/');
    });
    const forbidden = /@nestjs\/|\bfastify\b|(?:^|['"]|\s)pg(?:['"]|\/)|\bzod\b|process\.env|node:fs|node:path|(^|\n)\s*@\w+/mu;
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (forbidden.test(source)) violations.push(sourcePath(file));
    }

    expect(violations).toEqual([]);
  });

  it('prevents server source from reaching the site or private memory tree', async () => {
    const violations: string[] = [];
    for (const file of await collectTypeScriptFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8');
      if (/apps\/site|\/site\/|(?:^|['"]|\.\.\/)memory(?:\/|['"])/mu.test(source)) {
        violations.push(sourcePath(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps Nest testing utilities out of unit tests', async () => {
    const violations: string[] = [];
    for (const file of await collectTypeScriptFiles(testRoot)) {
      const source = await readFile(file, 'utf8');
      if (importedSpecifiers(source).includes('@nestjs/testing')) violations.push(sourcePath(file));
    }
    expect(violations).toEqual([]);
  });

  it('creates a non-listening Fastify application with the sealed liveness boundary', async () => {
    const { createApplication } = await import('../src/main.js');
    const app = await createApplication();
    const fastify = app.getHttpAdapter().getInstance();

    try {
      expect(fastify.server.listening).toBe(false);
      fastify.post('/__body-limit-probe', async () => ({ accepted: true }));
      await app.init();

      const live = await fastify.inject({ method: 'GET', url: '/health/live' });
      expect(live.statusCode).toBe(200);
      expect(live.json()).toEqual({ status: 'live' });
      expect(live.headers).not.toHaveProperty('access-control-allow-origin');

      const oversized = await fastify.inject({
        method: 'POST',
        url: '/__body-limit-probe',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ value: 'x'.repeat(4096) }),
      });
      expect(oversized.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});
