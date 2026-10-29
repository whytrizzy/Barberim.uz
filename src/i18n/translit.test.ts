import { describe, expect, it } from 'vitest';
import { latinToCyrillic } from './translit';

describe('latinToCyrillic', () => {
  it.each([
    ['Oʻzbekcha', 'Ўзбекча'],
    ['Boʻsh vaqtlar', 'Бўш вақтлар'],
    ['Yozilish', 'Ёзилиш'],
    ['Ertaga', 'Эртага'],
    ['Davom etish', 'Давом этиш'],
    ['Seshanba', 'Сешанба'],
    ['Yangi', 'Янги'],
    ['Mahalla', 'Маҳалла'],
    ['maʼlumot', 'маълумот'],
    ['Bogʻ', 'Боғ'],
    ['Tong', 'Тонг'],
    ['yetti', 'етти'],
    ['Yuklanmoqda…', 'Юкланмоқда…'],
    ['SARTAROSHXONA', 'САРТАРОШХОНА'],
    ['Choyxona', 'Чойхона'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(latinToCyrillic(latin)).toBe(cyrillic);
  });

  it('accepts apostrophe variants people type instead of ʻ', () => {
    expect(latinToCyrillic("o'zbek")).toBe('ўзбек');
    expect(latinToCyrillic('g‘alaba')).toBe('ғалаба');
  });

  it('keeps placeholders, commands, URLs, env names and brands as they are', () => {
    expect(latinToCyrillic('{count} ta mijoz')).toBe('{count} та мижоз');
    expect(latinToCyrillic('Barberim orqali /start bosing')).toBe('Barberim орқали /start босинг');
    expect(latinToCyrillic('NEXT_PUBLIC_APP_URL https://x.uz bilan')).toBe(
      'NEXT_PUBLIC_APP_URL https://x.uz билан',
    );
    expect(latinToCyrillic('Telegram ichida')).toBe('Telegram ичида');
    expect(latinToCyrillic('Yandex yoki Google xarita')).toBe('Yandex ёки Google харита');
  });
});
