import { parseEnv, serverEnvSchema, type ServerEnv } from './schema';

if (typeof window !== 'undefined') {
  throw new Error('src/env/server.ts must never be imported by client code');
}

const skip = process.env.SKIP_ENV_VALIDATION === '1';

export const serverEnv: ServerEnv = skip
  ? (process.env as unknown as ServerEnv)
  : parseEnv(serverEnvSchema, process.env, 'server');

/**
 * True only for local development (`next dev` with APP_ENV=development). Gates dev-only pages and
 * the dev login. Both conditions on purpose: APP_ENV defaults to "development", so a production
 * deploy that forgot to set it must still not expose dev tools — production builds run with
 * NODE_ENV=production.
 */
export const isDevelopment =
  serverEnv.APP_ENV === 'development' && process.env.NODE_ENV !== 'production';
