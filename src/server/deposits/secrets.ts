import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { serverEnv } from '@/env/server';

// A shop's own Payme key, Click secret or Uzum password, encrypted before it touches the database
// (AES-256-GCM: anyone altering the stored value makes it fail to open, not quietly change).
// Stored as "v1.<iv>.<tag>.<ciphertext>", base64url.

const key = () => {
  const secret = serverEnv.DEPOSIT_KEYS_SECRET;
  if (!secret) throw new Error('DEPOSIT_KEYS_SECRET is not set');
  return createHash('sha256').update(secret).digest();
};

/** Whether shops can connect providers here (the encryption key is set). */
export const canStoreSecrets = () => Boolean(serverEnv.DEPOSIT_KEYS_SECRET);

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url'));
  return ['v1', ...parts].join('.');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('unreadable secret');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
