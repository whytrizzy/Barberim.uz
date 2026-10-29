import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';

// Tests against a real database: `npm run test:db`. Uses .env.local (the Neon dev branch).
try {
  process.loadEnvFile('.env.local');
} catch {
  // CI provides DATABASE_URL directly.
}

// Built explicitly rather than with mergeConfig, which would concatenate include/exclude and
// keep the base config's exclusion of *.db.test.ts.
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
