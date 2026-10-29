import type { StartPayload } from './payload';

// Bot texts. Uzbek (Latin) by default, Russian for Russian-language Telegram users.
// Telegram's language_code can't tell Latin from Cyrillic Uzbek; the Mini App lets users switch.
// Moves into src/i18n with the rest of the copy in P0.7.

type Locale = 'uz' | 'ru';

const texts = {
  uz: {
    open: 'Barberimni ochish',
    openShop: 'Yozilish',
    openInvite: 'Taklifni ochish',
    welcome:
      'Assalomu alaykum! Barberim — sartaroshga navbatsiz, bir daqiqada yozilish.\n\nQuyidagi tugmani bosing.',
    shop: 'Sartaroshxona sahifasi tayyor. Usta, kun va boʻsh vaqtni tanlang.',
    staff: 'Ustangizning sahifasi. Boʻsh vaqtni tanlang.',
    invite: 'Sizni sartaroshxonaga usta sifatida taklif qilishdi. Qabul qilish uchun oching.',
    help: 'Barberim orqali sartaroshga yozilasiz va eslatma olasiz. Ochish uchun /start bosing.',
    devNoButton:
      '\n\n(Dev: Mini App tugmasi yoʻq — NEXT_PUBLIC_APP_URL https:// bilan boshlanishi kerak.)',
  },
  ru: {
    open: 'Открыть Barberim',
    openShop: 'Записаться',
    openInvite: 'Открыть приглашение',
    welcome:
      'Здравствуйте! Barberim — запись к барберу за минуту, без звонков и очередей.\n\nНажмите кнопку ниже.',
    shop: 'Страница барбершопа готова. Выберите мастера, день и свободное время.',
    staff: 'Страница вашего мастера. Выберите свободное время.',
    invite: 'Вас пригласили в барбершоп мастером. Откройте, чтобы принять.',
    help: 'Через Barberim можно записаться к барберу и получать напоминания. Нажмите /start.',
    devNoButton:
      '\n\n(Dev: кнопки Mini App нет — NEXT_PUBLIC_APP_URL должен начинаться с https://.)',
  },
} as const;

export type BotTexts = (typeof texts)[Locale];

export function botTexts(languageCode: string | undefined): BotTexts {
  return languageCode?.toLowerCase().startsWith('ru') ? texts.ru : texts.uz;
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
