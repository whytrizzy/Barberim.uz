import 'server-only';
import { AppError } from './errors';

/**
 * Fixed-window rate limiter kept in memory. Good enough to stop a single client hammering an
 * endpoint; on Lambda each instance has its own counters, so it is a brake, not a wall.
 * A shared store (DB / Redis) replaces it in P3.7.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowSeconds: number, now = Date.now()) {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (windows.size > 10_000) sweep(now);
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new AppError(
      'rate_limited',
      `rate limit for ${key}`,
      Math.ceil((current.resetAt - now) / 1000),
    );
  }
}

function sweep(now: number) {
  for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
}

/** For tests. */
export function resetRateLimits() {
  windows.clear();
}
