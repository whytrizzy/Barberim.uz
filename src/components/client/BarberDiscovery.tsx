'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BarberProfileType, BookingType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Search, MapPin, Phone, Scissors, Star, RefreshCw } from 'lucide-react';
import { BarberBookingWizard } from './BarberBookingWizard';
import { Button } from '../ui/Button';

interface BarberDiscoveryProps {
  onBookingComplete: (booking: BookingType) => void;
}

export function BarberDiscovery({ onBookingComplete }: BarberDiscoveryProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [barbers, setBarbers] = useState<BarberProfileType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBarber, setSelectedBarber] = useState<BarberProfileType | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    fetchBarbers();
  }, [debouncedQuery]);

  const fetchBarbers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/barbers/search?query=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      if (data.success) {
        setBarbers(data.barbers || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (selectedBarber) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelectedBarber(null)}
          className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 mb-2"
        >
          ← {t('back')}
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

  return (
    <div className="space-y-4">
      {/* Real-time Search Box */}
      <div className="glass-card-gold rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-amber-400" /> {t('searchBarbers')}
        </h3>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            placeholder={t('searchPlaceholder')}
          />
        </div>
      </div>

      {/* Barbers List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">{t('loading')}</p>
          </div>
        ) : barbers.length === 0 ? (
          <div className="text-center py-8 bg-slate-900/40 rounded-xl border border-slate-800 space-y-3">
            <Scissors className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">{t('noBarbersFound')}</p>
            <button
              onClick={fetchBarbers}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('refresh') || 'Yangilash'}
            </button>
          </div>
        ) : (
          barbers.map((barber) => {
            const displayName = barber.shopName || barber.user?.fullName || t('roleBarber');
            const serviceCount = barber.services?.length || 0;

            return (
              <div
                key={barber.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-3 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-extrabold text-lg shrink-0">
                      ✂️
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {displayName}
                      </h4>
                      {barber.address && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {barber.address}
                        </p>
                      )}
                    </div>
                  </div>
                  {serviceCount > 0 && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      <Scissors className="w-3 h-3" /> {serviceCount}
                    </span>
                  )}
                </div>

                {barber.bio && (
                  <p className="text-xs text-slate-300 line-clamp-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
                    {barber.bio}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  {barber.user?.phone ? (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-sky-400" /> {barber.user.phone}
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedBarber(barber)}
                  >
                    {t('bookCut')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
