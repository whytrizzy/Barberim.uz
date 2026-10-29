'use client';

import { useState, type ReactNode } from 'react';
import { LanguagePicker } from '@/features/settings/language-picker';
import { localeFromLanguageCode, type Locale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { useTelegram } from '@/telegram/provider';
import { useMainButton } from '@/telegram/use-main-button';
import { EnamelSign } from '@/ui/enamel-sign';

/**
 * First launch: ask for the language once (Uzbek Latin, Uzbek Cyrillic or Russian) before showing
 * the app. Telegram's language is preselected; the screen's own text follows the selection live.
 */
export function LanguageGate({ children }: { children: ReactNode }) {
  const { chosen } = useI18n();
  const { mode } = useTelegram();
  if (chosen) return children;
  // Wait for the Telegram user before suggesting a language, to avoid a visible jump.
  if (mode === 'loading') return null;
  return <LanguageChoice />;
}

function LanguageChoice() {
  const { setLocale } = useI18n();
  const { user } = useTelegram();
  const suggested = localeFromLanguageCode(
    user?.language_code ?? (typeof navigator === 'undefined' ? null : navigator.language),
  );
  const [picked, setPicked] = useState<Locale | null>(null);
  const selected = picked ?? suggested;
  const t = getMessages(selected);

  useMainButton({ text: t.common.continue, onClick: () => setLocale(selected) });

  return (
    <main lang={selected} className="mx-auto flex max-w-[390px] flex-col px-4 pt-6">
      <EnamelSign overline="Sartaroshxona">Barberim</EnamelSign>
      <h2 className="mt-8 font-sign text-[28px] leading-none font-bold uppercase">
        {t.language.title}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{t.language.hint}</p>
      <div className="mt-5">
        <LanguagePicker value={selected} onChange={setPicked} label={t.language.title} />
      </div>
    </main>
  );
}
