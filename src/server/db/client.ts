import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { serverEnv } from '@/env/server';
import { PrismaClient } from '@/generated/prisma/client';

function createClient(): PrismaClient {
  const connectionString = serverEnv.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  // The pooled (Neon PgBouncer) URL, so restarts and extra instances share few connections.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Neon scales to zero when idle; waking it takes a few seconds. Prisma's defaults (2 s wait,
    // 5 s run) would fail the first request after a quiet period, so allow for the cold start.
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });
}

// One client per process; in development it survives hot reloads instead of leaking connections.
const globalForDb = globalThis as unknown as { barberimDb?: PrismaClient };

export const db: PrismaClient = globalForDb.barberimDb ?? createClient();

if (serverEnv.APP_ENV === 'development') globalForDb.barberimDb = db;
