export interface OwnedComposeRun {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  capture: boolean;
  signal?: AbortSignal;
}

export interface OwnedPostgresDependencies {
  repositoryRoot: string;
  composeFile: string;
  projectName: string;
  env: NodeJS.ProcessEnv;
  run(input: OwnedComposeRun): Promise<string>;
}

export function parseComposeMappedPort(mapped: string): string {
  const trimmed = mapped.trim();
  const port = trimmed.slice(trimmed.lastIndexOf(':') + 1);
  if (!/^\d+$/u.test(port)) throw new Error('Compose returned an invalid Postgres port');
  return port;
}

export function composeDatabaseUrl(port: string): string {
  return `postgresql://beyondwin_test:beyondwin_test@127.0.0.1:${port}/beyondwin_test`;
}

export async function startOwnedPostgres(
  dependencies: OwnedPostgresDependencies,
  signal?: AbortSignal,
): Promise<{ databaseUrl: string; stop(): Promise<void> }> {
  const docker = (args: readonly string[], capture = false, interruptible = true) => dependencies.run({
    command: 'docker', args, cwd: dependencies.repositoryRoot, env: dependencies.env, capture,
    ...(interruptible ? { signal } : {}),
  });
  let startupAttempted = false;
  try {
    startupAttempted = true;
    await docker(['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'up', '-d', '--wait']);
    const port = parseComposeMappedPort(await docker([
      'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'port', 'postgres', '5432',
    ], true));
    return {
      databaseUrl: composeDatabaseUrl(port),
      async stop() {
        await docker([
          'compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans',
        ], false, false);
      },
    };
  } catch (error) {
    if (startupAttempted) await dependencies.run({
      command: 'docker',
      args: ['compose', '-p', dependencies.projectName, '-f', dependencies.composeFile, 'down', '-v', '--remove-orphans'],
      cwd: dependencies.repositoryRoot,
      env: dependencies.env,
      capture: false,
    }).catch(() => undefined);
    throw error;
  }
}
