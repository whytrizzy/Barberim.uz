'use client';

import { Phone } from 'lucide-react';
import { useState } from 'react';
import { isCancelled, staffActions } from '@/domain/agenda';
import {
  dateKey,
  formatMinuteOfDay,
  minuteOfDay,
  parseDateKey,
  startOfTashkentDay,
  tashkentDate,
} from '@/domain/time';
import { formatUzPhone } from '@/domain/phone';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { TimeField } from '@/features/schedule/day-hours';
import { formatDayMonth, formatDuration, formatMoney, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import { TileList } from '@/ui/tile-list';
import type { BookingDetailDto } from './schemas';
import { useBookingAction, useBookingDetail } from './use-calendar';

function actionError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'slot_taken') return t.agenda.slotTaken;
    if (reason === 'stale' || reason === 'transition_refused') return t.agenda.changedMeanwhile;
  }
  return errorText(t, error);
}

function BookingDetails({ shopId, booking }: { shopId: string; booking: BookingDetailDto }) {
  const { t, locale } = useI18n();
  const action = useBookingAction(shopId, booking.id);
  const startAt = new Date(booking.startAt);
  const endAt = new Date(booking.endAt);
  const actions = staffActions({ status: booking.status, startAt }, new Date());
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(() => dateKey(tashkentDate(startAt)));
  const [moveMinute, setMoveMinute] = useState(() => minuteOfDay(startAt));

  const run = (body: Parameters<typeof action.mutate>[0], onDone?: () => void) =>
    action.mutate(body, {
      onSuccess: () => {
        haptic.notify('success');
        onDone?.();
      },
      onError: () => haptic.notify('error'),
    });

  async function cancel() {
    if (await confirmAction(t.agenda.cancelConfirm)) run({ action: 'cancel', as: 'staff' });
  }

  function move() {
    const date = parseDateKey(moveDate);
    if (!date) return;
    const start = new Date(startOfTashkentDay(date).getTime() + moveMinute * 60_000);
    run({ action: 'reschedule', as: 'staff', startAt: start.toISOString() }, () =>
      setMoving(false),
    );
  }

  // The step most likely next goes on Telegram's big button.
  const main = actions.includes('confirm')
    ? { text: t.agenda.confirm, body: { action: 'confirm', as: 'staff' } as const }
    : actions.includes('complete')
      ? { text: t.agenda.complete, body: { action: 'complete', as: 'staff' } as const }
      : null;
  useMainButton(
    main && !moving
      ? { text: main.text, loading: action.isPending, onClick: () => run(main.body) }
      : null,
  );

  const date = formatDayMonth(startAt, locale);
  const length = (endAt.getTime() - startAt.getTime()) / 60_000;
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.agenda.statusFull[booking.status]}>{formatTime(startAt)}</EnamelSign>
      <p className="mt-3 text-[15px] font-semibold">
        {date}, {formatTime(startAt)}–{formatTime(endAt)} · {formatDuration(length, locale)}
      </p>
      <p className="text-sm text-ink-muted">
        {interpolate(t.agenda.withMaster, { name: booking.masterName })} ·{' '}
        {t.agenda.sources[booking.source]}
      </p>
      {booking.clientConfirmed && (
        <p className="mt-1 text-sm font-semibold text-success">{t.agenda.clientComingFull}</p>
      )}

      <SectionLabel className="mt-5">{t.agenda.client}</SectionLabel>
      <div className="flex items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{booking.client.name}</span>
          <span className="block text-xs text-ink-muted tabular-nums">
            {interpolate(t.agenda.history, {
              visits: booking.client.visitCount,
              noShows: booking.client.noShowCount,
            })}
          </span>
        </span>
        {booking.client.phone && (
          <a
            href={`tel:${booking.client.phone}`}
            className="flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-enamel-text tabular-nums"
          >
            <Phone className="size-4" aria-hidden />
            {formatUzPhone(booking.client.phone)}
          </a>
        )}
      </div>

      <SectionLabel className="mt-5">{t.agenda.services}</SectionLabel>
      <TileList>
        {booking.items.map((item, index) => (
          <li
            key={index}
            className="flex items-center gap-3 bg-porcelain px-3 py-2.5 text-[15px] font-semibold"
          >
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="text-[13px] tabular-nums">{formatMoney(item.price, locale)}</span>
          </li>
        ))}
      </TileList>
      <p className="mt-2 text-right text-[15px] font-semibold tabular-nums">
        {interpolate(t.agenda.total, { total: formatMoney(booking.totalPrice, locale) })}
      </p>

      {booking.note && (
        <>
          <SectionLabel className="mt-5">{t.agenda.note}</SectionLabel>
          <p className="text-[15px] whitespace-pre-wrap">{booking.note}</p>
        </>
      )}
      {isCancelled(booking.status) && booking.cancelReason && (
        <p className="mt-4 text-sm text-ink-muted">{booking.cancelReason}</p>
      )}

      {moving && (
        <section className="mt-5 grid gap-3 rounded-tile border border-chrome bg-porcelain p-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t.agenda.moveDate}
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
            />
            <TimeField label={t.agenda.moveTime} minutes={moveMinute} onChange={setMoveMinute} />
          </div>
          <p className="text-sm text-ink-muted">
            {interpolate(t.agenda.moveHint, { time: formatMinuteOfDay(moveMinute) })}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" loading={action.isPending} onClick={move}>
              {t.common.save}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setMoving(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </section>
      )}

      {action.error && (
        <p role="alert" className="mt-3 text-sm text-enamel-text">
          {actionError(t, action.error)}
        </p>
      )}

      {!moving && (
        <div className="mt-5 grid gap-2">
          {actions.includes('no_show') && (
            <Button
              variant="secondary"
              disabled={action.isPending}
              onClick={() => run({ action: 'no_show', as: 'staff' })}
            >
              {t.agenda.noShow}
            </Button>
          )}
          {actions.includes('reschedule') && (
            <Button
              variant="secondary"
              disabled={action.isPending}
              onClick={() => {
                action.reset();
                setMoving(true);
              }}
            >
              {t.agenda.move}
            </Button>
          )}
          {actions.includes('cancel') && (
            <Button variant="ghost" disabled={action.isPending} onClick={() => void cancel()}>
              {t.agenda.cancel}
            </Button>
          )}
        </div>
      )}
    </main>
  );
}

/** /staff/shop/:id/calendar/:bookingId */
export function BookingScreen({ shopId, bookingId }: { shopId: string; bookingId: string }) {
  const { t } = useI18n();
  const query = useBookingDetail(shopId, bookingId);
  if (query.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {errorText(t, query.error)}
      </p>
    );
  }
  return <BookingDetails shopId={shopId} booking={query.data} />;
}
