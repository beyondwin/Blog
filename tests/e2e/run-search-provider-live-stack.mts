import { pathToFileURL } from 'node:url';

export function assertLiveSmokeConfirmation(env: NodeJS.ProcessEnv = process.env): void {
  if (env.FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE !== 'true') {
    throw new Error('live smoke requires FORM_THOUGHT_CONFIRM_LOCAL_LIVE_SMOKE=true');
  }
  if (typeof env.OPENAI_API_KEY !== 'string' || env.OPENAI_API_KEY.trim() === '') {
    throw new Error('live smoke requires OPENAI_API_KEY');
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  assertLiveSmokeConfirmation();
  if (!process.argv.slice(2).includes('--confirm-live-provider')) {
    throw new Error('live smoke requires --confirm-live-provider');
  }
  throw new Error('live smoke runner is not implemented');
}
