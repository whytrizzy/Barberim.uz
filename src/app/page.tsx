'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Header } from '@/components/Header';
import { BarberDashboard } from '@/components/barber/BarberDashboard';
import { ClientDashboard } from '@/components/client/ClientDashboard';
import { OnboardingModal } from '@/components/OnboardingModal';
import { initTelegramWebApp } from '@/lib/telegramWebApp';
import { Scissors, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function Home() {
  const { t } = useLanguage();
  const { user, loading, isNewUser, error, isAuthenticated, refreshAuth } = useAuth();

  // Mandatory Telegram WebApp ready() and expand() call on mount
  useEffect(() => {
    initTelegramWebApp();
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      try {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      } catch (e) {
        console.warn('Telegram WebApp ready call warning:', e);
      }
    }
  }, []);

  // 1. Loading state with animated scissors
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-3 bg-slate-950 p-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 animate-bounce">
          <Scissors className="w-7 h-7 stroke-[2.5]" />
        </div>
        <p className="text-xs text-amber-400 font-bold tracking-wide animate-pulse">
          {t('loading')}
        </p>
      </div>
    );
  }

  // 2. Error Fallback Component UI with "Qayta urinish" (Retry) button
  if (error && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
        <div className="w-full max-w-sm glass-card-gold rounded-3xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10">
            <AlertTriangle className="w-8 h-8 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-white">{t('errorTitle')}</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {t('connectionError')}
            </p>
            {error && (
              <p className="text-[10px] text-red-400/80 font-mono bg-red-950/40 p-2 rounded-lg border border-red-900/40 mt-2 break-words whitespace-pre-wrap max-h-40 overflow-auto text-left">
                {error}
              </p>
            )}
          </div>

          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => refreshAuth()}
            className="gap-2 text-xs"
          >
            <RefreshCw className="w-4 h-4" /> {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Onboarding Modal for First-time users */}
      {isNewUser && <OnboardingModal />}

      <Header />

      <div className="max-w-md mx-auto p-4">
        {isAuthenticated && user?.role === 'BARBER' ? (
          <BarberDashboard />
        ) : isAuthenticated && user?.role === 'CLIENT' ? (
          <ClientDashboard />
        ) : (
          /* Fallback when not authenticated and not new user */
          !isNewUser && (
            <div className="text-center py-16 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
                <Scissors className="w-6 h-6 stroke-[2]" />
              </div>
              <p className="text-xs text-slate-400">{t('connectionError')}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refreshAuth()}
                className="gap-1.5 text-xs mx-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {t('retry')}
              </Button>
            </div>
          )
        )}
      </div>
    </main>
  );
}
