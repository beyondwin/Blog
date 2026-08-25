import { describe, expect, it } from 'vitest';
import {
  registerOwnedProcess,
  runOwnedCleanupSteps,
  stabilizeOwnedProcess,
  terminateOwnedProcess,
  type OwnedProcessEvidence,
  type ProcessSnapshot,
} from './owned-process-lifecycle.mts';

const argv = ['npm', 'run', 'site:preview', '--', '--host', '127.0.0.1', '--port', '4391'];
const observedCommand = 'npm run site:preview --host 127.0.0.1 --port 4391';
const rootSnapshot = (overrides: Partial<ProcessSnapshot> = {}): ProcessSnapshot => ({
  pid: 101, ppid: 99, pgid: 101, start_identity: 'start-a', command_line: observedCommand, ...overrides,
});

async function readyEntry(): Promise<OwnedProcessEvidence> {
  const registry: OwnedProcessEvidence[] = [];
  const entry = registerOwnedProcess(registry, { role: 'react', argv, expectedCommand: observedCommand, rootPid: 101, controllerPid: 99, startedAt: '2026-08-26T00:00:00.000Z' });
  await stabilizeOwnedProcess(entry, async () => rootSnapshot(), observedCommand);
  return entry;
}

describe('owned process lifecycle', () => {
  it('registers the process group synchronously before any stabilization proof', () => {
    const registry: OwnedProcessEvidence[] = [];
    const entry = registerOwnedProcess(registry, { role: 'react', argv, expectedCommand: observedCommand, rootPid: 101, controllerPid: 99, startedAt: '2026-08-26T00:00:00.000Z' });
    expect(registry).toEqual([entry]);
    expect(entry).toMatchObject({ root_pid: 101, root_ppid: 99, root_pgid: 101, observed: null, stopped: false });
  });

  it('retains enough identity to clean an immediate command-title stabilization failure', async () => {
    const registry: OwnedProcessEvidence[] = [];
    const entry = registerOwnedProcess(registry, { role: 'react', argv, expectedCommand: observedCommand, rootPid: 101, controllerPid: 99, startedAt: '2026-08-26T00:00:00.000Z' });
    const initial = rootSnapshot({ command_line: 'node /opt/homebrew/opt/node@24/bin/npm run site:preview' });
    await expect(stabilizeOwnedProcess(entry, async () => initial, observedCommand, { maxPolls: 1, pause: async () => {} }))
      .rejects.toThrow(/stabilize/iu);
    let groupPoll = 0;
    await terminateOwnedProcess(entry, {
      snapshot: async () => initial,
      groupMembers: async () => ++groupPoll === 1 ? [initial] : [],
      signalGroup: () => {},
      waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
      pause: async () => {},
    });
    expect(entry.stopped).toBe(true);
  });

  it('terminates a just-spawned owned group before the first stabilization snapshot', async () => {
    const registry: OwnedProcessEvidence[] = [];
    const entry = registerOwnedProcess(registry, {
      role: 'react', argv, expectedCommand: observedCommand, rootPid: 101, controllerPid: 99,
      startedAt: '2026-08-26T00:00:00.000Z',
    });
    const bootstrap = rootSnapshot({
      command_line: 'node /opt/homebrew/opt/node@24/bin/npm run site:preview -- --host 127.0.0.1 --port 4391',
    });
    let signalled = false;
    let polls = 0;
    await terminateOwnedProcess(entry, {
      snapshot: async () => bootstrap,
      groupMembers: async () => ++polls === 1 ? [bootstrap] : [],
      signalGroup: () => { signalled = true; },
      waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
      pause: async () => {},
    });
    expect(signalled).toBe(true);
    expect(entry).toMatchObject({ start_identity: 'start-a', observed: bootstrap, stopped: true });

    const foreign = registerOwnedProcess([], {
      role: 'react', argv, expectedCommand: observedCommand, rootPid: 101, controllerPid: 99,
    });
    signalled = false;
    await expect(terminateOwnedProcess(foreign, {
      snapshot: async () => rootSnapshot({ command_line: 'node /opt/homebrew/opt/node@24/bin/npm run foreign -- --host 127.0.0.1 --port 4391' }),
      groupMembers: async () => [rootSnapshot({ command_line: 'node /opt/homebrew/opt/node@24/bin/npm run foreign -- --host 127.0.0.1 --port 4391' })],
      signalGroup: () => { signalled = true; },
      waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
      pause: async () => {},
    })).rejects.toThrow(/command/iu);
    expect(signalled).toBe(false);
  });

  it('runs every best-effort cleanup step even when an earlier step rejects', async () => {
    const order: string[] = [];
    const errors = await runOwnedCleanupSteps([
      ['first', async () => { order.push('first'); throw new Error('first failed'); }],
      ['second', async () => { order.push('second'); }],
      ['third', async () => { order.push('third'); throw new Error('third failed'); }],
    ]);
    expect(order).toEqual(['first', 'second', 'third']);
    expect(errors).toEqual(['first: Error: first failed', 'third: Error: third failed']);
  });

  it('refuses command replacement, foreign PID/group, and controller mismatch before TERM', async () => {
    for (const replacement of [
      rootSnapshot({ command_line: 'npm run foreign' }),
      rootSnapshot({ pid: 102 }),
      rootSnapshot({ pgid: 777 }),
      rootSnapshot({ ppid: 1 }),
      rootSnapshot({ start_identity: 'replacement' }),
    ]) {
      const entry = await readyEntry();
      let signalled = false;
      await expect(terminateOwnedProcess(entry, {
        snapshot: async () => replacement,
        groupMembers: async () => [replacement],
        signalGroup: () => { signalled = true; },
        waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
        pause: async () => {},
      })).rejects.toThrow(/identity|command|parent|group|PID/iu);
      expect(signalled).toBe(false);
    }
  });

  it('does not claim stopped while any owned group member lingers', async () => {
    const entry = await readyEntry();
    await expect(terminateOwnedProcess(entry, {
      snapshot: async () => rootSnapshot(),
      groupMembers: async () => [rootSnapshot(), rootSnapshot({ pid: 202, ppid: 101 })],
      signalGroup: () => {},
      waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
      pause: async () => {},
      maxGroupPolls: 2,
    })).rejects.toThrow(/group.*remain|extinction/iu);
    expect(entry.stopped).toBe(false);
    expect(entry.group_lifecycle.group_empty).toBe(false);
  });

  it('records pre-TERM identity, all observed members, root exit, and complete group extinction', async () => {
    const entry = await readyEntry();
    let polls = 0;
    await terminateOwnedProcess(entry, {
      snapshot: async () => rootSnapshot(),
      groupMembers: async () => ++polls === 1 ? [rootSnapshot(), rootSnapshot({ pid: 202, ppid: 101 })] : [],
      signalGroup: (pgid, signal) => { expect([pgid, signal]).toEqual([101, 'SIGTERM']); },
      waitForRootExit: async () => ({ exited_at: '2026-08-26T00:01:00.000Z', exit_code: null, signal: 'SIGTERM' }),
      pause: async () => {},
    });
    expect(entry).toMatchObject({
      pre_term_identity: rootSnapshot(), stopped: true,
      root_exit: { exited_at: '2026-08-26T00:01:00.000Z', signal: 'SIGTERM' },
      group_lifecycle: { members_observed: [rootSnapshot(), rootSnapshot({ pid: 202, ppid: 101 })], group_empty: true, polls: 2 },
    });
  });
});
