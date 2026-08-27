import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAstroHtmlContracts, type AstroBaseline } from './html-contract.ts';

const execFileAsync = promisify(execFile);
const buildLockRetryMs = 50;
const buildLockTimeoutMs = 180_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function acquireLegacyBuildLock(root: string): Promise<() => Promise<void>> {
  const lockPath = join(root, '.parity-legacy-build.lock');
  const deadline = Date.now() + buildLockTimeoutMs;

  while (true) {
    try {
      await mkdir(lockPath);
      return async () => rm(lockPath, { force: true, recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for legacy build lock at ${lockPath}`);
      await wait(buildLockRetryMs);
    }
  }
}

export async function buildLegacyAstro(root: string): Promise<void> {
  const {
    BASE_URL,
    DEV,
    MODE,
    PROD,
    SSR,
    TEST,
    VITEST,
    VITEST_MODE,
    VITEST_POOL_ID,
    VITEST_WORKER_ID,
    ...environment
  } = process.env;

  const releaseLock = await acquireLegacyBuildLock(root);
  try {
    await execFileAsync('npm', ['run', 'legacy:build'], {
      cwd: root,
      env: { ...environment, NODE_ENV: 'production' },
    });
  } finally {
    await releaseLock();
  }
}

export async function captureAstroBaseline(root: string): Promise<AstroBaseline> {
  return { version: 1, routes: await readAstroHtmlContracts(root) };
}

export async function writeAstroBaseline(root: string): Promise<string> {
  const outputPath = join(root, 'tests/fixtures/parity/astro-public-baseline.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(await captureAstroBaseline(root), null, 2)}\n`);
  return outputPath;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputPath = await writeAstroBaseline(process.cwd());
  console.log(`Captured Astro public baseline at ${outputPath}`);
}
