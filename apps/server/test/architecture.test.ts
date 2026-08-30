import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const serverRoot = resolve(process.cwd(), 'apps/server');
const sourceRoot = resolve(serverRoot, 'src');
const testRoot = resolve(serverRoot, 'test');

function isExecutableTypeScriptFile(name: string): boolean {
  return /\.(?:[cm]?ts|tsx)$/u.test(name);
}

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
    return entry.isFile() && isExecutableTypeScriptFile(entry.name) ? [path] : [];
  }))).flat().sort();
}

function parseTypeScript(source: string, fileName = 'source.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

function importedSpecifiers(source: string, fileName = 'source.ts'): string[] {
  const sourceFile = parseTypeScript(source, fileName);
  const specifiers: string[] = [];

  function appendLiteral(node: ts.Expression | undefined): void {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      appendLiteral(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      appendLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamicImport) appendLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function hasDecorator(sourceFile: ts.SourceFile): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (ts.canHaveDecorators(node) && (ts.getDecorators(node)?.length ?? 0) > 0) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasProcessEnvironmentAccess(sourceFile: ts.SourceFile): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && node.name.text === 'env'
    ) {
      found = true;
      return;
    }
    if (
      ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && node.argumentExpression
      && ts.isStringLiteralLike(node.argumentExpression)
      && node.argumentExpression.text === 'env'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function isForbiddenLayerModule(specifier: string): boolean {
  return specifier.startsWith('@nestjs/')
    || specifier === 'fastify'
    || specifier.startsWith('fastify/')
    || specifier === 'pg'
    || specifier.startsWith('pg/')
    || specifier === 'zod'
    || specifier.startsWith('zod/')
    || specifier === 'node:fs'
    || specifier.startsWith('node:fs/')
    || specifier === 'node:path'
    || specifier.startsWith('node:path/');
}

function hasForbiddenLayerSyntax(source: string, fileName = 'source.ts'): boolean {
  const sourceFile = parseTypeScript(source, fileName);
  return importedSpecifiers(source, fileName).some(isForbiddenLayerModule)
    || hasDecorator(sourceFile)
    || hasProcessEnvironmentAccess(sourceFile);
}

function relativeSourcePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

async function layerImportViolations(root: string): Promise<string[]> {
  const violations: string[] = [];
  for (const file of await collectTypeScriptFiles(root)) {
    const path = relativeSourcePath(root, file);
    const layer = path.startsWith('domain/')
      ? 'domain'
      : path.startsWith('application/') ? 'application' : undefined;
    if (!layer) continue;

    const source = await readFile(file, 'utf8');
    for (const specifier of importedSpecifiers(source, file)) {
      const target = specifier.startsWith('.')
        ? relativeSourcePath(root, resolve(dirname(file), specifier))
        : specifier;
      const allowed = layer === 'domain'
        ? target.startsWith('domain/')
        : target.startsWith('domain/') || target.startsWith('application/');
      if (!allowed) violations.push(`${path} -> ${specifier}`);
    }
  }
  return violations;
}

async function forbiddenLayerSyntaxViolations(root: string): Promise<string[]> {
  const violations: string[] = [];
  for (const file of await collectTypeScriptFiles(root)) {
    const path = relativeSourcePath(root, file);
    if (!path.startsWith('domain/') && !path.startsWith('application/')) continue;
    if (hasForbiddenLayerSyntax(await readFile(file, 'utf8'), file)) violations.push(path);
  }
  return violations;
}

function sourcePath(path: string): string {
  return relative(serverRoot, path).split(sep).join('/');
}

describe('server architecture boundary', () => {
  it('keeps domain and application imports inside their allowed layers', async () => {
    const files = await collectTypeScriptFiles(sourceRoot);
    expect(files, 'apps/server/src must exist and contain TypeScript source').not.toHaveLength(0);
    expect(await layerImportViolations(sourceRoot)).toEqual([]);
  });

  it('keeps framework, process, filesystem, and decorators out of domain and application', async () => {
    expect(await forbiddenLayerSyntaxViolations(sourceRoot)).toEqual([]);
  });

  it('prevents server source from reaching the site or private memory tree', async () => {
    const violations: string[] = [];
    for (const file of await collectTypeScriptFiles(sourceRoot)) {
      const source = await readFile(file, 'utf8');
      if (importedSpecifiers(source, file).some((specifier) => (
        specifier.includes('apps/site')
        || specifier.includes('/site/')
        || /^(?:\.\.\/)+memory(?:\/|$)/u.test(specifier)
        || specifier === 'memory'
        || specifier.startsWith('memory/')
      ))) {
        violations.push(sourcePath(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps Nest testing utilities out of unit tests', async () => {
    const violations: string[] = [];
    for (const file of await collectTypeScriptFiles(testRoot)) {
      const source = await readFile(file, 'utf8');
      if (importedSpecifiers(source, file).includes('@nestjs/testing')) violations.push(sourcePath(file));
    }
    expect(violations).toEqual([]);
  });

  it.each([
    ['class', '@Injectable() class UseCase {}'],
    ['property', 'class UseCase { @Inject() port!: Port }'],
    ['method', 'class UseCase { @Trace() run() {} }'],
    ['accessor', 'class UseCase { @Trace() get value() { return 1 } }'],
    ['inline parameter', "class UseCase { run(@Inject('port') port: Port) {} }"],
  ])('detects decorators in the %s position', (_position, source) => {
    expect(hasForbiddenLayerSyntax(source)).toBe(true);
  });

  it.each([
    ['import declaration', "import adapter from '../infrastructure/adapter.js'"],
    ['export declaration', "export { adapter } from '../infrastructure/adapter.js'"],
    ['import-equals', "import adapter = require('../infrastructure/adapter.js')"],
    ['static require', "const adapter = require('../infrastructure/adapter.js')"],
    ['literal dynamic import', "const adapter = import('../infrastructure/adapter.js')"],
  ])('detects the %s module load', (_form, source) => {
    expect(importedSpecifiers(source)).toContain('../infrastructure/adapter.js');
  });

  it('reports an application-to-infrastructure static load', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-server-architecture-'));
    try {
      await mkdir(join(fixtureRoot, 'application'));
      await writeFile(
        join(fixtureRoot, 'application', 'use-case.ts'),
        "const adapter = require('../infrastructure/adapter.js');\n",
        'utf8',
      );
      expect(await layerImportViolations(fixtureRoot)).toEqual([
        'application/use-case.ts -> ../infrastructure/adapter.js',
      ]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('reports forbidden imports in every executable TypeScript extension', async () => {
    expect(['probe.ts', 'probe.mts', 'probe.cts', 'probe.tsx'].every(isExecutableTypeScriptFile)).toBe(true);

    const fixtureRoot = await mkdtemp(join(tmpdir(), 'beyondwin-server-architecture-'));
    const applicationRoot = join(fixtureRoot, 'application');
    const fixture = join(applicationRoot, 'bypass.mts');
    try {
      await mkdir(applicationRoot);
      await writeFile(fixture, "import { Pool } from 'pg';\n", 'utf8');
      expect(await forbiddenLayerSyntaxViolations(fixtureRoot)).toEqual(['application/bypass.mts']);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
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
