'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';
import { Scissors } from 'lucide-react';

export function Header() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 w-full bg-[rgba(11,14,18,0.9)] backdrop-blur-md border-b border-line px-4 py-2.5">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold to-gold-600 flex items-center justify-center text-gold-ink shadow-md">
            <Scissors className="w-[18px] h-[18px] stroke-[2.5]" />
          </div>
          <h1 className="text-base font-extrabold tracking-tight text-white">
            {t('appName')}
          </h1>
        </div>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="bg-surface border border-line rounded-xl text-xs font-bold text-muted outline-none px-2.5 py-1.5 cursor-pointer"
        >
          <option value="uz" className="bg-surface text-white">UZ</option>
          <option value="ru" className="bg-surface text-white">RU</option>
          <option value="en" className="bg-surface text-white">EN</option>
        </select>
      </div>
    </header>
  );
}
