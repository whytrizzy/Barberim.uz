'use client';

import React, { useState } from 'react';
import { Role } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';
import { getTelegramUser } from '@/lib/telegramWebApp';
import { Scissors, User, ShieldCheck, Check, Globe } from 'lucide-react';
import { Button } from './ui/Button';

export function OnboardingModal() {
  const { language, setLanguage, t } = useLanguage();
  const { setAuthUser, clearNewUserFlag } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async () => {
    if (!selectedRole) return;
    setSubmitting(true);
    try {
      const tgUser = getTelegramUser();
      const telegramId = tgUser?.id || Date.now();
      const fullName = tgUser?.first_name
        ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim()
        : 'New User';
      const username = tgUser?.username || null;

      // Persist in PostgreSQL DB via API
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId,
          fullName,
          username,
          role: selectedRole,
        }),
      });

      const data = await res.json();

      if (data.success && data.user) {
        // Set auth context directly — no need to call refreshAuth
        setAuthUser({
          id: data.user.id,
          telegramId: data.user.telegramId,
          username: data.user.username,
          role: data.user.role,
          fullName: data.user.fullName,
          phone: data.user.phone,
          barberProfileId: data.user.barberProfileId || null,
        });
      } else {
        // Fallback: just clear new user flag
        clearNewUserFlag();
      }
    } catch (err) {
      console.error('Onboarding registration error:', err);
      clearNewUserFlag();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-md glass-card-gold rounded-3xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center text-slate-950 mx-auto shadow-lg shadow-amber-500/20">
            <Scissors className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-extrabold text-white">{t('onboardingTitle')}</h2>
          <p className="text-xs text-slate-300">{t('onboardingSubtitle')}</p>
        </div>

        {/* Language Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-400" /> {t('selectLanguage')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { code: 'uz', name: 'Oʻzbek' },
              { code: 'ru', name: 'Русский' },
              { code: 'en', name: 'English' },
            ].map((lang) => {
              const active = language === lang.code;
              return (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => setLanguage(lang.code as Language)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                    active
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {lang.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Account Type Selection */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-slate-300">
            {t('selectRoleTitle')}
          </label>

          {/* Client option */}
          <div
            onClick={() => setSelectedRole('CLIENT')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3.5 ${
              selectedRole === 'CLIENT'
                ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-1">
                {t('roleClient')}
                {selectedRole === 'CLIENT' && <Check className="w-4 h-4 text-amber-400" />}
              </h4>
              <p className="text-xs text-slate-400">{t('roleClientDesc')}</p>
            </div>
          </div>

          {/* Barber option */}
          <div
            onClick={() => setSelectedRole('BARBER')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3.5 ${
              selectedRole === 'BARBER'
                ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-1">
                {t('roleBarber')}
                {selectedRole === 'BARBER' && <Check className="w-4 h-4 text-amber-400" />}
              </h4>
              <p className="text-xs text-slate-400">{t('roleBarberDesc')}</p>
            </div>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selectedRole || submitting}
          onClick={handleFinish}
        >
          {submitting ? t('saving') : t('startApp')}
        </Button>
      </div>
    </div>
  );
}
