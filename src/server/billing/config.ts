import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/env/server';

/** PRO per month when PRO_PRICE_UZS isn't set: a placeholder until the price is decided. */
export const DEFAULT_PRO_PRICE = 99_000;

export const proPrice = () => serverEnv.PRO_PRICE_UZS ?? DEFAULT_PRO_PRICE;

/** Payme, when its merchant id and key are set. */
export function paymeConfig() {
  const { PAYME_MERCHANT_ID: merchantId, PAYME_KEY: key, PAYME_TEST: test } = serverEnv;
  return merchantId && key ? { merchantId, key, test: test === true } : null;
}

/** Click, when its service, merchant and secret key are set. */
export function clickConfig() {
  const { CLICK_SERVICE_ID: serviceId, CLICK_MERCHANT_ID: merchantId } = serverEnv;
  const secret = serverEnv.CLICK_SECRET_KEY;
  return serviceId && merchantId && secret ? { serviceId, merchantId, secret } : null;
}

/** Compares secrets without leaking, through timing, how much of a guess was right. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
