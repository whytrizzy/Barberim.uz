import { savePhoneRequestSchema, type SavePhoneResponse } from '@/features/profile/schemas';
import { serverEnv } from '@/env/server';
import { requireUser } from '@/server/auth/auth';
import { InitDataInvalid, verifySharedContact } from '@/server/auth/init-data';
import { AppError } from '@/server/http/errors';
import { rateLimit } from '@/server/http/rate-limit';
import { readJson, route } from '@/server/http/route';
import { savePhoneFromTelegram, savePhoneManually } from '@/server/services/profile';

export const dynamic = 'force-dynamic';

/** Saves the signed-in user's phone: verified via Telegram contact sharing, or typed by hand. */
export const PUT = route(async (request) => {
  const user = await requireUser(request);
  rateLimit(`phone:${user.id}`, 10, 60);
  const body = await readJson(request, savePhoneRequestSchema);

  let saved;
  if (body.source === 'telegram') {
    let contact;
    try {
      contact = verifySharedContact(body.contact, serverEnv.TELEGRAM_BOT_TOKEN ?? '');
    } catch (error) {
      if (error instanceof InitDataInvalid) {
        throw new AppError('invalid_input', error.message, { reason: 'contact_invalid' });
      }
      throw error;
    }
    saved = await savePhoneFromTelegram(user, contact);
  } else {
    saved = await savePhoneManually(user, body.phone);
  }

  const response: SavePhoneResponse = {
    phone: saved.phone ?? '',
    phoneVerified: saved.phoneVerified,
  };
  return Response.json(response, { headers: { 'Cache-Control': 'no-store' } });
});
