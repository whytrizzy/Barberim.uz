import 'server-only';
import type { z } from 'zod';
import { AppError, errorResponse } from './errors';

/**
 * Wraps a route handler: whatever it throws becomes a proper JSON error response.
 *   export const POST = route(async (request) => Response.json(...));
 */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parses a JSON body with a Zod schema; bad input becomes a 400 with the field problems. */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('invalid_input', 'body is not JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      'invalid_input',
      'body failed validation',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
