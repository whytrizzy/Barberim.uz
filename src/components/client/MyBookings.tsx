'use client';

import React, { useState } from 'react';
import { BookingType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Calendar, MapPin, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface MyBookingsProps {
  bookings: BookingType[];
  onCancelBooking: (bookingId: string) => Promise<void>;
}

export function MyBookings({ bookings, onCancelBooking }: MyBookingsProps) {
  const { t } = useLanguage();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('uz-UZ').format(val) + ' UZS';
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await onCancelBooking(id);
    } catch (err) {
      console.error(err);
    } finally {
      setCancellingId(null);
    }
  };

  const upcomingBookings = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING');
  const pastBookings = bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="border-b border-slate-800 pb-2.5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" /> {t('upcomingAppts')}
          </h3>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="text-center py-6 bg-slate-900/40 rounded-xl border border-slate-800">
            <AlertCircle className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-400 font-medium">{t('noUpcoming')}</p>
          </div>
        ) : (
          upcomingBookings.map((b) => {
            const startDate = new Date(b.startTime);
            const dateStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const serviceNames = b.services?.map((s) => s.service?.name).join(', ') || '-';
            const barberName = b.barber?.shopName || b.barber?.user?.fullName || '-';

            return (
              <div
                key={b.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-amber-500/20 text-amber-300 font-bold px-3 py-1 rounded-lg text-xs border border-amber-500/30">
                    {dateStr} @ {timeStr}
                  </span>
                  <Badge variant="success">{t('confirmed')}</Badge>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">{barberName}</h4>
                  {b.barber?.address && (
                    <p className="text-xs text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" /> {b.barber.address}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1 font-medium">{t('tabServices')}: {serviceNames}</p>
                  <p className="text-xs font-extrabold text-emerald-400 mt-1">{t('total')}: {formatPrice(b.totalPrice)}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <Button
                    variant="danger"
                    size="sm"
                    fullWidth
                    disabled={cancellingId === b.id}
                    onClick={() => handleCancel(b.id)}
                    className="text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    {cancellingId === b.id ? t('saving') : t('cancelAction')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pastBookings.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('pastAppts')}</h3>
          <div className="space-y-2">
            {pastBookings.map((b) => {
              const startDate = new Date(b.startTime);
              const dateStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
              return (
                <div key={b.id} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="font-semibold text-white">{dateStr}</span>
                    <span className="text-slate-400 block text-[11px]">{b.services?.map(s => s.service?.name).join(', ')}</span>
                  </div>
                  {b.status === 'COMPLETED' ? (
                    <Badge variant="gold">{t('completed')}</Badge>
                  ) : (
                    <Badge variant="danger">{t('cancelled')}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
