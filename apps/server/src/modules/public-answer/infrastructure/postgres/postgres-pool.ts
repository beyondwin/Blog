import { Pool } from 'pg';

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

export function createPostgresControlPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 1, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 500 });
}
