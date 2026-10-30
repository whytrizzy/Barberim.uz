import { describe, expect, it } from 'vitest';
import { clientEnvSchema, parseEnv, serverEnvSchema } from './schema';

const validToken = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

describe('serverEnvSchema', () => {
  it('defaults to development and allows missing DB and bot token there', () => {
    const env = parseEnv(serverEnvSchema, {}, 'server');
    expect(env.APP_ENV).toBe('development');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv(serverEnvSchema, { DATABASE_URL: '', TELEGRAM_BOT_TOKEN: '' }, 'server');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it('requires DB, bot token, webhook secret and photo storage outside development', () => {
    expect(() => parseEnv(serverEnvSchema, { APP_ENV: 'production' }, 'server')).toThrow(
      /DATABASE_URL[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET[\s\S]*MEDIA_BUCKET[\s\S]*MEDIA_BASE_URL/,
    );
    const env = parseEnv(
      serverEnvSchema,
      {
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@host:5432/db',
        TELEGRAM_BOT_TOKEN: validToken,
        TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
        MEDIA_BUCKET: 'barberim-media-prod',
        MEDIA_BASE_URL: 'https://d123.cloudfront.net',
      },
      'server',
    );
    expect(env.APP_ENV).toBe('production');
    expect(env.AWS_REGION).toBe('eu-central-1');
  });

  it('rejects a media base URL with a trailing slash', () => {
    expect(() =>
      parseEnv(serverEnvSchema, { MEDIA_BASE_URL: 'https://d123.cloudfront.net/' }, 'server'),
    ).toThrow(/trailing slash/);
  });

  it('rejects a malformed bot token', () => {
    expect(() => parseEnv(serverEnvSchema, { TELEGRAM_BOT_TOKEN: 'abc' }, 'server')).toThrow(
      /BotFather/,
    );
  });
});

describe('clientEnvSchema', () => {
  it('defaults the app URL for local development', () => {
    expect(parseEnv(clientEnvSchema, {}, 'client').NEXT_PUBLIC_APP_URL).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects a bot username with @', () => {
    expect(() =>
      parseEnv(clientEnvSchema, { NEXT_PUBLIC_BOT_USERNAME: '@barberim_bot' }, 'client'),
    ).toThrow(/without @/);
  });
});
