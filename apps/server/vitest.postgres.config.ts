import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  test: {
    include: ['apps/server/test/postgres/**/*.test.ts'],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
