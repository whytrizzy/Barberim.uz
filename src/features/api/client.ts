import type { z } from 'zod';
import { AUTH_SCHEME } from '@/features/auth/schemas';
import { getWebApp } from '@/telegram/webapp';

/** A failed API call with the server's stable error code (see src/server/http/errors.ts). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

let devInitData: Promise<string | null> | null = null;

/**
 * Telegram's signed launch data for the Authorization header. Outside Telegram in development,
 * a dev login signed by the server stands in (production builds never ask for it).
 */
async function launchData(): Promise<string | null> {
  const webApp = getWebApp();
  if (webApp) return webApp.initData;
  if (process.env.NODE_ENV === 'production') return null;
  devInitData ??= fetch('/api/dev/init-data')
    .then(async (r) => (r.ok ? ((await r.json()) as { initData: string }).initData : null))
    .catch(() => null);
  return devInitData;
}

type Options<T extends z.ZodType> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates the response, so a server/client mismatch fails loudly instead of rendering junk. */
  schema: T;
  signal?: AbortSignal;
};

export async function api<T extends z.ZodType>(
  path: string,
  { method = 'GET', body, schema, signal }: Options<T>,
): Promise<z.infer<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const auth = await launchData();
  if (auth) headers.Authorization = `${AUTH_SCHEME} ${auth}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (json as { error?: { code?: string; details?: unknown } } | null)?.error;
    throw new ApiError(error?.code ?? 'internal', response.status, error?.details);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError('bad_response', response.status, parsed.error.issues);
  return parsed.data;
}
