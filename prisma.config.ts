import { defineConfig } from 'prisma/config';

// Locally the URLs live in .env.local; in CI/production they come from the environment.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: rely on the real environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; the app itself uses the pooled DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
