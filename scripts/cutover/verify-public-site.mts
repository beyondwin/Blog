import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readActiveRelease } from '../../packages/content/src/release/read-release.ts';
import { fullPublicPaths } from '../../apps/site/app/release.server.ts';
import {
  LOCAL_SITE_ORIGIN,
  PUBLIC_SECURITY_HEADERS,
  robotsText,
  sitemapXml,
} from '../../apps/site/app/delivery.ts';
import {
  assertReactPerformanceReceipt,
  assertReactPublicSiteReceipt,
} from './evidence-contracts.mts';

export interface ProductionBoundary {
  productionCanonicalOrigin: 'not_measured';
  production_cutover_authorized: false;
  productionHost: null;
}

export function assertPreparedPublicProxyConfiguration(configuration: string): void {
  const upstreams = configuration.match(/^upstream /gmu) ?? [];
  if (upstreams.length !== 2
    || !configuration.includes('upstream beyondwin_public_react')
    || !configuration.includes('upstream beyondwin_public_api')
    || /astro|rollback/iu.test(configuration)) {
    throw new Error('Prepared reverse proxy must contain exact React and public API upstreams only');
  }
  if (!configuration.includes('location = /api/public/ask')) {
    throw new Error('Prepared reverse proxy must use one exact public answer location');
  }
  if (!configuration.includes('if ($request_uri != "/api/public/ask") { return 404; }')) {
    throw new Error('Prepared reverse proxy must reject every non-exact raw request target');
  }
  for (const required of [
    'if ($request_method != POST) { return 405; }',
    'if ($http_host != "localhost:4389") { return 400; }',
    'proxy_pass_request_headers off;',
    'proxy_set_header X-Forwarded-For $remote_addr;',
    'proxy_set_header X-Forwarded-Proto http;',
    'proxy_set_header X-Forwarded-Host localhost:4389;',
    'location ^~ /api/ { return 404; }',
    'location ^~ /health/ { return 404; }',
  ]) {
    if (!configuration.includes(required)) throw new Error(`Prepared proxy contract is missing: ${required}`);
  }
  if (configuration.includes('$proxy_add_x_forwarded_for')
    || configuration.includes('proxy_set_header X-Forwarded-Host $host')
    || configuration.includes('proxy_set_header X-Forwarded-Proto $scheme')) {
    throw new Error('Prepared proxy forwarding identity must overwrite, never append or trust inbound values');
  }
}

export function assertProductionBoundary(input: {
  productionCanonicalOrigin: unknown;
  production_cutover_authorized: unknown;
  productionHost: unknown;
}): asserts input is ProductionBoundary {
  if (input.productionCanonicalOrigin !== 'not_measured') {
    throw new Error('Production canonical origin must remain not_measured until a domain is approved');
  }
  if (input.production_cutover_authorized !== false || input.productionHost !== null) {
    throw new Error('Production cutover remains unauthorized and the production host must remain unset');
  }
}

function routeOutput(root: string, route: string): string {
  return route === '/'
    ? join(root, 'index.html')
    : join(root, decodeURIComponent(route.slice(1)), 'index.html');
}

export async function verifyStaticDelivery(
  publicRoot: string,
  paths: readonly string[],
  origin: string,
): Promise<{ routeCount: number; sitemapCount: number }> {
  const uniquePaths = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  for (const path of uniquePaths) {
    const state = await stat(routeOutput(publicRoot, path)).catch(() => null);
    if (!state?.isFile()) throw new Error(`React static route output is missing: ${path}`);
  }
  const [sitemap, robots, notFound, headers, manifest, icon] = await Promise.all([
    readFile(join(publicRoot, 'sitemap.xml'), 'utf8'),
    readFile(join(publicRoot, 'robots.txt'), 'utf8'),
    readFile(join(publicRoot, '404.html'), 'utf8'),
    readFile(join(publicRoot, '_headers'), 'utf8'),
    readFile(join(publicRoot, 'site.webmanifest'), 'utf8'),
    readFile(join(publicRoot, 'favicon.svg'), 'utf8'),
  ]);
  const expectedSitemap = sitemapXml(uniquePaths, origin);
  if (sitemap !== expectedSitemap) throw new Error('Generated sitemap does not match the exact release-derived inventory');
  if (robots !== robotsText(origin)) throw new Error('Generated robots policy or sitemap pointer drifted');
  if (!notFound.includes('페이지를 찾을 수 없습니다') || !notFound.includes('FORM &amp; THOUGHT')) {
    throw new Error('Branded static 404 artifact is missing');
  }
  for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
    if (!headers.includes(`${name}: ${value}`)) throw new Error(`Static header policy is missing ${name}`);
  }
  if (JSON.parse(manifest).name !== 'FORM & THOUGHT' || !icon.includes('#AF6047')) {
    throw new Error('FORM & THOUGHT manifest/icon contract drifted');
  }
  return { routeCount: uniquePaths.length, sitemapCount: (sitemap.match(/<url>/gu) ?? []).length };
}

export async function verifyReactPublicSite({
  root = process.cwd(),
  performancePath,
}: {
  root?: string;
  performancePath: string;
}): Promise<Record<string, unknown>> {
  const repositoryRoot = resolve(root);
  const performance = JSON.parse(await readFile(resolve(repositoryRoot, performancePath), 'utf8')) as unknown;
  assertReactPerformanceReceipt(performance);
  const active = await readActiveRelease(join(repositoryRoot, 'build/public-releases'));
  const paths = fullPublicPaths(active);
  if (paths.length !== 93) throw new Error(`Expected exact release-derived route count 93, got ${paths.length}`);
  await verifyStaticDelivery(join(repositoryRoot, 'apps/site/build/client'), paths, LOCAL_SITE_ORIGIN);
  const reverseProxy = await readFile(join(repositoryRoot, 'deploy/reverse-proxy/public-site.conf'), 'utf8');
  assertPreparedPublicProxyConfiguration(reverseProxy);
  const production = {
    productionCanonicalOrigin: 'not_measured' as const,
    production_cutover_authorized: false as const,
    productionHost: null,
  };
  assertProductionBoundary(production);
  const receipt = {
    schemaVersion: 3,
    renderer: 'react-router',
    implementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
    releaseId: active.manifest.releaseId,
    routeCount: paths.length,
    ...production,
    errors: [],
  };
  assertReactPublicSiteReceipt(receipt);
  return receipt;
}

function parseArguments(argv: readonly string[]): { performancePath: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if ((key !== '--performance' && key !== '--output') || !value || value.startsWith('--') || values.has(key)) {
      throw new Error('usage: --performance <performance-json> --output <receipt>');
    }
    values.set(key, value);
  }
  const performancePath = values.get('--performance');
  const output = values.get('--output');
  if (!performancePath || !output) throw new Error('usage: --performance <performance-json> --output <receipt>');
  return { performancePath, output: resolve(output) };
}

async function main(): Promise<void> {
  const cli = parseArguments(process.argv.slice(2));
  const receipt = await verifyReactPublicSite({ performancePath: cli.performancePath });
  await mkdir(dirname(cli.output), { recursive: true });
  await writeFile(cli.output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: 'passed', output: cli.output })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
