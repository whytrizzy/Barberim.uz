import { clientEnvSchema, parseEnv, type ClientEnv } from './schema';

// Next.js only inlines NEXT_PUBLIC_* vars that are referenced literally, so list each one here.
const raw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_BOT_USERNAME: process.env.NEXT_PUBLIC_BOT_USERNAME,
};

const skip = process.env.SKIP_ENV_VALIDATION === '1';

export const clientEnv: ClientEnv = skip
  ? (raw as ClientEnv)
  : parseEnv(clientEnvSchema, raw, 'client');
