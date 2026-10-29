import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Telegram Mini App launch data ("initData") verification.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   hash   = hex(HMAC_SHA256(key = secret, message = data_check_string))
 *   data_check_string = every received field except `hash`, as "key=value", sorted, joined by \n
 *
 * Only Telegram (and whoever holds the bot token) can produce a valid hash, so a verified
 * `user.id` really is the Telegram account that opened the app.
 */

export type InitDataUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type VerifiedInitData = {
  user: InitDataUser;
  authDate: Date;
  startParam: string | null;
};

export type InitDataError = 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'no_user';

export class InitDataInvalid extends Error {
  constructor(readonly reason: InitDataError) {
    super(`Telegram init data rejected: ${reason}`);
    this.name = 'InitDataInvalid';
  }
}

/** How long launch data stays valid. Telegram re-signs it every time the app is opened. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

function secretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

function sign(params: URLSearchParams, botToken: string): string {
  return createHmac('sha256', secretKey(botToken)).update(dataCheckString(params)).digest('hex');
}

type VerifyOptions = { now?: Date; maxAgeSeconds?: number };

/**
 * Checks the hash and freshness of any query string Telegram signs with the bot token
 * (launch data, shared contacts). Returns the params and their auth date.
 */
export function verifySignedParams(
  raw: string | null | undefined,
  botToken: string,
  { now = new Date(), maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS }: VerifyOptions = {},
): { params: URLSearchParams; authDateSeconds: number } {
  if (!raw) throw new InitDataInvalid('missing');
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataInvalid('malformed');

  const expected = Buffer.from(sign(params, botToken), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    throw new InitDataInvalid('bad_signature');
  }

  const authDateSeconds = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new InitDataInvalid('malformed');
  }
  const ageSeconds = now.getTime() / 1000 - authDateSeconds;
  // A little tolerance for clocks running ahead; anything older than the limit is stale.
  if (ageSeconds > maxAgeSeconds || ageSeconds < -300) throw new InitDataInvalid('expired');
  return { params, authDateSeconds };
}

export function verifyInitData(
  raw: string | null | undefined,
  botToken: string,
  options: VerifyOptions = {},
): VerifiedInitData {
  const { params, authDateSeconds } = verifySignedParams(raw, botToken, options);

  let user: InitDataUser;
  try {
    user = JSON.parse(params.get('user') ?? '') as InitDataUser;
  } catch {
    throw new InitDataInvalid('no_user');
  }
  if (!Number.isSafeInteger(user?.id) || typeof user.first_name !== 'string') {
    throw new InitDataInvalid('no_user');
  }

  return {
    user,
    authDate: new Date(authDateSeconds * 1000),
    startParam: params.get('start_param'),
  };
}

export type SharedContact = {
  user_id: number;
  phone_number: string;
  first_name: string;
  last_name?: string;
};

/**
 * Verifies the `response` Telegram returns from WebApp.requestContact(): a query string with a
 * `contact` JSON field, signed exactly like launch data. Contacts are fresh, so 10 minutes max.
 */
export function verifySharedContact(
  raw: string | null | undefined,
  botToken: string,
  { now = new Date() }: { now?: Date } = {},
): SharedContact {
  const { params } = verifySignedParams(raw, botToken, { now, maxAgeSeconds: 10 * 60 });
  let contact: SharedContact;
  try {
    contact = JSON.parse(params.get('contact') ?? '') as SharedContact;
  } catch {
    throw new InitDataInvalid('malformed');
  }
  if (!Number.isSafeInteger(contact?.user_id) || typeof contact.phone_number !== 'string') {
    throw new InitDataInvalid('malformed');
  }
  return contact;
}

/** Signs any Telegram-style params (tests and the dev login only). */
export function signParams(params: URLSearchParams, botToken: string): string {
  params.delete('hash');
  params.set('hash', sign(params, botToken));
  return params.toString();
}

/**
 * Produces launch data signed like Telegram does. Used by tests and by the development-only
 * login (browser mode outside Telegram) — never exposed in staging or production.
 */
export function signInitData(
  fields: { user: InitDataUser; auth_date?: number; start_param?: string; query_id?: string },
  botToken: string,
): string {
  const params = new URLSearchParams();
  params.set('query_id', fields.query_id ?? 'AAEdev');
  params.set('user', JSON.stringify(fields.user));
  params.set('auth_date', String(fields.auth_date ?? Math.floor(Date.now() / 1000)));
  if (fields.start_param) params.set('start_param', fields.start_param);
  params.set('hash', sign(params, botToken));
  return params.toString();
}
