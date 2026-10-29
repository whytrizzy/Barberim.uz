import 'server-only';
import { normalizeUzPhone } from '@/domain/phone';
import type { PhoneRejection } from '@/features/profile/schemas';
import type { User } from '@/generated/prisma/client';
import { db } from '../db/client';
import { AppError } from '../http/errors';

function reject(reason: PhoneRejection): never {
  throw new AppError('invalid_input', reason, { reason });
}

/**
 * Saves a phone the user shared through Telegram (verified: Telegram vouches it belongs to
 * this account). The contact must be the user's own — not someone else's from their contacts.
 */
export async function savePhoneFromTelegram(
  user: Pick<User, 'id' | 'telegramId'>,
  contact: { user_id: number; phone_number: string },
): Promise<User> {
  if (BigInt(contact.user_id) !== user.telegramId) {
    throw new AppError('forbidden', 'shared contact belongs to another account');
  }
  // Telegram gives digits, sometimes with a "+": "998901234567".
  const phone = normalizeUzPhone(contact.phone_number);
  if (!phone) reject('phone_not_uz');
  return db.user.update({ where: { id: user.id }, data: { phone, phoneVerified: true } });
}

/**
 * A contact the user sent to the bot (Telegram does this when they share it from the Mini App).
 * Telegram fills `user_id` only for the sender's own contact card, so it must match the sender.
 */
export async function savePhoneFromBotContact(
  from: { id: number; first_name: string; last_name?: string; username?: string },
  contact: { user_id?: number; phone_number: string },
): Promise<'saved' | 'not_own' | 'not_uz'> {
  if (contact.user_id !== from.id) return 'not_own';
  const phone = normalizeUzPhone(contact.phone_number);
  if (!phone) return 'not_uz';
  await db.user.upsert({
    where: { telegramId: BigInt(from.id) },
    create: {
      telegramId: BigInt(from.id),
      firstName: from.first_name,
      lastName: from.last_name ?? null,
      username: from.username ?? null,
      phone,
      phoneVerified: true,
    },
    update: { phone, phoneVerified: true },
  });
  return 'saved';
}

/** Saves a typed phone. Unverified, unless it's the same number Telegram already verified. */
export async function savePhoneManually(
  user: Pick<User, 'id' | 'phone' | 'phoneVerified'>,
  input: string,
): Promise<User> {
  const phone = normalizeUzPhone(input);
  if (!phone) {
    // 11+ digits not starting with 998 looks like a full foreign number (+7…, +90…).
    const digits = input.replace(/\D/g, '');
    reject(digits.length >= 11 && !digits.startsWith('998') ? 'phone_not_uz' : 'phone_invalid');
  }
  const phoneVerified = user.phoneVerified && user.phone === phone;
  return db.user.update({ where: { id: user.id }, data: { phone, phoneVerified } });
}
