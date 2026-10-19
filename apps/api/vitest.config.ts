import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each integration suite boots Nest and native SQLite. Bound startup pressure on desktop/CI hosts.
    maxWorkers: 2,
    hookTimeout: 30_000,
  },
});
