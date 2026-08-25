export interface SignalTarget {
  once(event: NodeJS.Signals, listener: () => void): SignalTarget;
  removeListener(event: NodeJS.Signals, listener: () => void): SignalTarget;
}

export interface ProcessSnapshot {
  pid: number;
  ppid: number;
  pgid: number;
  start_identity: string;
  command_line: string;
}

export interface OwnedProcessEvidence {
  role: string;
  argv: string[];
  expected_command_line: string;
  root_pid: number;
  root_ppid: number;
  root_pgid: number;
  start_identity: string | null;
  observed: ProcessSnapshot | null;
  started_at: string;
  stabilization: { completed_at: string | null; polls: number; observed_commands: string[] };
  pre_term_identity: ProcessSnapshot | null;
  term_sent_at: string | null;
  root_exit: { exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null } | null;
  group_lifecycle: { members_observed: ProcessSnapshot[]; group_empty: boolean; polls: number; completed_at: string | null };
  stopped: boolean;
}

export function registerOwnedProcess(
  registry: OwnedProcessEvidence[],
  options: { role: string; argv: readonly string[]; expectedCommand: string; rootPid: number; controllerPid: number; startedAt?: string },
): OwnedProcessEvidence {
  if (!Number.isSafeInteger(options.rootPid) || options.rootPid <= 1) throw new Error('owned process PID is invalid');
  const entry: OwnedProcessEvidence = {
    role: options.role, argv: [...options.argv], expected_command_line: options.expectedCommand,
    root_pid: options.rootPid, root_ppid: options.controllerPid, root_pgid: options.rootPid,
    start_identity: null, observed: null, started_at: options.startedAt ?? new Date().toISOString(),
    stabilization: { completed_at: null, polls: 0, observed_commands: [] }, pre_term_identity: null, term_sent_at: null, root_exit: null,
    group_lifecycle: { members_observed: [], group_empty: false, polls: 0, completed_at: null }, stopped: false,
  };
  registry.push(entry);
  return entry;
}

function validateRootSnapshot(entry: OwnedProcessEvidence, snapshot: ProcessSnapshot, requireStableCommand: boolean): void {
  if (snapshot.pid !== entry.root_pid) throw new Error('owned process PID identity changed');
  if (snapshot.ppid !== entry.root_ppid) throw new Error('owned process controller parent changed');
  if (snapshot.pgid !== entry.root_pgid || snapshot.pgid !== snapshot.pid) throw new Error('owned process group identity changed');
  if (entry.start_identity !== null && snapshot.start_identity !== entry.start_identity) throw new Error('owned process start identity changed');
  if (requireStableCommand && entry.observed && snapshot.command_line !== entry.observed.command_line) throw new Error('owned process command was replaced');
}

export async function stabilizeOwnedProcess(
  entry: OwnedProcessEvidence,
  snapshot: () => Promise<ProcessSnapshot>,
  expectedCommand: string,
  options: { pause?: () => Promise<void>; maxPolls?: number } = {},
): Promise<void> {
  if (expectedCommand !== entry.expected_command_line) throw new Error('owned process expected command binding changed');
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
  const maximum = options.maxPolls ?? 300;
  for (let poll = 1; poll <= maximum; poll += 1) {
    const observed = await snapshot();
    if (entry.start_identity === null) entry.start_identity = observed.start_identity;
    validateRootSnapshot(entry, observed, false);
    entry.observed = observed;
    entry.stabilization.polls = poll;
    if (!entry.stabilization.observed_commands.includes(observed.command_line)) entry.stabilization.observed_commands.push(observed.command_line);
    if (observed.command_line === expectedCommand) {
      entry.stabilization.completed_at = new Date().toISOString();
      return;
    }
    await pause();
  }
  throw new Error(`owned ${entry.role} command title did not stabilize`);
}

function mergeMembers(target: ProcessSnapshot[], additions: readonly ProcessSnapshot[], expectedPgid: number): void {
  for (const member of additions) {
    if (member.pgid !== expectedPgid) throw new Error('foreign process group member was reported');
    const existing = target.find(({ pid, start_identity }) => pid === member.pid && start_identity === member.start_identity);
    if (!existing) target.push(member);
  }
  target.sort((left, right) => left.pid - right.pid);
}

export function observeOwnedGroup(entry: OwnedProcessEvidence, members: readonly ProcessSnapshot[]): void {
  mergeMembers(entry.group_lifecycle.members_observed, members, entry.root_pgid);
}

export async function completeOwnedProcess(
  entry: OwnedProcessEvidence,
  rootExit: { exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null },
  options: { groupMembers: (pgid: number) => Promise<ProcessSnapshot[]>; pause?: () => Promise<void>; maxGroupPolls?: number },
): Promise<void> {
  entry.root_exit = rootExit;
  const maximum = options.maxGroupPolls ?? 150;
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
  for (let poll = 1; poll <= maximum; poll += 1) {
    const remaining = await options.groupMembers(entry.root_pgid);
    mergeMembers(entry.group_lifecycle.members_observed, remaining, entry.root_pgid);
    entry.group_lifecycle.polls = poll;
    if (remaining.length === 0) {
      entry.group_lifecycle.group_empty = true;
      entry.group_lifecycle.completed_at = new Date().toISOString();
      entry.stopped = true;
      return;
    }
    await pause();
  }
  throw new Error(`owned ${entry.role} process group extinction could not be proven; members remain`);
}

export interface TerminateOwnedOptions {
  snapshot: (pid: number) => Promise<ProcessSnapshot>;
  groupMembers: (pgid: number) => Promise<ProcessSnapshot[]>;
  signalGroup: (pgid: number, signal: NodeJS.Signals) => void;
  waitForRootExit: () => Promise<{ exited_at: string; exit_code: number | null; signal: NodeJS.Signals | null }>;
  pause?: () => Promise<void>;
  maxGroupPolls?: number;
}

export async function terminateOwnedProcess(entry: OwnedProcessEvidence, options: TerminateOwnedOptions): Promise<void> {
  const beforeTerm = await options.snapshot(entry.root_pid);
  if (!entry.observed || !entry.start_identity) {
    validateRootSnapshot(entry, beforeTerm, false);
    if (beforeTerm.command_line !== entry.expected_command_line) {
      throw new Error('owned unobserved process command does not match its immutable spawn binding');
    }
    entry.start_identity = beforeTerm.start_identity;
    entry.observed = beforeTerm;
  } else {
    validateRootSnapshot(entry, beforeTerm, entry.stabilization.completed_at !== null);
  }
  const beforeMembers = await options.groupMembers(entry.root_pgid);
  if (!beforeMembers.some(({ pid, start_identity }) => pid === entry.root_pid && start_identity === entry.start_identity)) throw new Error('owned root is absent from its process group');
  mergeMembers(entry.group_lifecycle.members_observed, beforeMembers, entry.root_pgid);
  entry.pre_term_identity = beforeTerm;
  entry.term_sent_at = new Date().toISOString();
  options.signalGroup(entry.root_pgid, 'SIGTERM');
  entry.root_exit = await options.waitForRootExit();
  const maximum = options.maxGroupPolls ?? 150;
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
  for (let poll = 1; poll <= maximum; poll += 1) {
    const remaining = await options.groupMembers(entry.root_pgid);
    mergeMembers(entry.group_lifecycle.members_observed, remaining, entry.root_pgid);
    entry.group_lifecycle.polls = poll + 1;
    if (remaining.length === 0) {
      entry.group_lifecycle.group_empty = true;
      entry.group_lifecycle.completed_at = new Date().toISOString();
      entry.stopped = true;
      return;
    }
    await pause();
  }
  throw new Error(`owned ${entry.role} process group extinction could not be proven; members remain`);
}

export async function runOwnedCleanupSteps(
  steps: ReadonlyArray<readonly [label: string, cleanup: () => Promise<void>]>,
): Promise<string[]> {
  const errors: string[] = [];
  for (const [label, cleanup] of steps) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(`${label}: ${String(error)}`);
    }
  }
  return errors;
}

export interface OwnedSignalEvidence {
  installed_at: string;
  signals: ['SIGINT', 'SIGTERM'];
  active: boolean;
  handled_signal: NodeJS.Signals | null;
  cleanup_completed: boolean;
  removed_at: string | null;
}

export function installOwnedSignalHandlers(
  target: SignalTarget,
  cleanup: (signal: NodeJS.Signals) => Promise<void>,
  exit: (code: number) => void,
  options: { beforeExit?: (signal: NodeJS.Signals, evidence: OwnedSignalEvidence) => Promise<void> } = {},
): { evidence: () => OwnedSignalEvidence; completion: () => Promise<void>; remove: () => void; complete: () => void } {
  const state: OwnedSignalEvidence = {
    installed_at: new Date().toISOString(), signals: ['SIGINT', 'SIGTERM'], active: true,
    handled_signal: null, cleanup_completed: false, removed_at: null,
  };
  let completion = Promise.resolve();
  const handlers = new Map<NodeJS.Signals, () => void>();
  const remove = (): void => {
    if (!state.active) return;
    for (const [signal, handler] of handlers) target.removeListener(signal, handler);
    state.active = false; state.removed_at = new Date().toISOString();
  };
  for (const signal of state.signals) {
    const handler = (): void => {
      if (state.handled_signal) return;
      state.handled_signal = signal;
      completion = cleanup(signal).then(async () => {
        state.cleanup_completed = true;
        remove();
        await options.beforeExit?.(signal, { ...state });
        exit(signal === 'SIGINT' ? 130 : 143);
      }).catch(() => {
        remove();
        exit(1);
      });
    };
    handlers.set(signal, handler); target.once(signal, handler);
  }
  const complete = (): void => { state.cleanup_completed = true; remove(); };
  return { evidence: () => ({ ...state }), completion: () => completion, remove, complete };
}
