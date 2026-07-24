'use client';

import React, { useState } from 'react';
import { BookingType, BookingStatus } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { formatTashkentDateTime, formatUZS } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, Phone, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface BookingManagerProps {
  bookings: BookingType[];
  onUpdateStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
}

const STATUS_PILL: Record<string, { cls: string; key: string }> = {
  CONFIRMED: { cls: 'bg-blue/15 text-blue', key: 'confirmed' },
  COMPLETED: { cls: 'bg-ok/15 text-ok', key: 'completed' },
  CANCELLED: { cls: 'bg-danger/15 text-danger', key: 'cancelled' },
  PENDING: { cls: 'bg-gold/15 text-gold', key: 'pending' },
};

export function BookingManager({ bookings, onUpdateStatus }: BookingManagerProps) {
  const { t } = useLanguage();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus === 'ALL') return true;
    return b.status === filterStatus;
  });

  return (
    <div>
      {/* Filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
        {['ALL', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
              filterStatus === st
                ? 'bg-gradient-to-br from-gold to-gold-600 text-gold-ink border-transparent'
                : 'bg-surface text-muted border-line'
            }`}
          >
            {st === 'ALL'
              ? t('all')
              : t(STATUS_PILL[st].key as any) || st}
          </button>
        ))}
      </div>

      {filteredBookings.length === 0 ? (
        <div className="card text-center py-8 mt-2">
          <CalendarIcon className="w-8 h-8 text-dim mx-auto mb-2" />
          <p className="text-xs text-muted font-medium">{t('noBookings')}</p>
        </div>
      ) : (
        filteredBookings.map((booking) => {
          const { dateStr, timeStr } = formatTashkentDateTime(booking.startTime);
          const serviceNames = booking.services?.map((s) => s.service?.name).join(', ') || '—';
          const durMin = Math.round(
            (new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000
          );
          const pill = STATUS_PILL[booking.status] || STATUS_PILL.PENDING;
          const isActive = booking.status === 'CONFIRMED';

          return (
            <div
              key={booking.id}
              className={`card p-3.5 mt-2.5 ${isActive ? 'border-gold/40' : ''}`}
            >
              <div className="flex gap-3">
                {/* Time column */}
                <div className="w-[54px] text-center shrink-0">
                  <div className="text-base font-extrabold text-gold">{timeStr}</div>
                  <div className="text-[10px] text-muted">{dateStr}</div>
                  <div className="text-[10px] text-dim mt-0.5">{durMin} daq</div>
                </div>
                <div className="w-px bg-line" />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-white truncate">
                      {booking.client?.fullName || 'Mijoz'}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${pill.cls}`}>
                      {t(pill.key as any)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5">
                    {serviceNames} · <span className="text-gold font-bold">{formatUZS(booking.totalPrice)}</span>
                  </div>
                  {booking.client?.phone && (
                    <a
                      href={`tel:${booking.client.phone}`}
                      className="text-[11px] text-blue flex items-center gap-1 mt-1"
                    >
                      <Phone className="w-3 h-3" /> {booking.client.phone}
                    </a>
                  )}
                </div>
              </div>

              {isActive && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onUpdateStatus(booking.id, 'COMPLETED')}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t('completeAction')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1"
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
  );
}
