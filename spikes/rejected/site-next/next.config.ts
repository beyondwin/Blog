import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@beyondwin/content', '@beyondwin/contracts'],
  generateBuildId: async () => 'public-reading-continuity-next-v1',
};

export default nextConfig;
