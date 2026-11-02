'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { formatMinuteOfDay } from '@/domain/time';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { useSession } from '@/features/auth/use-session';
import { PhoneCapture } from '@/features/profile/phone-capture';
import { useShopProfile } from '@/features/shop/use-shop-profile';
import { formatDayMonth, formatDuration, formatMoney, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import { Tick } from '@/ui/tick';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import type { BookingDto } from './schemas';
import { dateOf, SlotPicker } from './slot-picker';
import { useBookingOptions, useCreateBooking } from './use-book';

const ANY = 'any';

function bookError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details as { reason?: string; limit?: number } | undefined;
    switch (details?.reason) {
      case 'slot_taken':
      case 'slot_unavailable':
        return t.book.slotTaken;
      case 'too_many_bookings':
        return interpolate(t.book.tooMany, { limit: details.limit ?? 1 });
      case 'client_blocked':
        return t.book.blocked;
      case 'service_unavailable':
        return t.book.serviceGone;
      case 'phone_required':
        return t.book.phoneNeeded;
    }
  }
  return errorText(t, error);
}

function Booked({ booking, shopName }: { booking: BookingDto; shopName: string }) {
  const { t, locale } = useI18n();
  const start = new Date(booking.startAt);
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={shopName}>
        {formatDayMonth(start, locale)}, {formatTime(start)}
      </EnamelSign>
      <p role="status" className="mt-4 flex items-start gap-2 text-[15px] font-semibold">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        {booking.status === 'PENDING' ? t.book.pending : t.book.confirmed}
      </p>
      <TileList className="mt-4">
        {booking.items.map((item, index) => (
          <li key={index} className="flex items-center gap-3 bg-porcelain px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {typedText(item.name, locale)}
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
      <p className="mt-3 text-sm text-ink-muted">{t.book.payAtShop}</p>
      <Link
        href="/bookings"
        className="mt-2 flex min-h-11 items-center text-sm font-semibold text-enamel-text"
      >
        {t.myBookings.title}
      </Link>
    </main>
  );
}

/** /shop/:slug/book — services, master, day and time on one screen; the big button books. */
export function BookScreen({
  slug,
  initialService,
  initialStart,
}: {
  slug: string;
  initialService?: string;
  /** A time tapped on the shop page: today's, picked as soon as it's on offer. */
  initialStart?: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const profile = useShopProfile(slug);
  const session = useSession();
  const create = useCreateBooking(slug);
  const phoneRef = useRef<HTMLElement>(null);

  const [serviceIds, setServiceIds] = useState<string[]>(initialService ? [initialService] : []);
  const [chosenMaster, setChosenMaster] = useState(ANY);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const [wantedStart, setWantedStart] = useState(initialStart ?? null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [booked, setBooked] = useState<BookingDto | null>(null);

  const shop = profile.data;
  const chosen = (shop?.services ?? []).filter((service) => serviceIds.includes(service.id));
  // Only masters who do everything chosen; a choice that no longer fits falls back to "any".
  const masters = (shop?.masters ?? []).filter((master) =>
    chosen.every((service) => service.staffIds.includes(master.id)),
  );
  const master = masters.some((m) => m.id === chosenMaster) ? chosenMaster : ANY;
  const options = useBookingOptions(
    shop?.id,
    master,
    chosen.map((service) => service.id),
  );

  const days = options.data?.days ?? [];
  const firstOpen = days.find((day) => day.status === 'open');
  const dayKey = days.some((d) => d.date === chosenDay) ? chosenDay : (firstOpen?.date ?? null);
  const day = days.find((d) => d.date === dayKey);
  const isToday = dayKey !== null && dayKey === days[0]?.date;
  const start =
    day?.slots.find((slot) => slot.startMin === chosenStart) ??
    (isToday ? day?.slots.find((slot) => slot.startMin === wantedStart) : undefined);

  const phone = session.data?.user.phone ?? null;
  const duration = chosen.reduce((sum, service) => sum + service.durationMin, 0);
  const total = chosen.reduce((sum, service) => sum + service.price, 0);
  const anyFromPrice = chosen.some((service) => service.priceIsFrom);

  function toggleService(id: string) {
    haptic.selection();
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setChosenStart(null);
    create.reset();
  }

  function submit() {
    setSubmitted(true);
    if (!shop || !start) {
      haptic.notify('error');
      return;
    }
    if (!phone) {
      haptic.notify('error');
      phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    create.mutate(
      {
        shopId: shop.id,
        staffId: master,
        serviceIds: chosen.map((service) => service.id),
        startAt: start.startAt,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (booking) => {
          haptic.notify('success');
          setBooked(booking);
        },
        onError: () => {
          haptic.notify('error');
          // That time is gone: choose again from the refreshed list.
          setChosenStart(null);
          setWantedStart(null);
        },
      },
    );
  }

  useMainButton(
    booked
      ? { text: t.book.done, onClick: () => router.replace(`/shop/${slug}`) }
      : !shop || shop.isPreview
        ? null
        : {
            text: start
              ? interpolate(t.book.submitAt, { time: formatMinuteOfDay(start.startMin) })
              : t.book.submit,
            loading: create.isPending,
            onClick: submit,
          },
  );

  if (profile.isPending) {
    return <ScreenLoading />;
  }
  if (profile.isError || !shop) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        message={missing ? t.shopProfile.notFound : undefined}
        error={profile.error}
        onRetry={missing ? undefined : () => void profile.refetch()}
      />
    );
  }
  if (shop.isPreview) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.shopProfile.preview}</p>;
  }
  if (booked) {
    return <Booked booking={booked} shopName={typedText(shop.name, locale)} />;
  }

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <EnamelSign overline={t.book.title}>{typedText(shop.name, locale)}</EnamelSign>

      <section className="mt-5">
        <SectionLabel className="mt-0">{t.book.services}</SectionLabel>
        <TileList>
          {shop.services.map((service) => {
            const price = formatMoney(service.price, locale);
            return (
              <li key={service.id} className="bg-porcelain">
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 has-focus-visible:ring-2 has-focus-visible:ring-pick has-focus-visible:ring-inset">
                  <Tick
                    checked={serviceIds.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-tight font-semibold">
                      {typedText(service.name, locale)}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {formatDuration(service.durationMin, locale)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {service.priceIsFrom ? interpolate(t.services.fromPrice, { price }) : price}
                  </span>
                </label>
              </li>
            );
          })}
        </TileList>
        {submitted && chosen.length === 0 && (
          <p role="alert" className="mt-1.5 text-sm text-enamel-text">
            {t.agenda.pickService}
          </p>
        )}
      </section>

      {chosen.length > 0 && masters.length === 0 && (
        <p role="alert" className="mt-4 text-sm text-enamel-text">
          {t.book.noMaster}
        </p>
      )}

      {chosen.length > 0 && masters.length > 1 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.book.master}</SectionLabel>
          <TileGroup label={t.book.master} columns={masters.length === 3 ? 4 : 3}>
            {[{ id: ANY, name: t.book.anyMaster }, ...masters].map((option) => (
              <Tile
                key={option.id}
                selected={master === option.id}
                className="truncate text-sm font-semibold"
                onClick={() => {
                  haptic.selection();
                  setChosenMaster(option.id);
                  setChosenStart(null);
                }}
              >
                {option.id === ANY ? option.name : typedText(option.name, locale)}
              </Tile>
            ))}
          </TileGroup>
        </section>
      )}

      {chosen.length > 0 && masters.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.book.day}</SectionLabel>
          {options.isPending ? (
            <div aria-hidden className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-tile bg-porcelain-sunk motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : options.isError ? (
            <LoadError
              message={bookError(t, options.error)}
              onRetry={() => void options.refetch()}
            />
          ) : (
            <>
              <SlotPicker
                days={days}
                dayKey={dayKey}
                startMin={start?.startMin ?? null}
                missingTime={submitted && !start}
                onDay={(key) => {
                  setChosenDay(key);
                  setChosenStart(null);
                }}
                onStart={(minute) => {
                  setChosenStart(minute);
                  create.reset();
                }}
              />
            </>
          )}
        </section>
      )}

      {start && dayKey && (
        <>
          <section ref={phoneRef} className="mt-5">
            <SectionLabel className="mt-0">{t.profile.phoneTitle}</SectionLabel>
            {session.data && (
              <PhoneCapture phone={phone} phoneVerified={session.data.user.phoneVerified} />
            )}
            {submitted && !phone && (
              <p role="alert" className="mt-1.5 text-sm text-enamel-text">
                {t.book.phoneNeeded}
              </p>
            )}
          </section>
          <TextField
            className="mt-4"
            label={t.agenda.note}
            placeholder={t.agenda.clientOptional}
            value={note}
            maxLength={500}
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="mt-4 text-[15px] font-semibold">
            {formatDayMonth(dateOf(dayKey), locale)}, {formatMinuteOfDay(start.startMin)} ·{' '}
            {formatDuration(duration, locale)}
          </p>
          <p className="text-[15px] font-semibold tabular-nums">
            {anyFromPrice
              ? interpolate(t.services.fromPrice, { price: formatMoney(total, locale) })
              : formatMoney(total, locale)}
          </p>
        </>
      )}

      {create.error && (
        <p role="alert" className="mt-3 text-sm text-enamel-text">
          {bookError(t, create.error)}
        </p>
      )}
    </main>
  );
}
