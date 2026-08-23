import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'parse5';

interface HtmlNode {
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  nodeName?: string;
  tagName?: string;
  value?: string;
}

export interface AstroRouteContract {
  path: string;
  canonical: string;
  title: string;
  description: string;
  headings: Array<{ level: number; text: string; id?: string }>;
  bodyTextHash: string;
  internalHrefs: string[];
  imageAttributes: Array<Record<string, string>>;
  outputAssetPaths: string[];
}

export interface AstroBaseline {
  version: 1;
  routes: AstroRouteContract[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function attributes(node: HtmlNode): Record<string, string> {
  return Object.fromEntries(
    (node.attrs ?? [])
      .map(({ name, value }) => [name, value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  if (node.tagName === 'script' || node.tagName === 'style' || node.tagName === 'template') return '';
  return (node.childNodes ?? []).map(textContent).join('');
}

function findElements(node: HtmlNode, tagName: string, matches: HtmlNode[] = []): HtmlNode[] {
  if (node.tagName === tagName) matches.push(node);
  for (const child of node.childNodes ?? []) findElements(child, tagName, matches);
  return matches;
}

function findFirstElement(node: HtmlNode, tagName: string): HtmlNode | undefined {
  if (node.tagName === tagName) return node;
  for (const child of node.childNodes ?? []) {
    const match = findFirstElement(child, tagName);
    if (match) return match;
  }
  return undefined;
}

function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function isOutputAssetPath(value: string): boolean {
  return value.startsWith('/_astro/') || value === '/favicon.svg';
}

function assetPathsFromAttributes(attrs: Record<string, string>): string[] {
  const values = [attrs.href, attrs.src, attrs.srcset].filter((value): value is string => Boolean(value));
  return values.flatMap((value) => value.split(',').map((entry) => entry.trim().split(/\s+/u)[0]))
    .filter(isOutputAssetPath);
}

function routePath(outputPath: string): string {
  const normalized = outputPath.split(sep).join('/');
  if (normalized === 'index.html') return '/';
  return `/${normalized.replace(/\/index\.html$/u, '/').replace(/\.html$/u, '/')}`;
}

async function findHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
  }));
  return files.flat();
}

export function buildHtmlContract(path: string, html: string): AstroRouteContract {
  const document = parse(html) as unknown as HtmlNode;
  const title = normalizeText(textContent(findFirstElement(document, 'title') ?? {}));
  const body = findFirstElement(document, 'body');
  const metaDescription = findElements(document, 'meta').find((node) => attributes(node).name === 'description');
  const canonical = findElements(document, 'link').find((node) => {
    const attrs = attributes(node);
    return attrs.rel === 'canonical';
  });
  const headingNodes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].flatMap((tagName) => findElements(document, tagName));
  const linkedNodes = findElements(document, 'a');
  const assetNodes = ['img', 'link', 'script', 'source'].flatMap((tagName) => findElements(document, tagName));

  return {
    path,
    canonical: attributes(canonical ?? {}).href ?? '',
    title,
    description: attributes(metaDescription ?? {}).content ?? '',
    headings: headingNodes.map((node) => {
      const attrs = attributes(node);
      const result = { level: Number(node.tagName?.slice(1)), text: normalizeText(textContent(node)) };
      return attrs.id ? { ...result, id: attrs.id } : result;
    }),
    bodyTextHash: createHash('sha256').update(normalizeText(textContent(body ?? {}))).digest('hex'),
    internalHrefs: [...new Set(linkedNodes.map((node) => attributes(node).href).filter(isInternalHref))].sort(),
    imageAttributes: findElements(document, 'img').map(attributes),
    outputAssetPaths: [...new Set(assetNodes.flatMap((node) => assetPathsFromAttributes(attributes(node))))].sort(),
  };
}

export async function readAstroHtmlContracts(root: string): Promise<AstroRouteContract[]> {
  const outputDirectory = join(root, 'dist');
  const htmlFiles = await findHtmlFiles(outputDirectory);
  const contracts = await Promise.all(htmlFiles.map(async (file) => {
    const outputPath = relative(outputDirectory, file);
    return buildHtmlContract(routePath(outputPath), await readFile(file, 'utf8'));
  }));
  return contracts.sort((left, right) => left.path.localeCompare(right.path));
}

export function assertAstroBaselinesMatch(expected: AstroBaseline, actual: AstroBaseline): void {
  const actualByPath = new Map(actual.routes.map((route) => [route.path, route]));

  for (const expectedRoute of expected.routes) {
    const actualRoute = actualByPath.get(expectedRoute.path);
    if (!actualRoute) throw new Error(`Route ${expectedRoute.path}: missing route`);

    for (const field of Object.keys(expectedRoute) as Array<keyof AstroRouteContract>) {
      if (JSON.stringify(expectedRoute[field]) !== JSON.stringify(actualRoute[field])) {
        throw new Error(`Route ${expectedRoute.path}: ${field} drifted`);
      }
    }

    actualByPath.delete(expectedRoute.path);
  }

  const [unexpectedRoute] = actualByPath.keys();
  if (unexpectedRoute) throw new Error(`Route ${unexpectedRoute}: unexpected route`);
}
