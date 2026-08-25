import type { Config } from '@react-router/dev/config';
import { fullPublicPaths, loadVerifiedRelease } from './app/release.server';

export default {
  ssr: false,
  async prerender() {
    return fullPublicPaths(await loadVerifiedRelease());
  },
} satisfies Config;
