import { join } from 'node:path';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type Plugin } from 'vite';

function serveVerifiedReleaseAssets(): Plugin {
  return {
    name: 'beyondwin-verified-release-assets',
    apply: 'serve',
    async configureServer(server) {
      if (!process.env.BEYONDWIN_PUBLIC_RELEASE_BINDING_V1) return;
      const assets = await server.ssrLoadModule('/verified-release-assets.ts');
      const binding = await server.ssrLoadModule('/release-binding.ts');
      const release = await binding.readBoundActiveRelease(
        join(server.config.root, '../../build/public-releases'),
        process.env[binding.PUBLIC_RELEASE_BINDING_ENV],
      );
      server.middlewares.use(assets.createVerifiedReleaseAssetMiddleware(
        assets.verifiedReleaseAssetInventory(release),
      ));
    },
  };
}

export default defineConfig({
  plugins: [serveVerifiedReleaseAssets(), reactRouter()],
});
