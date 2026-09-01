import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createCleanupRegistry,
  installRunnerSignalHandlers,
} from '../e2e/run-search-provider-stack.mts';

const receiptRoot = process.argv[2];
if (!receiptRoot) throw new Error('signal target requires an owned receipt root');
await mkdir(receiptRoot, { recursive: true });

const events: string[] = [];
const registry = createCleanupRegistry();
const cleanup = registry.register('preview', async () => {
  events.push('preview.start');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  events.push('preview.finish');
  throw new Error('preview failed');
});
const signals = installRunnerSignalHandlers({
  children: () => [{ stop: async () => { events.push('child.stop'); } }],
  cleanups: () => registry.entries(),
});
await writeFile(resolve(receiptRoot, 'ready'), 'ready\n');

while (!signals.interrupted()) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
const duplicate = cleanup().catch(() => undefined);
const outcome = await signals.outcome();
await duplicate;
signals.remove();
await writeFile(resolve(receiptRoot, 'outcome.json'), `${JSON.stringify({
  events,
  interrupted: signals.interrupted(),
  errors: outcome instanceof AggregateError
    ? outcome.errors.map((error) => error instanceof Error ? error.message : String(error))
    : [],
})}\n`);
