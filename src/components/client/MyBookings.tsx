'use client';

import React, { useState } from 'react';
import { BookingType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AlertCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatTashkentDate, formatTashkentTime, formatUZS } from '@/lib/dateUtils';

interface MyBookingsProps {
  bookings: BookingType[];
  onCancelBooking: (bookingId: string) => Promise<void>;
}

export function MyBookings({ bookings, onCancelBooking }: MyBookingsProps) {
  const { t } = useLanguage();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
    <div className="px-4 pt-4">
      <div className="text-xl font-extrabold tracking-tight text-white mb-3">{t('myBookings')}</div>

      <div className="cap mb-1">{t('upcomingAppts')}</div>

      {upcomingBookings.length === 0 ? (
        <div className="card text-center py-8 mt-1.5">
          <AlertCircle className="w-6 h-6 text-dim mx-auto mb-1.5" />
          <p className="text-xs text-muted font-medium">{t('noUpcoming')}</p>
        </div>
      ) : (
        upcomingBookings.map((b) => {
          const barberName = b.barber?.shopName || b.barber?.user?.fullName || '-';
          const initial = barberName.trim().charAt(0).toUpperCase();
          const serviceNames = b.services?.map((s) => s.service?.name).join(', ') || '-';
          const durMin = Math.round(
            (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 60000
          );

          return (
            <div key={b.id} className="card p-4 mt-2.5 border-gold/30">
              <div className="flex items-center justify-between">
                <span className="bg-gold/15 text-gold px-2.5 py-1 rounded-full text-[10px] font-extrabold">
                  {t('confirmed')}
                </span>
                <span className="text-xs text-muted">
                  {formatTashkentDate(b.startTime)} · {formatTashkentTime(b.startTime)}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-3">
                <div className="w-[42px] h-[42px] rounded-xl bg-gradient-to-br from-gold to-gold-600 flex items-center justify-center text-[17px] font-black text-gold-ink shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{barberName}</div>
                  <div className="text-[11px] text-muted truncate">
                    {serviceNames} · {durMin} daq
                  </div>
                  {b.barber?.address && (
                    <div className="text-[11px] text-dim truncate">📍 {b.barber.address}</div>
                  )}
                </div>
                <div className="text-sm font-extrabold text-gold shrink-0">{formatUZS(b.totalPrice)}</div>
              </div>

              <div className="h-px bg-line my-3" />
              <Button
                variant="danger"
                size="sm"
                fullWidth
                disabled={cancellingId === b.id}
                onClick={() => handleCancel(b.id)}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                {cancellingId === b.id ? t('saving') : t('cancelAction')}
              </Button>
            </div>
          );
        })
      )}

      {pastBookings.length > 0 && (
        <>
          <div className="cap mt-6 mb-1">{t('pastAppts')}</div>
          {pastBookings.map((b) => {
            const barberName = b.barber?.shopName || b.barber?.user?.fullName || '-';
            const serviceNames = b.services?.map((s) => s.service?.name).join(', ') || '-';
            const isDone = b.status === 'COMPLETED';
            return (
              <div key={b.id} className="flex gap-3 card p-3.5 mt-2 opacity-75">
                <div className="w-[54px] text-center shrink-0">
                  <div className="text-base font-extrabold text-muted">
                    {formatTashkentTime(b.startTime)}
                  </div>
                  <div className="text-[10px] text-dim">{formatTashkentDate(b.startTime)}</div>
                </div>
                <div className="w-px bg-line" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{barberName}</div>
                  <div className="text-[11px] text-muted truncate">{serviceNames}</div>
                </div>
                <span
                  className={`self-start px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                    isDone ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'
                  }`}
                >
                  {isDone ? t('completed') : t('cancelled')}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
