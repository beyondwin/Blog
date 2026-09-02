import { existsSync, readFileSync } from 'node:fs';

const LOCAL_ENV_KEY = 'OPENAI_API_KEY';

export function parseIgnoredLocalEnvFile(source: string): Readonly<Record<string, string>> {
  const parsed: Record<string, string> = {};
  for (const raw of source.split(/\n/u)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key !== LOCAL_ENV_KEY) continue;
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    )) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function applyIgnoredLocalEnv(
  env: NodeJS.ProcessEnv,
  parsed: Readonly<Record<string, string>>,
): void {
  const current = env[LOCAL_ENV_KEY];
  if (typeof current === 'string' && current.trim() !== '') return;
  const next = parsed[LOCAL_ENV_KEY];
  if (typeof next === 'string' && next.trim() !== '') env[LOCAL_ENV_KEY] = next;
}

export function loadIgnoredLocalEnvFile(env: NodeJS.ProcessEnv, filePath: string): void {
  if (!existsSync(filePath)) return;
  applyIgnoredLocalEnv(env, parseIgnoredLocalEnvFile(readFileSync(filePath, 'utf8')));
}
