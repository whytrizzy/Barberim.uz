// Source of truth for all copy. uz-Cyrl is generated from this file (see ./index.ts); ru must
// have exactly the same keys. Placeholders look like {name}; keep them identical in every locale.

export const uzLatn = {
  meta: {
    /** The language's own name, shown in the language picker. */
    name: 'Oʻzbekcha',
  },
  common: {
    back: 'Orqaga',
    continue: 'Davom etish',
    cancel: 'Bekor qilish',
    save: 'Saqlash',
    close: 'Yopish',
    retry: 'Qayta urinish',
    loading: 'Yuklanmoqda…',
    somethingWrong: 'Nimadir xato ketdi. Qayta urinib koʻring.',
  },
  language: {
    title: 'Tilni tanlang',
    hint: 'Keyin sozlamalardan oʻzgartirish mumkin.',
  },
  profile: {
    phoneTitle: 'Telefon raqamingiz',
    phoneHint: 'Usta siz bilan bogʻlanishi va bot eslatma yuborishi uchun kerak.',
    shareTelegram: 'Telegram orqali yuborish',
    sharing: 'Kutilmoqda…',
    orManual: 'yoki qoʻlda kiriting',
    phoneLabel: 'Telefon raqam',
    save: 'Saqlash',
    change: 'Oʻzgartirish',
    verified: 'Telegram tasdiqlagan',
    declined: 'Raqam yuborilmadi. Uni qoʻlda kiritishingiz mumkin.',
    phoneInvalid: 'Raqam toʻliq emas: 9 ta raqam kiriting, masalan 90 123 45 67.',
    phoneNotUz: 'Hozircha faqat Oʻzbekiston raqamlari (+998) qabul qilinadi.',
  },
  errors: {
    network: 'Internet bilan aloqa yoʻq. Tarmoqni tekshirib, qayta urinib koʻring.',
    sessionExpired: 'Sessiya eskirdi. Ilovani yopib, qayta oching.',
    rateLimited: 'Juda koʻp urinish. Bir daqiqadan keyin qayta urinib koʻring.',
  },
  units: {
    currency: 'soʻm',
    minutes: '{m} daq',
    hours: '{h} soat',
    hoursMinutes: '{h} soat {m} daq',
  },
  calendar: {
    weekdaysShort: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
    weekdays: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'],
    /** Month names as used after a day number: "3-noyabr". */
    months: [
      'yanvar',
      'fevral',
      'mart',
      'aprel',
      'may',
      'iyun',
      'iyul',
      'avgust',
      'sentabr',
      'oktabr',
      'noyabr',
      'dekabr',
    ],
    dayMonth: '{day}-{month}',
    today: 'Bugun',
    tomorrow: 'Ertaga',
  },
  bot: {
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
    commandStart: 'Barberimni ochish',
    commandHelp: 'Yordam',
    phoneSaved: 'Rahmat! Telefon raqamingiz saqlandi.',
    phoneNotOwn: 'Iltimos, oʻzingizning raqamingizni yuboring.',
    phoneNotUz: 'Hozircha faqat Oʻzbekiston raqamlari (+998) qabul qilinadi.',
    shortDescription: 'Sartaroshga bir daqiqada yozilish — Telegram ichida.',
    description:
      'Barberim: ustangizni tanlang, boʻsh vaqtni bosing — tayyor. Eslatmani bot oʻzi yuboradi.',
  },
};

export type Messages = typeof uzLatn;
