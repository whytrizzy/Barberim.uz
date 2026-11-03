'use client';

import { Clock } from 'lucide-react';
import { useState } from 'react';
import { canSayLate, CLIENT_LATE_OPTIONS } from '@/domain/notices';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Button } from '@/ui/button';
import { MinutePicker } from './minute-picker';
import type { MyBookingDto } from './schemas';
import { noticeError, useBookingNotice } from './use-notice';

/** On the client's own booking, on the day: what the shop said, and "I'm running late". */
export function ClientLatePanel({ booking }: { booking: MyBookingDto }) {
  const { t } = useI18n();
  const notice = useBookingNotice(booking.id, [['my-bookings']]);
  const [picking, setPicking] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const late = canSayLate(
    { status: booking.status, startAt: new Date(booking.startAt) },
    new Date(),
  );

  return (
    <>
      {booking.shopDelayMin !== null && late && (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm font-semibold"
        >
          <Clock className="size-4 shrink-0 text-enamel-text" aria-hidden />
          {interpolate(t.notices.shopDelay, { minutes: booking.shopDelayMin })}
        </p>
      )}
      {late && (
        <div className="mt-3 grid gap-2">
          {picking ? (
            <MinutePicker
              label={t.notices.latePick}
              options={CLIENT_LATE_OPTIONS}
              disabled={notice.isPending}
              onPick={(minutes) => {
                setSent(null);
                notice.mutate(
                  { kind: 'client_late', minutes: minutes as (typeof CLIENT_LATE_OPTIONS)[number] },
                  {
                    onSuccess: () => {
                      haptic.notify('success');
                      setPicking(false);
                      setSent(interpolate(t.notices.lateSent, { minutes }));
                    },
                    onError: () => haptic.notify('error'),
                  },
                );
              }}
            />
          ) : (
            <Button
              variant="secondary"
              aria-expanded={false}
              onClick={() => {
                haptic.selection();
                setPicking(true);
              }}
            >
              <Clock className="size-4" aria-hidden />
              {t.notices.imLate}
            </Button>
          )}
          {sent && (
            <p role="status" className="text-sm font-semibold text-success">
              {sent}
            </p>
          )}
          {notice.error && (
            <p role="alert" className="text-sm text-enamel-text">
              {noticeError(t, notice.error)}
            </p>
          )}
        </div>
      )}
    </>
  );
}
