import { parseEnv, serverEnvSchema, type ServerEnv } from './schema';

if (typeof window !== 'undefined') {
  throw new Error('src/env/server.ts must never be imported by client code');
}

const skip = process.env.SKIP_ENV_VALIDATION === '1';

export const serverEnv: ServerEnv = skip
  ? (process.env as unknown as ServerEnv)
  : parseEnv(serverEnvSchema, process.env, 'server');
