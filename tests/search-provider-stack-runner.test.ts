import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function runnerModule() {
  return import('./e2e/run-search-provider-stack.mts');
}

describe('search provider stack runner lifecycle', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'settles the actual runner-level %s handler before its child process exits',
    async (signal) => {
      const root = await mkdtemp(join(tmpdir(), 'beyondwin-runner-signal-test-'));
      temporaryRoots.push(root);
      const child = spawn(process.execPath, [
        '--import', 'tsx', resolve('tests/fixtures/search-provider-stack-signal-target.mts'), root,
      ], { cwd: resolve('.'), stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      await expect.poll(async () => readFile(join(root, 'ready'), 'utf8').then(() => true, () => false), {
        timeout: 2_000,
      }).toBe(true);
      child.kill(signal);
      const exit = await Promise.race([
        new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
          child.once('error', reject);
          child.once('exit', (code, exitSignal) => accept({ code, signal: exitSignal }));
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('signal target did not exit')), 2_000)),
      ]);

      expect(exit, stderr).toEqual({ code: 0, signal: null });
      expect(JSON.parse(await readFile(join(root, 'outcome.json'), 'utf8'))).toEqual({
        events: ['child.stop', 'preview.start', 'preview.finish'],
        interrupted: signal,
        errors: [`runner interrupted by ${signal}`, 'preview cleanup: preview failed'],
      });
    },
  );

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'awaits the in-flight %s cleanup exactly once and preserves its failure',
    async (signal) => {
      const { createCleanupRegistry, installRunnerSignalHandlers } = await runnerModule();
      const source = new EventEmitter();
      const registry = createCleanupRegistry();
      const events: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const cleanup = registry.register('preview', async () => {
        events.push('preview.start');
        await gate;
        events.push('preview.finish');
        throw new Error('preview failed');
      });
      const controller = installRunnerSignalHandlers({
        source,
        children: () => [{ stop: async () => { events.push('child.stop'); } }],
        cleanups: () => registry.entries(),
      });

      source.emit(signal);
      const duplicate = cleanup().catch(() => undefined);
      await Promise.resolve();
      expect(events).toEqual(['child.stop', 'preview.start']);
      release();
      const result = await Promise.race([
        controller.outcome(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signal cleanup did not settle')), 1_000)),
      ]);
      await duplicate;

      expect(controller.interrupted()).toBe(signal);
      expect(events).toEqual(['child.stop', 'preview.start', 'preview.finish']);
      expect(result).toBeInstanceOf(AggregateError);
      expect((result as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
        `runner interrupted by ${signal}`,
        'preview cleanup: preview failed',
      ]);
      controller.remove();
    },
  );

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

  it('persists canonical per-request observer booleans with a recomputable checksum', async () => {
    const { canonicalObserverEvidence } = await runnerModule();
    const receipt = {
      authorizationPresent: false,
      constructedForEqualsPeer: true,
      constructedHostEqualsProxy: true,
      constructedProtoHttp: true,
      cookiePresent: false,
      forwardedPresent: false,
      proxyAuthorizationPresent: false,
      refererPresent: false,
      unexpectedForwardedPresent: false,
      xRealIpPresent: false,
    };
    const receipts = [receipt, receipt];
    const expectedChecksum = `sha256:${createHash('sha256').update(JSON.stringify(receipts)).digest('hex')}`;

    expect(canonicalObserverEvidence(receipts, 2)).toEqual({
      requestCount: 2,
      expectedRequestCount: 2,
      receiptChecksum: expectedChecksum,
      receipts,
    });
  });
});
