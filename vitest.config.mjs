export default {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      '**/.superpowers/**',
      'spikes/rejected/**',
      'tests/e2e/**',
    ],
  },
};
