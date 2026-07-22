'use client';

import React, { useState } from 'react';
import { BarberProfileType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';
import { User, Phone, MapPin, FileText, Save, Check, Globe } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProfileSettingsProps {
  profile: BarberProfileType;
  onSave: (updated: { bio: string; address: string }) => Promise<void>;
}

export function ProfileSettings({ profile, onSave }: ProfileSettingsProps) {
  const { language, setLanguage, t } = useLanguage();
  const [fullName, setFullName] = useState(profile.user?.fullName || 'Sardor Barber');
  const [phone, setPhone] = useState(profile.user?.phone || '+998 90 123 45 67');
  const [address, setAddress] = useState(profile.address || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({ bio, address });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-4 h-4 text-amber-400" /> {t('profileSetup')}
        </h3>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" /> {t('saved')}
          </span>
        )}
      </div>

      {/* Language Selector in Profile Tab */}
      <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
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
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {lang.name}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">{t('fullName')}</label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Sardor Barber"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">{t('phone')}</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="+998 90 123 45 67"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">{t('salonAddress')}</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Amir Temur Ave 42, Tashkent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">{t('bio')}</label>
          <div className="relative">
            <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="Tell clients about your master experience..."
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" fullWidth disabled={loading}>
          {loading ? (
            t('saving')
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> {t('saveProfile')}
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
