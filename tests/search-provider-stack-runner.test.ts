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

  it('refuses OPENAI_API_KEY before any fixture cell work', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'must-not-call-openai';
    try {
      const { runSearchProviderStack } = await runnerModule();
      await expect(runSearchProviderStack()).rejects.toThrow(/refuses OPENAI_API_KEY/u);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});

async function liveRunnerModule() {
  return import('./e2e/run-search-provider-live-stack.mts');
}

describe('search provider live smoke runner', () => {
  const sentinels = Object.freeze({
    key: 'sk-live-sentinel-key',
    question: 'private live question text',
    answer: 'private live answer text',
    excerpt: 'private live excerpt text',
  });

  it('refuses to start unless key, confirm env, and USD 1 budget all pass', async () => {
    const { assertLiveSmokeReady, requiredLiveSmokeReservationMicroUsd, runSearchProviderLiveStack } = await liveRunnerModule();
    const { WORST_CASE_COST_MICROUSD } = await import(
      '../apps/server/src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js'
    );
    const indexReservationMicroUsd = 12_000;
    const required = requiredLiveSmokeReservationMicroUsd(indexReservationMicroUsd);
    expect(required).toBe(indexReservationMicroUsd + 2 * WORST_CASE_COST_MICROUSD);
    expect(required).toBeLessThanOrEqual(1_000_000);

    expect(() => assertLiveSmokeReady({
      env: { OPENAI_API_KEY: 'k' },
      argv: ['--confirm-live-provider'],
      availableMicroUsd: 1_000_000,
      indexReservationMicroUsd,
    })).toThrow(/FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE/u);

    expect(() => assertLiveSmokeReady({
      env: { FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true' },
      argv: ['--confirm-live-provider'],
      availableMicroUsd: 1_000_000,
      indexReservationMicroUsd,
    })).toThrow(/OPENAI_API_KEY/u);

    expect(() => assertLiveSmokeReady({
      env: { OPENAI_API_KEY: 'k', FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true' },
      argv: ['--confirm-live-provider'],
      availableMicroUsd: required - 1,
      indexReservationMicroUsd,
    })).toThrow(/index plus two worst-case questions under USD 1/u);

    expect(() => assertLiveSmokeReady({
      env: { OPENAI_API_KEY: 'k', FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true' },
      argv: ['--confirm-live-provider'],
      availableMicroUsd: 1_000_000,
      indexReservationMicroUsd: 1_000_000,
    })).toThrow(/index plus two worst-case questions under USD 1/u);

    expect(() => assertLiveSmokeReady({
      env: { OPENAI_API_KEY: 'k', FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true' },
      argv: ['--confirm-live-provider'],
      availableMicroUsd: 1_000_000,
      indexReservationMicroUsd,
    })).not.toThrow();

    const events: string[] = [];
    const blocked = {
      env: { FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true' } as NodeJS.ProcessEnv,
      argv: ['--confirm-live-provider'],
      snapshotLedger: async () => {
        events.push('ledger');
        return { month: '2026-09', hardCapMicroUsd: 1_000_000 as const, chargedMicroUsd: 0, availableMicroUsd: 1_000_000 };
      },
      indexReservationMicroUsd: async () => {
        events.push('index');
        return indexReservationMicroUsd;
      },
      startLive: async () => {
        events.push('start');
        throw new Error('live command must not start');
      },
    };
    await expect(runSearchProviderLiveStack(blocked)).rejects.toThrow(/OPENAI_API_KEY/u);
    expect(events).toEqual([]);
  });

  it('parses a synthetic redacted live receipt and rejects secret or raw-text sentinels', async () => {
    const { parseLiveSmokeReceipt, assertNoLiveSmokeSentinels } = await liveRunnerModule();
    const { PROVIDER_MODEL_POLICY } = await import(
      '../apps/server/src/modules/public-answer/infrastructure/openai/provider-model-policy.js'
    );
    const receipt = {
      schemaVersion: 1 as const,
      status: 'PASS' as const,
      fixtureMode: false as const,
      provenance: 'local-non-zdr' as const,
      generationModel: 'gpt-5.6-luna' as const,
      semanticModel: 'gpt-5.6-luna' as const,
      reasoningEffort: 'high' as const,
      embeddingModel: 'text-embedding-3-large' as const,
      policyHash: PROVIDER_MODEL_POLICY.policyHash,
      liveProviderCalls: 4,
      answeredQuestions: 1,
      fallbackQuestions: 1,
      viewports: ['1440x900', '390x844'] as const,
      ledger: {
        month: '2026-09',
        hardCapMicroUsd: 1_000_000 as const,
        beforeChargedMicroUsd: 10_000,
        afterChargedMicroUsd: 18_420,
        chargedDeltaMicroUsd: 8_420,
        availableMicroUsd: 981_580,
        reconciled: true as const,
      },
      cleanup: {
        ownedProcesses: 0,
        composeProjects: 0,
        containers: 0,
        volumes: 0,
        tempDirectories: 0,
      },
    };

    expect(parseLiveSmokeReceipt(receipt)).toEqual(receipt);
    expect(() => assertNoLiveSmokeSentinels(JSON.stringify(receipt), Object.values(sentinels))).not.toThrow();

    expect(() => parseLiveSmokeReceipt({ ...receipt, generationModel: 'gpt-5.4-mini-2026-03-17' }))
      .toThrow(/gpt-5\.6-luna|unsupported provider model/u);
    expect(() => parseLiveSmokeReceipt({ ...receipt, reasoningEffort: 'none' })).toThrow(/high/u);
    expect(() => parseLiveSmokeReceipt({ ...receipt, fixtureMode: true })).toThrow(/fixtureMode/u);
    expect(() => parseLiveSmokeReceipt({ ...receipt, liveProviderCalls: 0 })).toThrow(/liveProviderCalls/u);
    expect(() => parseLiveSmokeReceipt({ ...receipt, answeredQuestions: 0, fallbackQuestions: 2 }))
      .toThrow(/answeredQuestions/u);
    expect(() => parseLiveSmokeReceipt({
      ...receipt,
      ledger: { ...receipt.ledger, chargedDeltaMicroUsd: 0, afterChargedMicroUsd: 10_000 },
    })).toThrow(/chargedDeltaMicroUsd/u);
    expect(() => parseLiveSmokeReceipt({
      ...receipt,
      ledger: { ...receipt.ledger, afterChargedMicroUsd: 1_000_001, chargedDeltaMicroUsd: 990_001, availableMicroUsd: -1 },
    })).toThrow(/1,000,000|hard cap/u);
    expect(() => parseLiveSmokeReceipt({ ...receipt, notes: sentinels.question })).toThrow(/unknown|sentinel|fields/u);
    expect(() => assertNoLiveSmokeSentinels(
      JSON.stringify({ ...receipt, leak: sentinels.key }),
      Object.values(sentinels),
    )).toThrow(/sentinel/u);
    expect(() => assertNoLiveSmokeSentinels(sentinels.answer, [sentinels.answer])).toThrow(/sentinel/u);
    expect(() => assertNoLiveSmokeSentinels(sentinels.excerpt, [sentinels.excerpt])).toThrow(/sentinel/u);
  });
});
