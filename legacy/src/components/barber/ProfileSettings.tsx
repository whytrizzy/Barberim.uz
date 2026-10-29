'use client';

import React, { useState } from 'react';
import { BarberProfileType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Language } from '@/lib/i18n/translations';
import { User, Phone, MapPin, FileText, Save, Check, Globe, Store } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProfileSettingsProps {
  profile: BarberProfileType;
  onSave: (updated: {
    shopName?: string;
    bio?: string;
    address?: string;
    fullName?: string;
    phone?: string;
  }) => Promise<void>;
}

export function ProfileSettings({ profile, onSave }: ProfileSettingsProps) {
  const { language, setLanguage, t } = useLanguage();
  const [fullName, setFullName] = useState(profile.user?.fullName || '');
  const [phone, setPhone] = useState(profile.user?.phone || '');
  const [shopName, setShopName] = useState(profile.shopName || '');
  const [address, setAddress] = useState(profile.address || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({ shopName, bio, address, fullName, phone });
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
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-4 h-4 text-gold" /> {t('profileSetup')}
        </h3>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" /> {t('saved')}
          </span>
        )}
      </div>

      {/* Language Selector in Profile Tab */}
      <div className="bg-surface p-3.5 rounded-xl border border-line space-y-2">
        <label className="block text-xs font-semibold text-muted flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-gold" /> {t('selectLanguage')}
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
                    ? 'bg-gold text-gold-ink border-gold shadow-sm'
                    : 'bg-bg text-muted border-line hover:text-white'
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
          <label className="block text-xs font-semibold text-muted mb-1">{t('fullName')}</label>
          <div className="relative">
            <User className="w-4 h-4 text-dim absolute left-3 top-3" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-dim focus:outline-none focus:border-gold"
              placeholder="e.g. Sardor Karimov"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1">{t('shopName')}</label>
          <div className="relative">
            <Store className="w-4 h-4 text-dim absolute left-3 top-3" />
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-dim focus:outline-none focus:border-gold"
              placeholder="e.g. Royal Barbershop"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1">{t('phone')}</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-dim absolute left-3 top-3" />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-dim focus:outline-none focus:border-gold"
              placeholder="+998 90 123 45 67"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1">{t('salonAddress')}</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-dim absolute left-3 top-3" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-dim focus:outline-none focus:border-gold"
              placeholder="e.g. Amir Temur Ave 42, Tashkent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-1">{t('bio')}</label>
          <div className="relative">
            <FileText className="w-4 h-4 text-dim absolute left-3 top-3" />
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-dim focus:outline-none focus:border-gold"
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
