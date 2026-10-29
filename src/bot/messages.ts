import { localeFromLanguageCode } from '@/i18n/locales';
import { getMessages, type Messages } from '@/i18n/messages';
import type { StartPayload } from './payload';

// Bot copy lives in the shared dictionaries (src/i18n) under `bot`. Telegram's language_code
// can't tell Latin from Cyrillic Uzbek, so the bot answers "uz" users in Latin; once accounts
// exist (P1), the language picked in the Mini App is used instead.

export type BotTexts = Messages['bot'];

export function botTexts(languageCode: string | undefined): BotTexts {
  return getMessages(localeFromLanguageCode(languageCode)).bot;
}

export function startMessage(t: BotTexts, payload: StartPayload): { text: string; button: string } {
  switch (payload.kind) {
    case 'shop':
      return { text: t.shop, button: t.openShop };
    case 'staff':
      return { text: t.staff, button: t.openShop };
    case 'invite':
      return { text: t.invite, button: t.openInvite };
    case 'none':
      return { text: t.welcome, button: t.open };
  }
}
