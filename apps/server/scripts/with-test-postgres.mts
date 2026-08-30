import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface HarnessRun {
  command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; capture: boolean;
}

export interface TestPostgresHarnessDependencies {
  repositoryRoot: string; composeFile: string; postgresConfig: string; vitestEntrypoint: string;
  projectName: string; env: NodeJS.ProcessEnv; execPath: string;
  discover(): Promise<readonly string[]>;
  run(input: HarnessRun): Promise<string>;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function spawnRun(input: HarnessRun): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd, env: input.env, stdio: input.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', shell: false,
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept(output) : reject(new Error(`${input.command} exited ${code ?? signal}`)));
  });
}

function productionDependencies(): TestPostgresHarnessDependencies {
  return {
    repositoryRoot,
    composeFile: resolve(repositoryRoot, 'apps/server/compose.test.yml'),
    postgresConfig: resolve(repositoryRoot, 'apps/server/vitest.postgres.config.ts'),
    vitestEntrypoint: resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs'),
    projectName: `beyondwin-public-answer-${process.pid}`,
    env: process.env,
    execPath: process.execPath,
    async discover() {
      return (await readdir(resolve(repositoryRoot, 'apps/server/test/postgres'))).filter((name) => name.endsWith('.test.ts'));
    },
    run: spawnRun,
  };
}

export async function runTestPostgresHarness(
  mode: string | undefined,
  dependencies: TestPostgresHarnessDependencies = productionDependencies(),
): Promise<void> {
  const allowed = new Set(['test', 'eval', 'eval-hidden', 'eval-hidden-provider-live']);
  if (!mode || !allowed.has(mode)) throw new Error('mode must be exactly test, eval, eval-hidden, or eval-hidden-provider-live');
  if ((await dependencies.discover()).length === 0) throw new Error('dedicated Postgres config discovered zero owned tests');
  let started = false;
  const docker = (args: readonly string[], capture = false) => dependencies.run({
    command: 'docker', args, cwd: dependencies.repositoryRoot, env: dependencies.env, capture,
  });
  try {
    await docker(['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'up', '-d', '--wait']);
    started = true;
    const mapped = (await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'port', 'postgres', '5432',
    ], true)).trim();
    const port = mapped.slice(mapped.lastIndexOf(':') + 1);
    if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
    if (mode !== 'test') throw new Error(`${mode} is reserved until its owning runtime task installs the executable suite`);
    await dependencies.run({
      command: dependencies.execPath,
      args: [dependencies.vitestEntrypoint, 'run', '--config', dependencies.postgresConfig],
      cwd: dependencies.repositoryRoot,
      env: {
        ...dependencies.env,
        FORM_THOUGHT_TEST_DATABASE_URL: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`,
      },
      capture: false,
    });
  } finally {
    if (started) await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans',
    ]).catch((error) => {
      process.stderr.write(`Postgres cleanup failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await runTestPostgresHarness(process.argv[2]);
}
