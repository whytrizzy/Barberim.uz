'use client';

import React, { useState } from 'react';
import { BookingType, BookingStatus } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Calendar as CalendarIcon, User, Phone, Clock, CheckCircle2, XCircle, Banknote } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface BookingManagerProps {
  bookings: BookingType[];
  onUpdateStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
}

export function BookingManager({ bookings, onUpdateStatus }: BookingManagerProps) {
  const { t } = useLanguage();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus === 'ALL') return true;
    return b.status === filterStatus;
  });

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('uz-UZ').format(val) + ' UZS';
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dateStr, timeStr };
  };

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">{t('confirmed')}</Badge>;
      case 'COMPLETED':
        return <Badge variant="gold">{t('completed')}</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">{t('cancelled')}</Badge>;
      default:
        return <Badge variant="warning">{t('pending')}</Badge>;
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-400" /> {t('bookingManagement')}
          </h3>
          <p className="text-xs text-slate-400">{t('bookingDesc')}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              filterStatus === st
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {st === 'ALL' ? t('all') : st}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredBookings.length === 0 ? (
          <div className="text-center py-8 bg-slate-900/40 rounded-xl border border-slate-800">
            <CalendarIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">{t('noBookings')}</p>
          </div>
        ) : (
          filteredBookings.map((booking) => {
            const { dateStr, timeStr } = formatDateTime(booking.startTime);
            const serviceNames = booking.services?.map((s) => s.service?.name).join(', ') || 'Haircut Service';

            return (
              <div
                key={booking.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 space-y-3 transition-all"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500/15 text-amber-300 font-bold px-2.5 py-1 rounded-lg text-xs border border-amber-500/20">
                      {dateStr}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-white">
                      <Clock className="w-3.5 h-3.5 text-amber-400" /> {timeStr}
                    </span>
                  </div>
                  {getStatusBadge(booking.status)}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400" /> {booking.client?.fullName || 'Client'}
                    </h4>
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5" /> {formatPrice(booking.totalPrice)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-sky-400" />{' '}
                    <a href={`tel:${booking.client?.phone}`} className="hover:underline text-sky-300">
                      {booking.client?.phone || 'No Phone'}
                    </a>
                  </p>

                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 mt-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                      {t('tabServices')}
                    </span>
                    <p className="text-xs text-amber-200 font-medium mt-0.5">{serviceNames}</p>
                  </div>
                </div>

                {booking.status === 'CONFIRMED' && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => onUpdateStatus(booking.id, 'COMPLETED')}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t('completeAction')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => onUpdateStatus(booking.id, 'CANCELLED')}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> {t('cancelAction')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
