import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each integration suite boots Nest and native SQLite. Bound startup pressure on desktop/CI hosts.
    maxWorkers: 2,
    testTimeout: 60_000,
    // Seeding now covers 9,470 authored tasks; full-store integration hooks can
    // briefly exceed 30 seconds on a contended local SQLite filesystem.
    hookTimeout: 60_000,
  },
});
