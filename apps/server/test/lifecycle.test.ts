import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';

import { RuntimeReadiness } from '../src/health/runtime-readiness.js';
import { RuntimeLifecycle } from '../src/lifecycle/runtime-lifecycle.js';

const binding = Object.freeze({ contentReleaseId: '1'.repeat(64), answerReleaseId: '2'.repeat(64) });

async function ready(): Promise<RuntimeReadiness> {
  const readiness = new RuntimeReadiness({ startupCheck: async () => binding });
  await readiness.initialize();
  return readiness;
}

describe('runtime graceful lifecycle', () => {
  it('marks not-ready before the fixed grace, stops admission, drains, then closes the pool', async () => {
    const events: string[] = [];
    let now = 0;
    const readiness = await ready();
    const lifecycle = new RuntimeLifecycle({
      readiness,
      clock: () => now,
      sleep: async (milliseconds) => { events.push(`sleep:${milliseconds}`); now += milliseconds; },
      closeServer: async () => { events.push('server.close'); },
      closePool: async () => { events.push('pool.close'); },
      setExitCode: (code) => { events.push(`exit:${code}`); },
    });
    const request = new AbortController();
    const finish = lifecycle.beginRequest(request);

    const shuttingDown = lifecycle.shutdown('SIGTERM');
    expect(readiness.status().ready).toBe(false);
    expect(lifecycle.acceptingRequests()).toBe(true);
    await Promise.resolve();
    expect(events[0]).toBe('sleep:2000');
    finish();
    await shuttingDown;

    expect(lifecycle.acceptingRequests()).toBe(false);
    expect(request.signal.aborted).toBe(false);
    expect(events[0]).toBe('sleep:2000');
    expect(events.indexOf('server.close')).toBeLessThan(events.indexOf('pool.close'));
    expect(events.at(-1)).toBe('exit:0');
  });

  it('uses one ten-second deadline, aborts remaining work, and sets a nonzero exit code', async () => {
    const events: string[] = [];
    let now = 0;
    const readiness = await ready();
    const lifecycle = new RuntimeLifecycle({
      readiness,
      clock: () => now,
      sleep: async (milliseconds) => { events.push(`sleep:${milliseconds}`); now += milliseconds; },
      closeServer: async () => { events.push('server.close'); },
      closePool: async () => { events.push('pool.close'); },
      setExitCode: (code) => { events.push(`exit:${code}`); },
    });
    const request = new AbortController();
    lifecycle.beginRequest(request);

    await lifecycle.shutdown('SIGINT');

    expect(now).toBe(10_000);
    expect(request.signal.aborted).toBe(true);
    expect(events).toContain('server.close');
    expect(events.at(-2)).toBe('pool.close');
    expect(events.at(-1)).toBe('exit:1');
  });

  it('joins a second signal to the same close promise and performs cleanup once', async () => {
    const events: string[] = [];
    let now = 0;
    const readiness = await ready();
    const lifecycle = new RuntimeLifecycle({
      readiness,
      clock: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
      closeServer: async () => { events.push('server.close'); },
      closePool: async () => { events.push('pool.close'); },
      setExitCode: (code) => { events.push(`exit:${code}`); },
    });

    const first = lifecycle.shutdown('SIGTERM');
    const second = lifecycle.shutdown('SIGINT');
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(events).toEqual(['server.close', 'pool.close', 'exit:0']);
  });

  it('rejects admission after grace and makes finish idempotent', async () => {
    let now = 0;
    const readiness = await ready();
    const lifecycle = new RuntimeLifecycle({
      readiness,
      clock: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
      closeServer: async () => undefined,
      closePool: async () => undefined,
      setExitCode: () => undefined,
    });
    const finish = lifecycle.beginRequest(new AbortController());
    finish();
    finish();
    await lifecycle.shutdown('SIGTERM');
    expect(() => lifecycle.beginRequest(new AbortController())).toThrow('runtime is not accepting requests');
  });

  it.each(['server', 'pool'] as const)('bounds a non-settling %s close with the one ten-second deadline', async (stalled) => {
    let now = 0;
    const exits: number[] = [];
    const never = new Promise<void>(() => undefined);
    const lifecycle = new RuntimeLifecycle({
      readiness: await ready(),
      clock: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
      closeServer: () => stalled === 'server' ? never : Promise.resolve(),
      closePool: () => stalled === 'pool' ? never : Promise.resolve(),
      setExitCode: (code) => { exits.push(code); },
    });

    const result = await Promise.race([
      lifecycle.shutdown('SIGTERM').then(() => 'closed'),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 50)),
    ]);
    expect(result).toBe('closed');
    expect(now).toBe(10_000);
    expect(exits).toEqual([1]);
  });

  it('keeps one installed handler per signal so repeated same-signal delivery joins owned cleanup', async () => {
    const target = new EventEmitter();
    let releaseGrace!: () => void;
    const grace = new Promise<void>((resolve) => { releaseGrace = resolve; });
    let serverCloses = 0;
    const lifecycle = new RuntimeLifecycle({
      readiness: await ready(),
      sleep: async () => grace,
      closeServer: async () => { serverCloses += 1; },
      closePool: async () => undefined,
      setExitCode: () => undefined,
    });
    lifecycle.registerSignals(target as any);
    expect(target.listenerCount('SIGTERM')).toBe(1);
    target.emit('SIGTERM');
    target.emit('SIGTERM');
    expect(target.listenerCount('SIGTERM')).toBe(1);
    releaseGrace();
    await lifecycle.shutdown('SIGTERM');
    expect(serverCloses).toBe(1);
  });

  it.each(['server', 'pool'] as const)('contains a synchronous %s close failure and completes the other cleanup', async (failed) => {
    const events: string[] = [];
    const lifecycle = new RuntimeLifecycle({
      readiness: await ready(),
      sleep: async () => undefined,
      closeServer: () => {
        events.push('server.close');
        if (failed === 'server') throw new Error('server close failed');
        return Promise.resolve();
      },
      closePool: () => {
        events.push('pool.close');
        if (failed === 'pool') throw new Error('pool close failed');
        return Promise.resolve();
      },
      setExitCode: (code) => { events.push(`exit:${code}`); },
    });
    await expect(lifecycle.shutdown('SIGTERM')).resolves.toBeUndefined();
    expect(events).toEqual(['server.close', 'pool.close', 'exit:1']);
  });
});
