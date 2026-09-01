import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function runnerModule() {
  return import('./e2e/run-search-provider-stack.mts');
}

describe('search provider stack runner lifecycle', () => {
  it('is import-safe and attempts every cleanup while preserving the primary and cleanup errors', async () => {
    const { settleCleanup } = await runnerModule();
    const attempted: string[] = [];
    const primary = new Error('primary failure');
    const result = await settleCleanup(primary, [
      ['proxy', async () => { attempted.push('proxy'); throw new Error('proxy cleanup'); }],
      ['observer', async () => { attempted.push('observer'); }],
      ['fixture', async () => { attempted.push('fixture'); throw new Error('fixture cleanup'); }],
    ]);

    expect(attempted).toEqual(['proxy', 'observer', 'fixture']);
    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
      'primary failure',
      'proxy cleanup: proxy cleanup',
      'fixture cleanup: fixture cleanup',
    ]);
  });

  it('scrubs every registered driven value and does not retain an unredacted cause', async () => {
    const { scrubDiagnostic } = await runnerModule();
    const values = ['arbitrary private question', '가'.repeat(120), '600자 claim marker'];
    const scrubbed = scrubDiagnostic(
      `Playwright failed: ${values.join(' | ')}`,
      values,
    );
    expect(scrubbed).toBe('Playwright failed: [driven-value] | [driven-value] | [driven-value]');
    for (const value of values) expect(scrubbed).not.toContain(value);
  });

  it('atomically replaces stale evidence only after a complete staging directory exists', async () => {
    const { publishEvidenceDirectory } = await runnerModule();
    const root = await mkdtemp(join(tmpdir(), 'beyondwin-runner-evidence-test-'));
    temporaryRoots.push(root);
    const destination = join(root, 'task8');
    const staging = join(root, 'staging');
    await import('node:fs/promises').then(({ mkdir }) => Promise.all([
      mkdir(destination, { recursive: true }),
      mkdir(staging, { recursive: true }),
    ]));
    await writeFile(join(destination, 'stale.json'), '{}\n');
    await writeFile(join(staging, 'summary.json'), '{"status":"PASS"}\n');

    await publishEvidenceDirectory(staging, destination);

    await expect(readFile(join(destination, 'summary.json'), 'utf8')).resolves.toBe('{"status":"PASS"}\n');
    await expect(readFile(join(destination, 'stale.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
