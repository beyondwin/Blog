import type { Config } from '@react-router/dev/config';
import { decisionSlicePaths, loadVerifiedRelease } from './app/release.server';

export default {
  ssr: false,
  async prerender() {
    return decisionSlicePaths(await loadVerifiedRelease());
  },
} satisfies Config;
