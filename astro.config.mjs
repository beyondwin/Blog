import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [mdx()],
  redirects: {
    '/reviews/the-life-you-can-save/': '/reviews/doing-good-better/',
  },
});
