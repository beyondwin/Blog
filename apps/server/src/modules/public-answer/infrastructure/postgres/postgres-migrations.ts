import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/001_public_answer.sql');

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  await pool.query(await readFile(migrationPath, 'utf8'));
}
