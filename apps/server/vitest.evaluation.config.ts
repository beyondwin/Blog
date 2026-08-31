import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  test: {
    include: ['apps/server/test/evaluation/**/*.test.ts'],
    exclude: ['apps/server/test/postgres/**'],
    passWithNoTests: false,
    fileParallelism: false,
  },
});
