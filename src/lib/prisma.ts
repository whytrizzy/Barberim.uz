import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Ensures DATABASE_URL contains connect_timeout=15 and pool_timeout=15
 * to prevent instant timeouts during cold starts on Vercel serverless functions.
 */
function getFormattedDatabaseUrl(url?: string): string {
  if (!url) return '';
  if (!url.includes('connect_timeout=')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}connect_timeout=15&pool_timeout=15`;
  }
  return url;
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
