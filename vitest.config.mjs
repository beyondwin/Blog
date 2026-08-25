export default {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      'spikes/rejected/**',
      'tests/e2e/**',
    ],
  },
};
