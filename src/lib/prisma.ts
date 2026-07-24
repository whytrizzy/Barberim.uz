import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Formats the database URL to ensure required SSL, pgbouncer, and timeout parameters
 * for Supabase + Vercel serverless deployments.
 */
function getFormattedDatabaseUrl(url?: string): string {
  if (!url) return '';

  try {
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
    let formatted = url;

    // Add connect_timeout=15 if missing
    if (!formatted.includes('connect_timeout=')) {
      const sep = formatted.includes('?') ? '&' : '?';
      formatted += `${sep}connect_timeout=15`;
    }

    // Add pool_timeout=15 if missing
    if (!formatted.includes('pool_timeout=')) {
      const sep = formatted.includes('?') ? '&' : '?';
      formatted += `${sep}pool_timeout=15`;
    }

    // Add sslmode=require for non-localhost if missing
    if (!isLocalhost && !formatted.includes('sslmode=')) {
      const sep = formatted.includes('?') ? '&' : '?';
      formatted += `${sep}sslmode=require`;
    }

    // Supabase transaction pooler (port 6543 / *.pooler.supabase.com) requires
    // pgbouncer=true so Prisma disables prepared statements — otherwise queries
    // intermittently fail on Vercel serverless ("prepared statement already exists").
    const usesPooler = formatted.includes(':6543') || formatted.includes('pooler.supabase.com');
    if (usesPooler && !formatted.includes('pgbouncer=')) {
      const sep = formatted.includes('?') ? '&' : '?';
      formatted += `${sep}pgbouncer=true`;
    }

    return formatted;
  } catch {
    return url;
  }
}

const dbUrl = getFormattedDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error'],
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// BigInt JSON serializer helper for Telegram IDs
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

/**
 * Executes a database query function with automatic retry on PrismaClientInitializationError / connection timeout
 * specifically designed for Vercel serverless cold starts to Supabase PostgreSQL.
 */
export async function withDbRetry<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 10000,
  maxRetries: number = 1
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    attempt++;
    try {
      const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('DATABASE_TIMEOUT')), timeoutMs)
      );
      return await Promise.race([queryFn(), timeoutPromise]);
    } catch (err: any) {
      const isInitError =
        err instanceof Prisma.PrismaClientInitializationError ||
        err?.name === 'PrismaClientInitializationError' ||
        err?.code === 'P1001' || // Cannot reach database server
        err?.code === 'P1002' || // Database server timed out
        err?.message?.includes("Can't reach database server") ||
        err?.message?.includes('connection') ||
        err?.message === 'DATABASE_TIMEOUT';

      if (isInitError && attempt <= maxRetries) {
        console.warn(
          `⚠️ DB connection attempt ${attempt} failed (${err?.message}). Retrying once (attempt ${attempt + 1})...`
        );
        // Brief 400ms pause to allow DB connection pool / cold start to settle
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw err;
    }
  }
  throw new Error('DATABASE_CONNECTION_ERROR');
}
