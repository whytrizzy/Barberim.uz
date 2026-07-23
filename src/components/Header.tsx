'use client';

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';
import { Scissors, Globe, ShieldCheck, User } from 'lucide-react';
import { Badge } from './ui/Badge';

export function Header() {
  const { language, setLanguage, t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const currentRole = user?.role || 'CLIENT';

  return (
    <header className="sticky top-0 z-40 w-full glass-card border-b border-slate-800/80 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
            <Scissors className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
              {t('appName')}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">{t('tagline')}</p>
          </div>
        </div>

        {/* Right side: Language Selector & Role Badge */}
        <div className="flex items-center gap-2">
          {/* Language selector pill */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <Globe className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-0.5" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none pr-1 cursor-pointer"
            >
              <option value="uz" className="bg-slate-900 text-white">UZ</option>
              <option value="ru" className="bg-slate-900 text-white">RU</option>
              <option value="en" className="bg-slate-900 text-white">EN</option>
            </select>
          </div>

          {/* Role indicator badge */}
          {isAuthenticated && (
            <Badge variant={currentRole === 'BARBER' ? 'gold' : 'info'}>
              {currentRole === 'BARBER' ? (
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> {t('roleBarber')}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {t('roleClient')}
                </span>
              )}
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
