import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sealChangedSurfacePerformance } from './evidence-contracts.mts';

function argumentsFor(argv: readonly string[]): { input: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if ((key !== '--input' && key !== '--output') || !value || value.startsWith('--') || values.has(key)) {
      throw new Error('usage: --input <performance-json> --output <tracked-receipt>');
    }
    values.set(key, value);
  }
  const input = values.get('--input'); const output = values.get('--output');
  if (!input || !output) throw new Error('usage: --input <performance-json> --output <tracked-receipt>');
  return { input: resolve(input), output: resolve(output) };
}

const cli = argumentsFor(process.argv.slice(2));
const source = JSON.parse(await readFile(cli.input, 'utf8')) as unknown;
const receipt = sealChangedSurfacePerformance(source);
await mkdir(dirname(cli.output), { recursive: true });
await writeFile(cli.output, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ sealed: true, output: cli.output })}\n`);
