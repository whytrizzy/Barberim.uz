import 'server-only';

/**
 * Expected failures a route can return to the client. The `code` is stable and the client maps
 * it to translated text; `message` is for logs and developers, never shown to users as-is.
 */
export type AppErrorCode =
  | 'unauthorized' // no or invalid Telegram launch data
  | 'session_expired' // launch data too old: reopen the app
  | 'forbidden' // signed in, but not allowed (e.g. not staff of this shop)
  | 'not_found'
  | 'invalid_input'
  | 'conflict' // e.g. the time slot was just taken
  | 'rate_limited'
  | 'internal';

const statusByCode: Record<AppErrorCode, number> = {
  unauthorized: 401,
  session_expired: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string = code,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

export type ErrorBody = { error: { code: AppErrorCode; details?: unknown } };

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, details: error.details } };
    const headers: HeadersInit =
      error.code === 'rate_limited' ? { 'Retry-After': String(error.details ?? 60) } : {};
    return Response.json(body, { status: error.status, headers });
  }
  // Unknown failures: log what happened, tell the client nothing more than "internal".
  console.error('unhandled route error', error instanceof Error ? error.stack : error);
  return Response.json({ error: { code: 'internal' } } satisfies ErrorBody, { status: 500 });
}
