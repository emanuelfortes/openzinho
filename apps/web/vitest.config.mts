import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Opening a project database seeds the DataForSEO location tables (a few seconds each); with
    // several DB test files in parallel on a slow disk the 5 s default times out.
    testTimeout: 30_000,
    // beforeAll hooks create projects (and seed their databases) the same way.
    hookTimeout: 30_000,
  },
});
