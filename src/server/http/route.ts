import 'server-only';
import { z } from 'zod';
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

/** A UUID from the URL; anything else is a 404, never a database error. */
export function uuidParam(value: string, what: string): string {
  if (!z.uuid().safeParse(value).success) throw new AppError('not_found', `bad ${what} id`);
  return value;
}

/** A raw (binary) body of at most `maxBytes`; bigger ones are refused before being read in full. */
export async function readBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new AppError('invalid_input', 'body too large', { reason: 'too_large' });
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > maxBytes) throw tooLarge();
  if (bytes.length === 0) throw new AppError('invalid_input', 'empty body');
  return bytes;
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
