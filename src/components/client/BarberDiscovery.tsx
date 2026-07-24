'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BarberProfileType, BookingType } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Search, MapPin, Scissors, RefreshCw } from 'lucide-react';
import { BarberBookingWizard } from './BarberBookingWizard';

const CARD_GRADIENTS = [
  'linear-gradient(135deg,#2b333f,#171d26)',
  'linear-gradient(135deg,#33313f,#181620)',
  'linear-gradient(135deg,#2b3a36,#141d1a)',
  'linear-gradient(135deg,#3a3129,#1d1712)',
];

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#e8c079,#c9973f)',
  'linear-gradient(135deg,#b98adf,#7c5ac0)',
  'linear-gradient(135deg,#79c9e8,#3f8fc9)',
  'linear-gradient(135deg,#e89a79,#c95e3f)',
];

function formatUZS(v: number) {
  return new Intl.NumberFormat('ru-RU').format(v);
}

export function BarberDiscovery({
  onBookingComplete,
}: {
  onBookingComplete: (booking: BookingType) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [barbers, setBarbers] = useState<BarberProfileType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBarber, setSelectedBarber] = useState<BarberProfileType | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    fetchBarbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const fetchBarbers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/barbers/search?query=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      if (data.success) setBarbers(data.barbers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (selectedBarber) {
    return (
      <div className="px-4 pt-3">
        <button
          onClick={() => setSelectedBarber(null)}
          className="text-sm font-bold text-gold mb-3 flex items-center gap-1"
        >
          ‹ {t('back')}
        </button>
        <BarberBookingWizard
          barber={selectedBarber}
          onBookingComplete={(booking) => {
            onBookingComplete(booking);
            setSelectedBarber(null);
          }}
        />
      </div>
    );
  }

  const firstName = user?.fullName?.split(' ')[0] || '';

  return (
    <div className="px-4 pt-4">
      {/* Greeting */}
      <div className="mb-4">
        {firstName && <div className="cap">Salom, {firstName} 👋</div>}
        <div className="text-xl font-extrabold tracking-tight text-white mt-0.5">
          {t('searchBarbers')}
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2.5 card-2 px-4 py-3">
        <Search className="w-4 h-4 text-dim shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent flex-1 text-sm text-white placeholder-dim outline-none"
          placeholder={t('searchPlaceholder')}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted">{t('loading')}</p>
        </div>
      ) : barbers.length === 0 ? (
        <div className="text-center py-12 card mt-4 space-y-3">
          <Scissors className="w-8 h-8 text-dim mx-auto" />
          <p className="text-xs text-muted">{t('noBarbersFound')}</p>
          <button
            onClick={fetchBarbers}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('refresh') || 'Yangilash'}
          </button>
        </div>
      ) : (
        barbers.map((barber, i) => {
          const displayName = barber.shopName || barber.user?.fullName || t('roleBarber');
          const initial = displayName.trim().charAt(0).toUpperCase();
          const services = barber.services || [];
          const minPrice = services.length
            ? Math.min(...services.map((s) => s.price))
            : null;

          return (
            <div
              key={barber.id}
              onClick={() => setSelectedBarber(barber)}
              className="card overflow-hidden mt-3.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              {/* Photo header */}
              <div
                className="h-[104px] relative flex items-end p-3"
                style={{ background: CARD_GRADIENTS[i % CARD_GRADIENTS.length] }}
              >
                <span className="absolute right-3.5 top-1.5 text-[52px] opacity-[0.07] select-none">✂</span>
                <div
                  className="w-[50px] h-[50px] rounded-2xl flex items-center justify-center text-xl font-black text-gold-ink border-2 border-white/15"
                  style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                >
                  {initial}
                </div>
              </div>

              {/* Body */}
              <div className="px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-white truncate">{displayName}</div>
                    {barber.address && (
                      <div className="text-xs text-muted flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 text-gold shrink-0" /> {barber.address}
                      </div>
                    )}
                  </div>
                  {minPrice !== null && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-dim">dan</div>
                      <div className="text-sm font-extrabold text-gold">{formatUZS(minPrice)}</div>
                    </div>
                  )}
                </div>

                {services.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2.5">
                    {services.slice(0, 3).map((s) => (
                      <span
                        key={s.id}
                        className="card-2 text-[11px] font-semibold text-muted px-2 py-1 !rounded-lg"
                      >
                        {s.name}
                      </span>
                    ))}
                    {services.length > 3 && (
                      <span className="card-2 text-[11px] font-semibold text-muted px-2 py-1 !rounded-lg">
                        +{services.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
