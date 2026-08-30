import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const composeFile = resolve(repositoryRoot, 'apps/server/compose.test.yml');
const postgresConfig = resolve(repositoryRoot, 'apps/server/vitest.postgres.config.ts');
const vitestEntrypoint = resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs');
const projectName = `beyondwin-public-answer-${process.pid}`;
const mode = process.argv[2];
const allowed = new Set(['test', 'eval', 'eval-hidden', 'eval-hidden-provider-live']);
if (!mode || !allowed.has(mode) || process.argv.length !== 3) throw new Error('mode must be exactly test, eval, eval-hidden, or eval-hidden-provider-live');

function run(command: string, args: readonly string[], env = process.env, capture = false): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(command, [...args], {
      cwd: repositoryRoot, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', shell: false,
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? accept(output) : reject(new Error(`${command} exited ${code ?? signal}`)));
  });
}

async function assertOwnedPostgresTests(): Promise<void> {
  const directory = resolve(repositoryRoot, 'apps/server/test/postgres');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.test.ts'));
  if (files.length === 0) throw new Error('dedicated Postgres config discovered zero owned tests');
}

let started = false;
try {
  await assertOwnedPostgresTests();
  await run('docker', ['compose', '-p', projectName, '-f', composeFile, 'up', '-d', '--wait']);
  started = true;
  const mapped = (await run('docker', ['compose', '-p', projectName, '-f', composeFile, 'port', 'postgres', '5432'], process.env, true)).trim();
  const port = mapped.slice(mapped.lastIndexOf(':') + 1);
  if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
  const env = { ...process.env, FORM_THOUGHT_TEST_DATABASE_URL: `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test` };
  if (mode !== 'test') throw new Error(`${mode} is reserved until its owning runtime task installs the executable suite`);
  await run(process.execPath, [vitestEntrypoint, 'run', '--config', postgresConfig], env);
} finally {
  if (started) await run('docker', ['compose', '-p', projectName, '-f', composeFile, 'down', '-v', '--remove-orphans']).catch((error) => {
    process.stderr.write(`Postgres cleanup failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
