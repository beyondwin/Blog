import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAstroHtmlContracts, type AstroBaseline } from './html-contract.ts';

export async function captureAstroBaseline(root: string): Promise<AstroBaseline> {
  return { version: 1, routes: await readAstroHtmlContracts(root) };
}

export async function writeAstroBaseline(root: string): Promise<string> {
  const outputPath = join(root, 'tests/fixtures/parity/astro-public-baseline.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(await captureAstroBaseline(root), null, 2)}\n`);
  return outputPath;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputPath = await writeAstroBaseline(process.cwd());
  console.log(`Captured Astro public baseline at ${outputPath}`);
}
