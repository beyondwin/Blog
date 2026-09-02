import { describe, expect, it } from 'vitest';

import {
  confirmOwnedChildStop,
  stopOwnedChildrenInReverse,
} from '../cutover/owned-process-lifecycle.mts';
import {
  applyIgnoredLocalEnv,
  parseIgnoredLocalEnvFile,
} from './local-env.mts';
import {
  parseLocalLiveArguments,
  preflight,
  redactLiveDiagnostics,
  runLocalLiveHarness,
  type LocalLiveHarnessDependencies,
  type OwnedLiveProcess,
} from './local-live.mts';

const SENTINEL_KEY = 'sk-live-sentinel-key-do-not-leak';
const SENTINEL_QUESTION = 'sentinel-local-live-question';

function hanging(): Promise<void> {
  return new Promise(() => undefined);
}

function liveChild(
  role: OwnedLiveProcess['role'],
  events: string[],
  options: { confirm?: boolean; startup?: Promise<void>; wait?: Promise<void> } = {},
): OwnedLiveProcess {
  let finish!: () => void;
  const wait = options.wait ?? new Promise<void>((resolve) => { finish = resolve; });
  return {
    role,
    startup: options.startup ?? Promise.resolve(),
    wait,
    output: () => '',
    signal(signal) {
      events.push(`${role}.signal:${signal}`);
      if (options.confirm !== false) finish?.();
    },
  };
}

function harness(overrides: Partial<LocalLiveHarnessDependencies> = {}) {
  const events: string[] = [];
  const printed: string[] = [];
  const nestEnv: NodeJS.ProcessEnv[] = [];
  const buildEnv: NodeJS.ProcessEnv[] = [];
  const indexEnv: NodeJS.ProcessEnv[] = [];
  const previewEnv: NodeJS.ProcessEnv[] = [];
  const proxyEnv: NodeJS.ProcessEnv[] = [];
  const dependencies: LocalLiveHarnessDependencies = {
    env: { OPENAI_API_KEY: 'test-local-key' },
    nodeMajor: 24,
    async dockerAvailable() { events.push('docker.check'); return true; },
    async portIsFree() { events.push('port.check'); return true; },
    async reservePorts(requested) {
      events.push(`ports.reserve:${requested ?? 'auto'}`);
      return { proxy: requested ?? 4328, nest: 4329, preview: 4330 };
    },
    async verifyReleases() { events.push('release.verify'); },
    async createOwnedState() {
      events.push('state.create');
      return {
        tempRoot: '/tmp/beyondwin-public-answer-live.test',
        stateRoot: '/repo/.superpowers/runtime/public-answer-live',
        cutoverRoot: '/tmp/beyondwin-cutover.test',
        authorizationPath: '/repo/.superpowers/runtime/public-answer-live/authorization.json',
        ledgerPath: '/repo/.superpowers/runtime/public-answer-live/budget-ledger.json',
        embeddingReceiptRoot: '/repo/.superpowers/runtime/public-answer-live/embedding-receipts',
      };
    },
    async writeAuthorization() { events.push('authorization.write'); },
    async openLedger() {
      events.push('ledger.open');
      return { async snapshot() { return { availableMicroUsd: 1_000_000 }; } };
    },
    async calculateIndexReservation() { events.push('reservation.calculate'); return 20; },
    async startDatabase() {
      events.push('database.start');
      return { databaseUrl: 'postgresql://fixture:fixture@127.0.0.1:6543/fixture', async stop() { events.push('database.stop'); } };
    },
    async migrate() { events.push('migration.apply'); },
    async index(env) { indexEnv.push(env); events.push('index.live'); },
    async reopenBinding() { events.push('binding.reopen'); },
    async buildSite(env) { buildEnv.push(env); events.push('site.build'); },
    startNest(env) { nestEnv.push(env); events.push('nest.start'); return liveChild('nest', events); },
    startPreview(env) { previewEnv.push(env); events.push('preview.start'); return liveChild('preview', events); },
    startProxy(env) { proxyEnv.push(env); events.push('proxy.start'); return liveChild('proxy', events); },
    async ready(url) { events.push(`ready:${url}`); return true; },
    print(value) { printed.push(value); events.push(`print:${value.trim()}`); },
    sleep: async () => undefined,
    startupDeadlineMs: 20_000,
    clock: () => 0,
    onSignal() { return () => { events.push('signals.remove'); }; },
    async waitAttached() { events.push('attached'); },
    async removeTempState() { events.push('temp.remove'); },
    redactValues: [],
    ...overrides,
  };
  return { dependencies, events, printed, nestEnv, buildEnv, indexEnv, previewEnv, proxyEnv };
}

describe('local live argument parser and preflight', () => {
  it('defaults to loopback with an unrequested port', () => {
    expect(parseLocalLiveArguments([])).toEqual({ host: '127.0.0.1', port: null });
  });

  it('rejects duplicate port flags', () => {
    expect(() => parseLocalLiveArguments(['--port', '4328', '--port', '4329'])).toThrow(/duplicate/u);
  });

  it('parses one explicit loopback port and rejects invalid values', () => {
    expect(parseLocalLiveArguments(['--port', '4328'])).toEqual({ host: '127.0.0.1', port: 4328 });
    expect(parseLocalLiveArguments(['--port=4331'])).toEqual({ host: '127.0.0.1', port: 4331 });
    expect(() => parseLocalLiveArguments(['--port'])).toThrow(/port/u);
    expect(() => parseLocalLiveArguments(['--port', '0'])).toThrow(/port/u);
    expect(() => parseLocalLiveArguments(['--port', '65536'])).toThrow(/port/u);
    expect(() => parseLocalLiveArguments(['--host', '127.0.0.1'])).toThrow(/unknown/u);
  });

  it('requires a non-empty OPENAI_API_KEY and Node major 24', () => {
    expect(() => preflight({ OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/u);
    expect(() => preflight({ OPENAI_API_KEY: '' })).toThrow(/OPENAI_API_KEY/u);
    expect(() => preflight({ OPENAI_API_KEY: '   ' })).toThrow(/OPENAI_API_KEY/u);
    expect(() => preflight({ OPENAI_API_KEY: 'present' }, { nodeMajor: 26 })).toThrow(/Node/u);
    expect(() => preflight({ OPENAI_API_KEY: 'present' }, { nodeMajor: 24, dockerAvailable: false })).toThrow(/Docker/u);
    expect(() => preflight({ OPENAI_API_KEY: 'present' }, { nodeMajor: 24, dockerAvailable: true })).not.toThrow();
  });

  it('loads OPENAI_API_KEY from an ignored .env only when process env is empty', () => {
    expect(parseIgnoredLocalEnvFile([
      '# comment',
      'FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE=true',
      'OPENAI_API_KEY=',
      `OPENAI_API_KEY="${SENTINEL_KEY}"`,
    ].join('\n'))).toEqual({ OPENAI_API_KEY: SENTINEL_KEY });
    const empty: NodeJS.ProcessEnv = {};
    applyIgnoredLocalEnv(empty, { OPENAI_API_KEY: SENTINEL_KEY });
    expect(empty.OPENAI_API_KEY).toBe(SENTINEL_KEY);
    const existing: NodeJS.ProcessEnv = { OPENAI_API_KEY: 'already-set' };
    applyIgnoredLocalEnv(existing, { OPENAI_API_KEY: SENTINEL_KEY });
    expect(existing.OPENAI_API_KEY).toBe('already-set');
  });
});

describe('owned local live harness', () => {
  it('fails closed on an occupied requested port before releases or owned processes', async () => {
    const h = harness({
      async portIsFree() { h.events.push('port.check'); return false; },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: 4328 }, h.dependencies))
      .rejects.toThrow(/occupied/u);
    expect(h.events).toContain('docker.check');
    expect(h.events).toContain('port.check');
    expect(h.events).not.toContain('release.verify');
    expect(h.events).not.toContain('database.start');
  });

  it('fails closed when Docker is absent', async () => {
    const h = harness({ async dockerAvailable() { h.events.push('docker.check'); return false; } });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/Docker/u);
    expect(h.events).toContain('docker.check');
    expect(h.events).not.toContain('port.check');
    expect(h.events).not.toContain('database.start');
  });

  it('fails closed on an invalid Node major before Docker or ports', async () => {
    const h = harness({ nodeMajor: 22 });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/Node/u);
    expect(h.events).toEqual([]);
  });

  it('fails closed on a corrupt ledger before database startup', async () => {
    const h = harness({
      async openLedger() { h.events.push('ledger.open'); throw new Error('budget ledger is invalid'); },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/budget ledger/u);
    expect(h.events).not.toContain('database.start');
    expect(h.events).toContain('ledger.open');
    expect(h.events).toContain('temp.remove');
  });

  it('fails closed when the calculated indexing reservation does not fit', async () => {
    const h = harness({
      async openLedger() {
        h.events.push('ledger.open');
        return { async snapshot() { return { availableMicroUsd: 5 }; } };
      },
      async calculateIndexReservation() { h.events.push('reservation.calculate'); return 20; },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/reservation/u);
    expect(h.events).not.toContain('database.start');
    expect(h.events).not.toContain('index.live');
  });

  it('fails closed on release verification failure before owned state or database', async () => {
    const h = harness({
      async verifyReleases() { h.events.push('release.verify'); throw new Error('release verification failed'); },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/release verification/u);
    expect(h.events).toContain('release.verify');
    expect(h.events).not.toContain('state.create');
    expect(h.events).not.toContain('database.start');
  });

  it('times out a child that never acknowledges startup and cleans in reverse', async () => {
    const h = harness({
      startupDeadlineMs: 0,
      startNest() {
        h.events.push('nest.start');
        return liveChild('nest', h.events, { startup: hanging() });
      },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/startup deadline/u);
    expect(h.events.indexOf('nest.start')).toBeGreaterThan(h.events.indexOf('site.build'));
    expect(h.events).toContain('nest.signal:SIGTERM');
    expect(h.events.indexOf('nest.signal:SIGTERM')).toBeLessThan(h.events.indexOf('database.stop'));
    expect(h.events).not.toContain('print:http://127.0.0.1:4328/search/');
  });

  it('fails closed when a child exits before startup acknowledgement', async () => {
    const h = harness({
      startPreview() {
        h.events.push('preview.start');
        return liveChild('preview', h.events, {
          startup: Promise.reject(new Error('preview exited before startup')),
          wait: Promise.reject(new Error('preview exited before startup')),
        });
      },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/exited before startup/u);
    expect(h.events).toContain('database.stop');
    expect(h.printed).toEqual([]);
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('stops proxy, preview, Nest, and database in reverse after %s', async (signal) => {
    let handler: ((value: 'SIGINT' | 'SIGTERM') => void) | undefined;
    const h = harness({
      onSignal(next) {
        handler = next;
        return () => { h.events.push('signals.remove'); };
      },
      async waitAttached() {
        h.events.push('attached');
        return hanging();
      },
    });
    const running = runLocalLiveHarness({ host: '127.0.0.1', port: 4328 }, h.dependencies);
    while (!h.events.includes('attached') || !handler) await Promise.resolve();
    handler(signal);
    await expect(running).rejects.toThrow(/interrupt/u);
    const cleanup = h.events.filter((event) => event.endsWith('.signal:SIGTERM') || event === 'database.stop' || event === 'temp.remove');
    expect(cleanup).toEqual(['proxy.signal:SIGTERM', 'preview.signal:SIGTERM', 'nest.signal:SIGTERM', 'database.stop', 'temp.remove']);
    expect(h.printed).toEqual(['http://127.0.0.1:4328/search/\n']);
  });

  it('does not delete the database when child termination stays unconfirmed', async () => {
    const h = harness({
      startProxy() {
        h.events.push('proxy.start');
        return liveChild('proxy', h.events, { confirm: false, wait: hanging() });
      },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/termination was not confirmed/u);
    expect(h.events).toContain('proxy.signal:SIGTERM');
    expect(h.events).toContain('proxy.signal:SIGKILL');
    expect(h.events).not.toContain('database.stop');
    expect(h.events).not.toContain('temp.remove');
  });

  it('prints one browser URL, builds with local disclosure, and indexes with local authority', async () => {
    const h = harness();
    await runLocalLiveHarness({ host: '127.0.0.1', port: 4328 }, h.dependencies);
    expect(h.events.slice(0, 16)).toEqual([
      'docker.check',
      'port.check',
      'ports.reserve:4328',
      'release.verify',
      'state.create',
      'authorization.write',
      'ledger.open',
      'reservation.calculate',
      'database.start',
      'migration.apply',
      'index.live',
      'binding.reopen',
      'site.build',
      'nest.start',
      'preview.start',
      'proxy.start',
    ]);
    expect(h.events).toContain('ready:http://127.0.0.1:4329/health/ready');
    expect(h.events).toContain('ready:http://127.0.0.1:4328/search/');
    expect(h.printed).toEqual(['http://127.0.0.1:4328/search/\n']);
    expect(h.buildEnv[0]?.FORM_THOUGHT_LOCAL_LIVE_DISCLOSURE).toBe('true');
    expect(h.indexEnv[0]?.FORM_THOUGHT_PUBLIC_ASK_MODE).toBe('provider');
    expect(h.nestEnv[0]?.FORM_THOUGHT_PUBLIC_ORIGIN).toBe('http://127.0.0.1:4328');
    expect(h.nestEnv[0]?.FORM_THOUGHT_LOCAL_PROVIDER_AUTHORIZATION)
      .toBe('/repo/.superpowers/runtime/public-answer-live/authorization.json');
    expect(h.nestEnv[0]?.OPENAI_API_KEY).toBe('test-local-key');
    expect(h.indexEnv[0]?.OPENAI_API_KEY).toBe('test-local-key');
    expect(h.buildEnv[0]?.OPENAI_API_KEY).toBeUndefined();
    expect(h.previewEnv[0]?.OPENAI_API_KEY).toBeUndefined();
    expect(h.proxyEnv[0]?.OPENAI_API_KEY).toBeUndefined();
    expect(h.events.filter((event) => event.startsWith('print:'))).toHaveLength(1);
  });

  it('keeps the sentinel API key on Nest and indexing only', async () => {
    const h = harness({ env: { OPENAI_API_KEY: SENTINEL_KEY } });
    await runLocalLiveHarness({ host: '127.0.0.1', port: 4328 }, h.dependencies);
    expect(h.nestEnv[0]?.OPENAI_API_KEY).toBe(SENTINEL_KEY);
    expect(h.indexEnv[0]?.OPENAI_API_KEY).toBe(SENTINEL_KEY);
    expect(h.buildEnv[0]).not.toHaveProperty('OPENAI_API_KEY');
    expect(h.previewEnv[0]).not.toHaveProperty('OPENAI_API_KEY');
    expect(h.proxyEnv[0]).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('attaches redacted child logs when startup fails', async () => {
    const h = harness({
      env: { OPENAI_API_KEY: SENTINEL_KEY },
      redactValues: [SENTINEL_QUESTION],
      startNest() {
        h.events.push('nest.start');
        return {
          ...liveChild('nest', h.events, {
            startup: Promise.reject(new Error('nest exited before startup')),
            wait: Promise.reject(new Error('nest exited before startup')),
          }),
          output: () => `listen failed key=${SENTINEL_KEY} q=${SENTINEL_QUESTION}`,
        };
      },
    });
    let message = '';
    try {
      await runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/listen failed/u);
    expect(message).toMatch(/owned nest log/u);
    expect(message).toContain('[redacted-secret]');
    expect(message).not.toContain(SENTINEL_KEY);
    expect(message).not.toContain(SENTINEL_QUESTION);
  });

  it('attaches child logs to a startup deadline', async () => {
    const h = harness({
      startupDeadlineMs: 0,
      startNest() {
        h.events.push('nest.start');
        return { ...liveChild('nest', h.events, { startup: hanging() }), output: () => 'still starting nest' };
      },
    });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies))
      .rejects.toThrow(/startup deadline[\s\S]*still starting nest/u);
  });

  it('redacts a sentinel key and question from diagnostics', async () => {
    const h = harness({
      env: { OPENAI_API_KEY: SENTINEL_KEY },
      redactValues: [SENTINEL_QUESTION],
      async verifyReleases() {
        throw new Error(`release failed with ${SENTINEL_KEY} asking ${SENTINEL_QUESTION}`);
      },
    });
    let message = '';
    try {
      await runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/redacted/u);
    expect(message).not.toContain(SENTINEL_KEY);
    expect(message).not.toContain(SENTINEL_QUESTION);
    expect(redactLiveDiagnostics(
      `key=${SENTINEL_KEY} question=${SENTINEL_QUESTION}`,
      { OPENAI_API_KEY: SENTINEL_KEY },
      [SENTINEL_QUESTION],
    )).not.toContain(SENTINEL_KEY);
  });

  it('does not require the live smoke confirmation env for the ordinary command', async () => {
    const h = harness({ env: { OPENAI_API_KEY: 'test-local-key' } });
    await expect(runLocalLiveHarness({ host: '127.0.0.1', port: null }, h.dependencies)).resolves.toBeUndefined();
    expect(h.printed).toHaveLength(1);
  });
});

describe('live smoke confirmation stub', () => {
  it('refuses without FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE=true', async () => {
    const { assertLiveSmokeConfirmation } = await import('../../tests/e2e/run-search-provider-live-stack.mts');
    expect(() => assertLiveSmokeConfirmation({ OPENAI_API_KEY: 'k' })).toThrow(/FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE/u);
    expect(() => assertLiveSmokeConfirmation({
      OPENAI_API_KEY: 'k',
      FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE: 'true',
    })).not.toThrow();
  });
});

describe('owned child reverse termination', () => {
  it('confirms SIGTERM then SIGKILL and reports unconfirmed children', async () => {
    const events: string[] = [];
    const hangingChild = liveChild('proxy', events, { confirm: false, wait: hanging() });
    await expect(confirmOwnedChildStop(hangingChild, { sleep: async () => undefined })).resolves.toBe(false);
    expect(events).toEqual(['proxy.signal:SIGTERM', 'proxy.signal:SIGKILL']);

    const order: string[] = [];
    const children = [
      {
        role: 'nest',
        wait: Promise.resolve(),
        signal(signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL') { order.push(`nest:${signal}`); },
      },
      {
        role: 'proxy',
        wait: hanging(),
        signal(signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL') { order.push(`proxy:${signal}`); },
      },
    ];
    const result = await stopOwnedChildrenInReverse(children, { sleep: async () => undefined });
    expect(order[0]).toBe('proxy:SIGTERM');
    expect(result.confirmed).toBe(false);
    expect(result.unconfirmedRoles).toEqual(['proxy']);
  });
});
