import { defineConfig } from 'vitest/config';

// Bridge TEST_DATABASE_URL -> DATABASE_URL before src/db/client.ts is imported,
// so the shared drizzle Pool always points at the test database under vitest.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
