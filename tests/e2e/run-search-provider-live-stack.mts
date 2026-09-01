import { spawn, execFile as execFileCallback, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { WORST_CASE_COST_MICROUSD } from '../../apps/server/src/modules/public-answer/infrastructure/guards/in-memory-usage-guard.js';
import { LocalBudgetLedger } from '../../apps/server/src/modules/public-answer/infrastructure/guards/local-budget-ledger.js';
import { PROVIDER_MODEL_POLICY } from '../../apps/server/src/modules/public-answer/infrastructure/openai/provider-model-policy.js';
import { providerIndexBudget } from '../../apps/server/src/index-answer-release.js';
import { readVerifiedAnswerReleaseAuthority } from '../../apps/server/src/modules/public-answer/infrastructure/release/verified-answer-release-catalog.js';
import {
  createCleanupRegistry,
  installRunnerSignalHandlers,
  publishEvidenceDirectory,
  scrubDiagnostic,
  settleCleanup,
} from './run-search-provider-stack.mts';

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, '../..');
const tsx = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const compose = resolve(root, 'apps/server/compose.test.yml');
const outputRoot = resolve(root, 'output/playwright/public-answer-live');
const ledgerPath = resolve(root, '.superpowers/runtime/public-answer-live/budget-ledger.json');
const MONTHLY_HARD_CAP_MICRO_USD = 1_000_000;
const INDEX_COST_UPPER_BOUND_MICRO_USD = 20_000;
const liveQuestions = Object.freeze([
  'AI 시대에도 왜 계속 책을 읽나요?',
  'Graphify를 공개 기록에서 찾아주세요',
]);

const RECEIPT_KEYS = [
  'schemaVersion', 'status', 'fixtureMode', 'provenance', 'generationModel', 'semanticModel',
  'reasoningEffort', 'embeddingModel', 'policyHash', 'liveProviderCalls', 'answeredQuestions',
  'fallbackQuestions', 'viewports', 'ledger', 'cleanup',
] as const;
const LEDGER_KEYS = [
  'month', 'hardCapMicroUsd', 'beforeChargedMicroUsd', 'afterChargedMicroUsd',
  'chargedDeltaMicroUsd', 'availableMicroUsd', 'reconciled',
] as const;
const CLEANUP_KEYS = [
  'ownedProcesses', 'composeProjects', 'containers', 'volumes', 'tempDirectories',
] as const;
const BROWSER_RECEIPT_KEYS = [
  'schemaVersion', 'posts', 'answeredQuestions', 'fallbackQuestions', 'viewports',
  'disclosureVisible', 'overflowFree', 'consoleErrorFree', 'evidenceDialogAccessible',
  'targetsUnclipped', 'secondRequestIndependent', 'proxyOriginOnly',
] as const;

export interface LiveSmokeLedgerSnapshot {
  readonly month: string;
  readonly hardCapMicroUsd: 1_000_000;
  readonly chargedMicroUsd: number;
  readonly availableMicroUsd: number;
}

export interface LiveSmokeReceipt {
  readonly schemaVersion: 1;
  readonly status: 'PASS';
  readonly fixtureMode: false;
  readonly provenance: 'local-non-zdr';
  readonly generationModel: 'gpt-5.6-luna';
  readonly semanticModel: 'gpt-5.6-luna';
  readonly reasoningEffort: 'high';
  readonly embeddingModel: 'text-embedding-3-large';
  readonly policyHash: string;
  readonly liveProviderCalls: number;
  readonly answeredQuestions: number;
  readonly fallbackQuestions: number;
  readonly viewports: readonly ['1440x900', '390x844'];
  readonly ledger: {
    readonly month: string;
    readonly hardCapMicroUsd: 1_000_000;
    readonly beforeChargedMicroUsd: number;
    readonly afterChargedMicroUsd: number;
    readonly chargedDeltaMicroUsd: number;
    readonly availableMicroUsd: number;
    readonly reconciled: true;
  };
  readonly cleanup: {
    readonly ownedProcesses: 0;
    readonly composeProjects: 0;
    readonly containers: 0;
    readonly volumes: 0;
    readonly tempDirectories: 0;
  };
}

export interface LiveSmokeDependencies {
  readonly env: NodeJS.ProcessEnv;
  readonly argv: readonly string[];
  readonly evidenceDestination: string;
  snapshotLedger(): Promise<LiveSmokeLedgerSnapshot>;
  indexReservationMicroUsd(): Promise<number>;
  startLive(): Promise<{
    url: string;
    pid: number;
    output(): string;
    stop(): Promise<void>;
  }>;
  runBrowser(url: string, evidenceRoot: string): Promise<string>;
  inspectCleanup(pid: number, beforeTemps: readonly string[]): Promise<LiveSmokeReceipt['cleanup']>;
  readLedgerBytes(): Promise<string>;
  gitDiff(): Promise<string>;
  listTempRoots(): Promise<string[]>;
}

interface OwnedChild {
  readonly child: ChildProcess;
  readonly output: () => string;
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} is invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unknown fields`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid`);
  return value as number;
}

export function assertLiveSmokeConfirmation(env: NodeJS.ProcessEnv = process.env): void {
  if (env.FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE !== 'true') {
    throw new Error('live smoke requires FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE=true');
  }
  if (typeof env.OPENAI_API_KEY !== 'string' || env.OPENAI_API_KEY.trim() === '') {
    throw new Error('live smoke requires OPENAI_API_KEY');
  }
}

export function requiredLiveSmokeReservationMicroUsd(indexReservationMicroUsd: number): number {
  if (!Number.isSafeInteger(indexReservationMicroUsd) || indexReservationMicroUsd < 0) {
    throw new Error('index reservation is invalid');
  }
  return indexReservationMicroUsd + 2 * WORST_CASE_COST_MICROUSD;
}

export function assertLiveSmokeBudget(availableMicroUsd: number, indexReservationMicroUsd: number): void {
  const required = requiredLiveSmokeReservationMicroUsd(indexReservationMicroUsd);
  if (!Number.isSafeInteger(availableMicroUsd) || availableMicroUsd < 0) {
    throw new Error('ledger snapshot is invalid');
  }
  if (required > MONTHLY_HARD_CAP_MICRO_USD || availableMicroUsd < required) {
    throw new Error('live smoke cannot reserve index plus two worst-case questions under USD 1');
  }
}

export function assertLiveSmokeReady(input: {
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
  availableMicroUsd: number;
  indexReservationMicroUsd: number;
}): void {
  const env = input.env ?? process.env;
  assertLiveSmokeConfirmation(env);
  if (input.argv !== undefined && !input.argv.includes('--confirm-live-provider')) {
    throw new Error('live smoke requires --confirm-live-provider');
  }
  assertLiveSmokeBudget(input.availableMicroUsd, input.indexReservationMicroUsd);
}

export function liveSmokeSentinels(env: NodeJS.ProcessEnv, extra: readonly string[] = []): string[] {
  const sentinels = [...liveQuestions, ...extra];
  if (typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY !== '') sentinels.push(env.OPENAI_API_KEY);
  return [...new Set(sentinels.filter(Boolean))].sort((left, right) => right.length - left.length);
}

export function scrubLiveSmokeDiagnostics(
  value: string,
  env: NodeJS.ProcessEnv,
  extra: readonly string[] = [],
): string {
  return scrubDiagnostic(value, liveSmokeSentinels(env, extra));
}

export function assertNoLiveSmokeSentinels(value: string, sentinels: readonly string[]): void {
  for (const sentinel of sentinels) {
    if (sentinel !== '' && value.includes(sentinel)) {
      throw new Error('live smoke artifact contains a raw sentinel');
    }
  }
}

export function parseResponseSentinels(value: unknown): readonly string[] {
  exactKeys(value, ['claims', 'excerpts'], 'live smoke response sentinels');
  if (!Array.isArray(value.claims) || !Array.isArray(value.excerpts)
    || value.claims.some((item) => typeof item !== 'string' || item === '')
    || value.excerpts.some((item) => typeof item !== 'string' || item === '')) {
    throw new Error('live smoke response sentinels are invalid');
  }
  return Object.freeze([...new Set([...value.claims, ...value.excerpts])]);
}

async function readHarvestedSentinels(directory: string): Promise<string[]> {
  try {
    const bytes = await readFile(resolve(directory, 'response-sentinels.json'), 'utf8');
    return [...parseResponseSentinels(JSON.parse(bytes))];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function parseLiveSmokeReceipt(
  value: unknown,
  sentinels: readonly string[] = liveSmokeSentinels(process.env),
): LiveSmokeReceipt {
  exactKeys(value, RECEIPT_KEYS, 'live smoke receipt');
  exactKeys(value.ledger, LEDGER_KEYS, 'live smoke receipt ledger');
  exactKeys(value.cleanup, CLEANUP_KEYS, 'live smoke receipt cleanup');
  const ledger = value.ledger;
  const cleanup = value.cleanup;
  if (value.schemaVersion !== 1) throw new Error('live smoke receipt schemaVersion is invalid');
  if (value.status !== 'PASS') throw new Error('live smoke receipt status is invalid');
  if (value.fixtureMode !== false) throw new Error('live smoke receipt fixtureMode must be false');
  if (value.provenance !== 'local-non-zdr') throw new Error('live smoke receipt provenance is invalid');
  if (value.generationModel !== 'gpt-5.6-luna' || value.semanticModel !== 'gpt-5.6-luna') {
    throw new Error('live smoke receipt generationModel must be gpt-5.6-luna');
  }
  if (value.reasoningEffort !== 'high') throw new Error('live smoke receipt reasoningEffort must be high');
  if (value.embeddingModel !== 'text-embedding-3-large') {
    throw new Error('live smoke receipt embeddingModel is invalid');
  }
  if (value.policyHash !== PROVIDER_MODEL_POLICY.policyHash) {
    throw new Error('live smoke receipt policyHash does not match the current Luna policy');
  }
  const liveProviderCalls = nonNegativeInteger(value.liveProviderCalls, 'live smoke receipt liveProviderCalls');
  const answeredQuestions = nonNegativeInteger(value.answeredQuestions, 'live smoke receipt answeredQuestions');
  const fallbackQuestions = nonNegativeInteger(value.fallbackQuestions, 'live smoke receipt fallbackQuestions');
  if (liveProviderCalls < 1) throw new Error('live smoke receipt liveProviderCalls must be positive');
  if (answeredQuestions < 1) throw new Error('live smoke receipt answeredQuestions must be at least 1');
  if (answeredQuestions + fallbackQuestions !== 2) {
    throw new Error('live smoke receipt must cover exactly two questions');
  }
  if (!Array.isArray(value.viewports) || JSON.stringify(value.viewports) !== JSON.stringify(['1440x900', '390x844'])) {
    throw new Error('live smoke receipt viewports are invalid');
  }
  if (ledger.month !== undefined && (typeof ledger.month !== 'string' || !/^\d{4}-\d{2}$/u.test(ledger.month))) {
    throw new Error('live smoke receipt ledger month is invalid');
  }
  if (ledger.hardCapMicroUsd !== MONTHLY_HARD_CAP_MICRO_USD) {
    throw new Error('live smoke receipt exceeds the 1,000,000 micro-USD hard cap');
  }
  const beforeChargedMicroUsd = nonNegativeInteger(ledger.beforeChargedMicroUsd, 'beforeChargedMicroUsd');
  const afterChargedMicroUsd = nonNegativeInteger(ledger.afterChargedMicroUsd, 'afterChargedMicroUsd');
  const chargedDeltaMicroUsd = nonNegativeInteger(ledger.chargedDeltaMicroUsd, 'chargedDeltaMicroUsd');
  const availableMicroUsd = ledger.availableMicroUsd;
  if (!Number.isSafeInteger(availableMicroUsd) || (availableMicroUsd as number) < 0) {
    throw new Error('live smoke receipt exceeds the 1,000,000 micro-USD hard cap');
  }
  if (chargedDeltaMicroUsd < 1) throw new Error('live smoke receipt chargedDeltaMicroUsd must be positive');
  if (afterChargedMicroUsd > MONTHLY_HARD_CAP_MICRO_USD
    || beforeChargedMicroUsd > MONTHLY_HARD_CAP_MICRO_USD
    || afterChargedMicroUsd !== beforeChargedMicroUsd + chargedDeltaMicroUsd
    || availableMicroUsd !== MONTHLY_HARD_CAP_MICRO_USD - afterChargedMicroUsd) {
    throw new Error('live smoke receipt exceeds the 1,000,000 micro-USD hard cap');
  }
  if (ledger.reconciled !== true) throw new Error('live smoke receipt ledger is not reconciled');
  for (const key of CLEANUP_KEYS) {
    if (cleanup[key] !== 0) throw new Error(`live smoke receipt cleanup ${key} must be 0`);
  }
  const receipt = Object.freeze({
    schemaVersion: 1 as const,
    status: 'PASS' as const,
    fixtureMode: false as const,
    provenance: 'local-non-zdr' as const,
    generationModel: 'gpt-5.6-luna' as const,
    semanticModel: 'gpt-5.6-luna' as const,
    reasoningEffort: 'high' as const,
    embeddingModel: 'text-embedding-3-large' as const,
    policyHash: PROVIDER_MODEL_POLICY.policyHash,
    liveProviderCalls,
    answeredQuestions,
    fallbackQuestions,
    viewports: Object.freeze(['1440x900', '390x844'] as const),
    ledger: Object.freeze({
      month: ledger.month as string,
      hardCapMicroUsd: MONTHLY_HARD_CAP_MICRO_USD,
      beforeChargedMicroUsd,
      afterChargedMicroUsd,
      chargedDeltaMicroUsd,
      availableMicroUsd: availableMicroUsd as number,
      reconciled: true as const,
    }),
    cleanup: Object.freeze({
      ownedProcesses: 0 as const,
      composeProjects: 0 as const,
      containers: 0 as const,
      volumes: 0 as const,
      tempDirectories: 0 as const,
    }),
  });
  assertNoLiveSmokeSentinels(JSON.stringify(receipt), sentinels);
  return receipt;
}

function parseBrowserReceipt(value: unknown): {
  answeredQuestions: number;
  fallbackQuestions: number;
} {
  exactKeys(value, BROWSER_RECEIPT_KEYS, 'live smoke browser receipt');
  const answeredQuestions = nonNegativeInteger(value.answeredQuestions, 'browser answeredQuestions');
  const fallbackQuestions = nonNegativeInteger(value.fallbackQuestions, 'browser fallbackQuestions');
  if (value.schemaVersion !== 1 || value.posts !== 2
    || answeredQuestions + fallbackQuestions !== 2 || answeredQuestions < 1
    || JSON.stringify(value.viewports) !== JSON.stringify(['1440x900', '390x844'])
    || value.disclosureVisible !== true || value.overflowFree !== true
    || value.consoleErrorFree !== true || value.evidenceDialogAccessible !== true
    || value.targetsUnclipped !== true || value.secondRequestIndependent !== true
    || value.proxyOriginOnly !== true) {
    throw new Error('live smoke browser receipt is invalid');
  }
  return { answeredQuestions, fallbackQuestions };
}

async function emptyLedgerSnapshot(): Promise<LiveSmokeLedgerSnapshot> {
  const month = new Date().toISOString().slice(0, 7);
  return Object.freeze({
    month,
    hardCapMicroUsd: MONTHLY_HARD_CAP_MICRO_USD,
    chargedMicroUsd: 0,
    availableMicroUsd: MONTHLY_HARD_CAP_MICRO_USD,
  });
}

async function freePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { reject(new Error('owned port unavailable')); return; }
      server.close((error) => error ? reject(error) : accept(address.port));
    });
  });
}

async function listTempRoots(): Promise<string[]> {
  const entries = await readdir('/tmp');
  return entries
    .filter((name) => name.startsWith('beyondwin-public-answer-live.') || name.startsWith('beyondwin-cutover.'))
    .map((name) => `/tmp/${name}`)
    .sort();
}

function spawnOwned(command: string, args: readonly string[], env: NodeJS.ProcessEnv): OwnedChild {
  const child = spawn(command, [...args], {
    cwd: root,
    env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout?.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => accept({ code, signal }));
  });
  let stopping: Promise<void> | undefined;
  const stopProcess = async (signal: NodeJS.Signals) => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise<false>((accept) => setTimeout(accept, 60_000, false)),
    ]);
    if (stopped) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    await Promise.race([exited, new Promise((accept) => setTimeout(accept, 2_000))]);
  };
  return {
    child,
    output: () => text,
    exited,
    stop(signal = 'SIGINT') {
      stopping ??= stopProcess(signal);
      return stopping;
    },
  };
}

function parseLiveOrigin(output: string): string | undefined {
  const match = output.match(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/search\/$/mu);
  return match?.[0];
}

async function dockerCount(args: readonly string[]): Promise<number> {
  try {
    const { stdout } = await execFile('docker', [...args], { cwd: root });
    return stdout.trim() === '' ? 0 : stdout.trim().split('\n').length;
  } catch {
    return 0;
  }
}

function productionLiveSmokeDependencies(): LiveSmokeDependencies {
  const env = process.env;
  return {
    env,
    argv: process.argv.slice(2),
    evidenceDestination: outputRoot,
    async snapshotLedger() {
      try {
        const ledger = await LocalBudgetLedger.open(ledgerPath);
        return ledger.snapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT'
          || /budget ledger parent must be one owned real directory/u.test(message)) {
          return emptyLedgerSnapshot();
        }
        throw error;
      }
    },
    async indexReservationMicroUsd() {
      try {
        const { answer } = await readVerifiedAnswerReleaseAuthority({
          corpusApprovalPath: resolve(root, 'src/data/public-answer-corpus-approval.v1.json'),
          contentReleaseRoot: resolve(root, 'build/public-releases'),
          answerReleaseRoot: resolve(root, 'build/public-answer-releases'),
        });
        return providerIndexBudget(answer.indexInputs).costUpperBoundMicroUsd;
      } catch {
        return INDEX_COST_UPPER_BOUND_MICRO_USD;
      }
    },
    async startLive() {
      const child = spawnOwned(process.execPath, [tsx, resolve(root, 'scripts/public-answer/local-live.mts')], env);
      const deadline = Date.now() + 1_200_000;
      while (Date.now() < deadline) {
        if (child.child.exitCode !== null || child.child.signalCode !== null) {
          throw new Error(`owned live harness exited before emitting a URL\n${child.output()}`);
        }
        const url = parseLiveOrigin(child.output());
        if (url && child.child.pid) {
          return {
            url,
            pid: child.child.pid,
            output: () => child.output(),
            stop: () => child.stop('SIGINT'),
          };
        }
        await new Promise((accept) => setTimeout(accept, 200));
      }
      throw new Error(`owned live harness URL deadline elapsed\n${child.output()}`);
    },
    async runBrowser(url, evidenceRoot) {
      const proxyOrigin = new URL(url).origin;
      const used = new Set([proxyOrigin]);
      const dummyOrigin = async () => {
        let origin = `http://127.0.0.1:${await freePort()}`;
        while (used.has(origin)) origin = `http://127.0.0.1:${await freePort()}`;
        used.add(origin);
        return origin;
      };
      const playwrightEnv = { ...env };
      delete playwrightEnv.OPENAI_API_KEY;
      Object.assign(playwrightEnv, {
        FORM_THOUGHT_E2E_LIVE_STACK: '1',
        FORM_THOUGHT_E2E_EXTERNAL_STACK: '1',
        FORM_THOUGHT_E2E_EXTERNAL_ORIGIN: proxyOrigin,
        FORM_THOUGHT_E2E_PREVIEW_ORIGIN: await dummyOrigin(),
        FORM_THOUGHT_E2E_API_ORIGIN: await dummyOrigin(),
        FORM_THOUGHT_E2E_EVIDENCE_ROOT: evidenceRoot,
      });
      const child = spawnOwned(process.execPath, [
        resolve(root, 'node_modules/@playwright/test/cli.js'),
        'test', 'tests/e2e/search-provider-live.spec.ts', '--project=chromium-151',
      ], playwrightEnv);
      const result = await child.exited;
      const harvested = await readHarvestedSentinels(evidenceRoot);
      const output = child.output();
      if (result.code !== 0) {
        throw new Error(scrubLiveSmokeDiagnostics(`Playwright live smoke failed\n${output}`, env, harvested));
      }
      return output;
    },
    async readLedgerBytes() {
      return readFile(ledgerPath, 'utf8').catch(() => '');
    },
    async inspectCleanup(pid, beforeTemps) {
      const project = `beyondwin-public-answer-live-${String(pid)}`;
      let ownedProcesses = 0;
      try {
        process.kill(pid, 0);
        ownedProcesses = 1;
      } catch {
        ownedProcesses = 0;
      }
      const composeProjects = await dockerCount([
        'compose', '-p', project, '-f', compose, 'ps', '-aq',
      ]);
      const containers = await dockerCount([
        'ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`,
      ]);
      const volumes = await dockerCount([
        'volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`,
      ]);
      const afterTemps = await listTempRoots();
      const tempDirectories = afterTemps.filter((path) => !beforeTemps.includes(path)).length;
      if (ownedProcesses !== 0 || composeProjects !== 0 || containers !== 0 || volumes !== 0 || tempDirectories !== 0) {
        throw new Error('live smoke leftover owned resources remain');
      }
      return Object.freeze({
        ownedProcesses: 0 as const,
        composeProjects: 0 as const,
        containers: 0 as const,
        volumes: 0 as const,
        tempDirectories: 0 as const,
      });
    },
    async gitDiff() {
      const { stdout } = await execFile('git', ['diff', '--', '.'], { cwd: root });
      const { stdout: status } = await execFile('git', ['status', '--short'], { cwd: root });
      if (/(?:^|\n)[AM]\s+(?:output\/playwright|\.superpowers\/)/u.test(status)) {
        throw new Error('live smoke left tracked residue');
      }
      return `${stdout}\n${status}`;
    },
    listTempRoots,
  };
}

export async function runSearchProviderLiveStack(
  overrides: Partial<LiveSmokeDependencies> = {},
): Promise<void> {
  const dependencies = { ...productionLiveSmokeDependencies(), ...overrides };
  assertLiveSmokeConfirmation(dependencies.env);
  if (!dependencies.argv.includes('--confirm-live-provider')) {
    throw new Error('live smoke requires --confirm-live-provider');
  }
  const before = await dependencies.snapshotLedger();
  const indexReservationMicroUsd = await dependencies.indexReservationMicroUsd();
  assertLiveSmokeBudget(before.availableMicroUsd, indexReservationMicroUsd);

  const outputParent = resolve(root, 'output/playwright');
  await mkdir(outputParent, { recursive: true });
  const stagingRoot = await mkdtemp(resolve(outputParent, '.public-answer-live-stage-'));
  const cleanupRegistry = createCleanupRegistry();
  const stagingCleanup = cleanupRegistry.register('staging-root', async () => rm(stagingRoot, { recursive: true, force: true }));
  const beforeTemps = await dependencies.listTempRoots();
  let live: Awaited<ReturnType<LiveSmokeDependencies['startLive']>> | undefined;
  const signals = installRunnerSignalHandlers({
    children: () => (live ? [{ stop: live.stop }] : []),
    cleanups: () => cleanupRegistry.entries(),
  });
  let primary: unknown;
  try {
    live = await dependencies.startLive();
    const livePid = live.pid;
    const liveOutput = live.output;
    const browserOutput = await dependencies.runBrowser(live.url, stagingRoot);
    const browserReceiptBytes = await readFile(resolve(stagingRoot, 'browser-receipt.json'), 'utf8');
    const browserReceipt = parseBrowserReceipt(JSON.parse(browserReceiptBytes));
    const harvested = await readHarvestedSentinels(stagingRoot);
    if (browserReceipt.answeredQuestions >= 1 && harvested.length === 0) {
      throw new Error('live smoke did not harvest answer or excerpt sentinels');
    }
    const sentinels = liveSmokeSentinels(dependencies.env, harvested);
    const gitSentinels = sentinels.filter((value) => !liveQuestions.includes(value));
    assertNoLiveSmokeSentinels(browserReceiptBytes, sentinels);
    const after = await dependencies.snapshotLedger();
    const chargedDeltaMicroUsd = after.chargedMicroUsd - before.chargedMicroUsd;
    const liveProviderCalls = Math.max(1, browserReceipt.answeredQuestions);
    assertNoLiveSmokeSentinels(browserOutput, sentinels);
    assertNoLiveSmokeSentinels(liveOutput(), sentinels);
    assertNoLiveSmokeSentinels(await dependencies.readLedgerBytes(), sentinels);
    const diff = await dependencies.gitDiff();
    if (/(?:^|\n)[AM]\s+(?:output\/playwright|\.superpowers\/)/u.test(diff)) {
      throw new Error('live smoke left tracked residue');
    }
    assertNoLiveSmokeSentinels(diff, gitSentinels);
    await live.stop();
    live = undefined;
    const cleanup = await dependencies.inspectCleanup(livePid, beforeTemps);
    const receipt = parseLiveSmokeReceipt({
      schemaVersion: 1,
      status: 'PASS',
      fixtureMode: false,
      provenance: 'local-non-zdr',
      generationModel: PROVIDER_MODEL_POLICY.generationModel,
      semanticModel: PROVIDER_MODEL_POLICY.semanticModel,
      reasoningEffort: PROVIDER_MODEL_POLICY.reasoningEffort,
      embeddingModel: PROVIDER_MODEL_POLICY.embeddingModel,
      policyHash: PROVIDER_MODEL_POLICY.policyHash,
      liveProviderCalls,
      answeredQuestions: browserReceipt.answeredQuestions,
      fallbackQuestions: browserReceipt.fallbackQuestions,
      viewports: ['1440x900', '390x844'],
      ledger: {
        month: after.month,
        hardCapMicroUsd: MONTHLY_HARD_CAP_MICRO_USD,
        beforeChargedMicroUsd: before.chargedMicroUsd,
        afterChargedMicroUsd: after.chargedMicroUsd,
        chargedDeltaMicroUsd,
        availableMicroUsd: after.availableMicroUsd,
        reconciled: true,
      },
      cleanup,
    }, sentinels);
    assertNoLiveSmokeSentinels(JSON.stringify(receipt), sentinels);
    await rm(resolve(stagingRoot, 'response-sentinels.json'), { force: true });
    await writeFile(resolve(stagingRoot, 'live-smoke-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    cleanupRegistry.forget('staging-root');
    await publishEvidenceDirectory(stagingRoot, dependencies.evidenceDestination);
    if (browserOutput.trim() !== '') {
      process.stdout.write(scrubLiveSmokeDiagnostics(browserOutput, dependencies.env, harvested));
    }
    process.stdout.write(
      `search provider live smoke: PASS (${String(browserReceipt.answeredQuestions)} answer, `
      + `${String(browserReceipt.fallbackQuestions)} fallback, live provider calls ${String(liveProviderCalls)})\n`,
    );
  } catch (error) {
    const harvested = await readHarvestedSentinels(stagingRoot).catch(() => []);
    primary = new Error(scrubLiveSmokeDiagnostics(
      error instanceof Error ? error.message : String(error),
      dependencies.env,
      harvested,
    ));
  } finally {
    signals.remove();
    const signalOutcome = await signals.outcome();
    if (primary === undefined && signalOutcome !== undefined) primary = signalOutcome;
    if (live) {
      try {
        const harvested = await readHarvestedSentinels(stagingRoot).catch(() => []);
        assertNoLiveSmokeSentinels(live.output(), liveSmokeSentinels(dependencies.env, harvested));
      } catch (error) {
        const harvested = await readHarvestedSentinels(stagingRoot).catch(() => []);
        primary ??= new Error(scrubLiveSmokeDiagnostics(
          error instanceof Error ? error.message : String(error),
          dependencies.env,
          harvested,
        ));
      }
    }
    const settled = await settleCleanup(primary, [
      ['live', async () => live?.stop()],
      ['staging', stagingCleanup],
    ]);
    if (settled !== undefined) throw settled;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  assertLiveSmokeConfirmation();
  if (!process.argv.slice(2).includes('--confirm-live-provider')) {
    throw new Error('live smoke requires --confirm-live-provider');
  }
  await runSearchProviderLiveStack();
}
