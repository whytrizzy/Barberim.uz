'use client';

import { BellRing, Clock } from 'lucide-react';
import { useState } from 'react';
import { canSayLate, canSayNextUp, SHOP_DELAY_OPTIONS } from '@/domain/notices';
import { MinutePicker } from '@/features/booking/minute-picker';
import { noticeError, useBookingNotice } from '@/features/booking/use-notice';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import type { BookingDetailDto } from './schemas';

/** On a booking today: tell the client it's their turn, or that the master is running late. */
export function ShopNoticePanel({
  shopId,
  booking,
}: {
  shopId: string;
  booking: BookingDetailDto;
}) {
  const { t } = useI18n();
  const notice = useBookingNotice(booking.id, [
    ['booking', booking.id],
    ['calendar', shopId],
  ]);
  const [picking, setPicking] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const visit = { status: booking.status, startAt: new Date(booking.startAt) };
  const now = new Date();
  const nextUp = canSayNextUp(visit, now);
  const late = canSayLate(visit, now);
  if (!nextUp && !late) return null;

  const send = (body: Parameters<typeof notice.mutate>[0], done: string) => {
    setSent(null);
    notice.mutate(body, {
      onSuccess: () => {
        haptic.notify('success');
        setPicking(false);
        setSent(done);
      },
      onError: () => haptic.notify('error'),
    });
  };

  return (
    <section className="mt-5">
      <SectionLabel className="mt-0">{t.notices.title}</SectionLabel>
      <div className="grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
        {!booking.client.canMessage && (
          <p className="text-sm text-ink-muted">{t.notices.noTelegram}</p>
        )}
        <div className="grid gap-2">
          {nextUp && (
            <Button
              variant="secondary"
              disabled={!booking.client.canMessage || notice.isPending}
              onClick={() => send({ kind: 'next_up' }, t.notices.nextUpSent)}
            >
              <BellRing className="size-4" aria-hidden />
              {t.notices.nextUp}
            </Button>
          )}
          {late && (
            <Button
              variant="secondary"
              aria-expanded={picking}
              disabled={!booking.client.canMessage || notice.isPending}
              onClick={() => {
                haptic.selection();
                setPicking(!picking);
              }}
            >
              <Clock className="size-4" aria-hidden />
              {t.notices.weAreLate}
            </Button>
          )}
        </div>
        {picking && (
          <MinutePicker
            label={t.notices.delayPick}
            options={SHOP_DELAY_OPTIONS}
            disabled={notice.isPending}
            onPick={(minutes) =>
              send(
                { kind: 'shop_delay', minutes: minutes as (typeof SHOP_DELAY_OPTIONS)[number] },
                interpolate(t.notices.delaySent, { minutes }),
              )
            }
          />
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
    </section>
  );
}
