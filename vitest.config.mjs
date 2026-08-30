export default {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      '**/.superpowers/**',
      'spikes/rejected/**',
      'tests/e2e/**',
      'apps/server/test/postgres/**',
      'apps/server/test/evaluation/**',
    ],
  },
};
