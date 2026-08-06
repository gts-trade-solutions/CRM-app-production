// Integration tests hit the real local MySQL database (DATABASE_URL).
// Kept out of `npm test` so unit tests and CI stay database-free until the
// pipeline gets a MySQL service container.

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // DB tests mutate shared state — run sequentially.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
