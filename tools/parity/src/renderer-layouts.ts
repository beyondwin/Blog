import type { RendererName } from './compare-contracts.ts';

export interface RendererLayout {
  rendererRoot: string;
  rendererManifest: string;
  buildScript: string;
  outputRoot: string;
  cleanRoots: readonly string[];
}

export const RENDERER_LAYOUTS: Record<RendererName, RendererLayout> = {
  astro: {
    rendererRoot: '.',
    rendererManifest: 'package.json',
    buildScript: 'legacy:build',
    outputRoot: 'dist',
    cleanRoots: ['dist', 'node_modules/.astro'],
  },
  next: {
    rendererRoot: 'spikes/site-next',
    rendererManifest: 'spikes/site-next/package.json',
    buildScript: 'build',
    outputRoot: 'spikes/site-next/out',
    cleanRoots: ['spikes/site-next/out', 'spikes/site-next/.next'],
  },
  'react-router': {
    rendererRoot: 'spikes/site-react-router',
    rendererManifest: 'spikes/site-react-router/package.json',
    buildScript: 'build',
    outputRoot: 'spikes/site-react-router/build/client',
    cleanRoots: [
      'spikes/site-react-router/build',
      'spikes/site-react-router/node_modules/.vite',
      'spikes/site-react-router/.react-router',
    ],
  },
};
