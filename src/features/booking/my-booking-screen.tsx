'use client';

import { Navigation } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { checkTransition } from '@/domain/booking';
import { yandexRouteLink } from '@/domain/places';
import { formatMinuteOfDay } from '@/domain/time';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { BookingReview } from '@/features/reviews/reviews-screens';
import { formatDayMonth, formatDuration, formatMoney, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { openExternal } from '@/telegram/links';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { TileList } from '@/ui/tile-list';
import { ClientDepositPanel } from '@/features/deposits/deposit-panel';
import { ClientLatePanel } from './client-late-panel';
import { repeatBookingPath } from './repeat';
import type { MyBookingDto } from './schemas';
import { SlotPicker } from './slot-picker';
import { useMoveOptions, useMyBooking, useMyBookingAction } from './use-my-bookings';

function actionError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'slot_taken' || reason === 'slot_unavailable') return t.book.slotTaken;
    if (reason === 'transition_refused' || reason === 'stale') return t.myBookings.changed;
    if (error.status === 404) return t.myBookings.cantMove;
  }
  return errorText(t, error);
}

function MovePanel({
  booking,
  onMoved,
  onClose,
}: {
  booking: MyBookingDto;
  onMoved: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const options = useMoveOptions(booking.id, true);
  const action = useMyBookingAction(booking.id);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const days = options.data?.days ?? [];
  const dayKey = days.some((d) => d.date === chosenDay)
    ? chosenDay
    : (days.find((d) => d.status === 'open')?.date ?? null);
  const slot = days
    .find((d) => d.date === dayKey)
    ?.slots.find((candidate) => candidate.startMin === chosenStart);

  useMainButton({
    text: slot
      ? interpolate(t.myBookings.moveTo, { time: formatMinuteOfDay(slot.startMin) })
      : t.myBookings.move,
    loading: action.isPending,
    onClick: () => {
      setSubmitted(true);
      if (!slot) {
        haptic.notify('error');
        return;
      }
      action.mutate(
        { action: 'reschedule', as: 'client', startAt: slot.startAt },
        {
          onSuccess: () => {
            haptic.notify('success');
            onMoved();
          },
          onError: () => {
            haptic.notify('error');
            setChosenStart(null);
          },
        },
      );
    },
  });

  return (
    <section className="mt-5">
      <SectionLabel className="mt-0">{t.myBookings.move}</SectionLabel>
      <p className="mb-3 text-sm text-ink-muted">
        {interpolate(t.myBookings.moveHint, { name: typedText(booking.masterName, locale) })}
      </p>
      {options.isPending && (
        <div aria-hidden className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-12 rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
            />
          ))}
        </div>
      )}
      {options.isError && (
        <LoadError message={actionError(t, options.error)} onRetry={() => void options.refetch()} />
      )}
      {options.isSuccess && (
        <SlotPicker
          days={days}
          dayKey={dayKey}
          startMin={slot?.startMin ?? null}
          missingTime={submitted && !slot}
          onDay={(key) => {
            setChosenDay(key);
            setChosenStart(null);
          }}
          onStart={(minute) => {
            setChosenStart(minute);
            action.reset();
          }}
        />
      )}
      {action.error && (
        <p role="alert" className="mt-2 text-sm text-enamel-text">
          {actionError(t, action.error)}
        </p>
      )}
      <Button variant="secondary" block className="mt-4" onClick={onClose}>
        {t.common.back}
      </Button>
    </section>
  );
}

/** Once a booking is over or cancelled, the useful next step is coming back. */
/** The same services with the same master, ready to pick a time. */
function BookAgainButton({ booking }: { booking: MyBookingDto }) {
  const { t } = useI18n();
  const router = useRouter();
  useMainButton({
    text: t.myBookings.again,
    onClick: () => router.push(repeatBookingPath(booking.shop.slug, booking)),
  });
  return null;
}

function Details({ booking }: { booking: MyBookingDto }) {
  const { t, locale } = useI18n();
  const action = useMyBookingAction(booking.id);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);

  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const now = new Date();
  const canMove = checkTransition('reschedule', 'client', { ...booking, startAt: start }, now).ok;
  const canCancel = checkTransition('cancel', 'client', { ...booking, startAt: start }, now).ok;
  const typed = (text: string) => typedText(text, locale);

  async function cancel() {
    if (!(await confirmAction(t.myBookings.cancelConfirm))) return;
    setMoved(false);
    action.mutate(
      { action: 'cancel', as: 'client' },
      {
        onSuccess: () => haptic.notify('success'),
        onError: () => haptic.notify('error'),
      },
    );
  }

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={typed(booking.shop.name)}>
        {formatDayMonth(start, locale)}, {formatTime(start)}
      </EnamelSign>
      <p className="mt-3 text-[15px] font-semibold">{t.myBookings.status[booking.status]}</p>
      <p className="text-sm text-ink-muted tabular-nums">
        {formatTime(start)}–{formatTime(end)} ·{' '}
        {formatDuration((end.getTime() - start.getTime()) / 60_000, locale)} ·{' '}
        {interpolate(t.agenda.withMaster, { name: typed(booking.masterName) })}
      </p>
      {!canMove && <BookAgainButton booking={booking} />}
      {moved && (
        <p role="status" className="mt-2 text-sm font-semibold text-success">
          {t.myBookings.moved}
        </p>
      )}
      {booking.peopleCount !== null && (
        <p className="text-sm text-ink-muted">
          {interpolate(t.agenda.people, { count: booking.peopleCount })}
        </p>
      )}
      {booking.depositAmount !== null && booking.status === 'PENDING' && (
        <p
          role="status"
          className="mt-3 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm"
        >
          {interpolate(t.book.depositNote, { amount: formatMoney(booking.depositAmount, locale) })}
        </p>
      )}
      {booking.deposit && (
        <ClientDepositPanel
          bookingId={booking.id}
          shopSlug={booking.shop.slug}
          deposit={booking.deposit}
        />
      )}
      <ClientLatePanel booking={booking} />

      <SectionLabel className="mt-5">{t.agenda.services}</SectionLabel>
      <TileList>
        {booking.items.map((item, index) => (
          <li key={index} className="flex items-center gap-3 bg-porcelain px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {typed(item.name)}
            </span>
            <span className="text-[13px] font-semibold tabular-nums">
              {formatMoney(item.price, locale)}
            </span>
          </li>
        ))}
      </TileList>
      <p className="mt-2 text-right text-[15px] font-semibold tabular-nums">
        {interpolate(t.agenda.total, { total: formatMoney(booking.totalPrice, locale) })}
      </p>

      <SectionLabel className="mt-5">{t.shop.address}</SectionLabel>
      <p className="text-[15px] font-semibold">{typed(booking.shop.address)}</p>
      {booking.shop.landmark && (
        <p className="text-sm text-ink-muted">
          {t.shop.landmark}: {typed(booking.shop.landmark)}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {booking.shop.location && (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => openExternal(yandexRouteLink(booking.shop.location!))}
          >
            <Navigation className="size-4" aria-hidden />
            {t.shopProfile.route}
          </Button>
        )}
        <Link
          href={`/shop/${booking.shop.slug}`}
          className="flex h-11 flex-1 items-center justify-center rounded-tile border border-chrome bg-porcelain text-[15px] font-semibold active:bg-porcelain-sunk"
        >
          {t.myBookings.shopPage}
        </Link>
      </div>
      {booking.status === 'COMPLETED' && <BookingReview bookingId={booking.id} />}

      {moving ? (
        <MovePanel
          booking={booking}
          onMoved={() => {
            setMoving(false);
            setMoved(true);
          }}
          onClose={() => setMoving(false)}
        />
      ) : (
        (canMove || canCancel) && (
          <div className="mt-5 grid gap-2">
            {canMove && (
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => {
                  action.reset();
                  setMoved(false);
                  setMoving(true);
                }}
              >
                {t.myBookings.move}
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" loading={action.isPending} onClick={() => void cancel()}>
                {t.myBookings.cancel}
              </Button>
            )}
          </div>
        )
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-sm text-enamel-text">
          {actionError(t, action.error)}
        </p>
      )}
    </main>
  );
}

/** /booking/:id — one of the person's own bookings. */
export function MyBookingScreen({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const query = useMyBooking(bookingId);
  if (query.isPending) {
    return <ScreenLoading />;
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        message={missing ? t.myBookings.notFound : undefined}
        error={query.error}
        onRetry={missing ? undefined : () => void query.refetch()}
      />
    );
  }
  return <Details booking={query.data} />;
}
