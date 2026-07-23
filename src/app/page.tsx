'use client';

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Header } from '@/components/Header';
import { BarberDashboard } from '@/components/barber/BarberDashboard';
import { ClientDashboard } from '@/components/client/ClientDashboard';
import { OnboardingModal } from '@/components/OnboardingModal';
import { Scissors } from 'lucide-react';

export default function Home() {
  const { t } = useLanguage();
  const { user, loading, isNewUser, isAuthenticated } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-3 bg-slate-950">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 animate-bounce">
          <Scissors className="w-7 h-7 stroke-[2.5]" />
        </div>
        <p className="text-xs text-amber-400 font-bold tracking-wide">{t('loading')}</p>
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
          /* Not authenticated + not new user = show a simple waiting state */
          !isNewUser && (
            <div className="text-center py-16 space-y-3">
              <Scissors className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">{t('loading')}</p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
