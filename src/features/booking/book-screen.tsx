'use client';

import { CircleCheck, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { addDays, dateKey, formatMinuteOfDay, tashkentDate } from '@/domain/time';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { useSession } from '@/features/auth/use-session';
import { PhoneCapture } from '@/features/profile/phone-capture';
import type { ShopProfileDto } from '@/features/shop/schemas';
import { useShopProfile } from '@/features/shop/use-shop-profile';
import { WaitlistPanel } from '@/features/waitlist/waitlist-panel';
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
/** Days in the strip at once (the server's BOOKING_DAYS). */
const BOOKING_STRIP_DAYS = 14;

const stepper =
  'grid min-h-12 place-items-center bg-porcelain text-ink active:bg-porcelain-sunk disabled:text-ink-faint focus-visible:ring-2 focus-visible:ring-pick focus-visible:ring-inset';

type ChosenService = ShopProfileDto['services'][number];

/** What the chosen wedding packages add up to (the server works it out the same way). */
function packageTerms(chosen: ChosenService[]) {
  const packages = chosen.filter((service) => service.category === 'WEDDING');
  const values = (pick: (s: ChosenService) => number | null) =>
    packages.map(pick).filter((v): v is number => v !== null);
  const people = values((s) => s.maxPeople);
  const ahead = values((s) => s.bookAheadDays);
  const deposit = values((s) => s.depositAmount);
  return {
    maxPeople: people.length ? Math.min(...people) : null,
    bookAheadDays: ahead.length ? Math.max(...ahead) : null,
    depositAmount: deposit.length ? deposit.reduce((sum, v) => sum + v, 0) : null,
  };
}

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
      case 'too_many_people':
        return interpolate(t.book.tooManyPeople, { limit: details.limit ?? 1 });
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
      {booking.depositAmount !== null && booking.status === 'PENDING' && (
        <p className="mt-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm">
          {interpolate(t.book.depositNote, { amount: formatMoney(booking.depositAmount, locale) })}
        </p>
      )}
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
      <p className="mt-3 text-sm text-ink-muted">
        {booking.depositAmount !== null ? t.book.restAtShop : t.book.payAtShop}
      </p>
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
  initialServices = [],
  initialMaster,
  initialDate,
  initialStart,
}: {
  slug: string;
  initialServices?: string[];
  /** Booking the same again: their master, if they still do the services. */
  initialMaster?: string;
  /** "2026-11-03": the day a waitlist message was about. */
  initialDate?: string;
  /** A time tapped on the shop page: today's, picked as soon as it's on offer. */
  initialStart?: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const profile = useShopProfile(slug);
  const session = useSession();
  const create = useCreateBooking(slug);
  const phoneRef = useRef<HTMLElement>(null);

  const [serviceIds, setServiceIds] = useState<string[]>(initialServices);
  const [chosenMaster, setChosenMaster] = useState(initialMaster ?? ANY);
  const [chosenDay, setChosenDay] = useState<string | null>(initialDate ?? null);
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const [wantedStart, setWantedStart] = useState(initialStart ?? null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [booked, setBooked] = useState<BookingDto | null>(null);
  const [people, setPeople] = useState(1);
  /** A wedding planned ahead: the strip of days starts here instead of today. */
  const [from, setFrom] = useState<string | null>(null);

  const shop = profile.data;
  const chosen = (shop?.services ?? []).filter((service) => serviceIds.includes(service.id));
  // Only masters who do everything chosen; a choice that no longer fits falls back to "any".
  const masters = (shop?.masters ?? []).filter((master) =>
    chosen.every((service) => service.staffIds.includes(master.id)),
  );
  const master = masters.some((m) => m.id === chosenMaster) ? chosenMaster : ANY;
  const terms = packageTerms(chosen);
  const today = dateKey(tashkentDate(new Date()));
  const options = useBookingOptions(
    shop?.id,
    master,
    chosen.map((service) => service.id),
    terms.bookAheadDays ? from : null,
  );

  const days = options.data?.days ?? [];
  const firstOpen = days.find((day) => day.status === 'open');
  const dayKey = days.some((d) => d.date === chosenDay) ? chosenDay : (firstOpen?.date ?? null);
  const day = days.find((d) => d.date === dayKey);
  const isToday = dayKey === today;
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
        ...(terms.maxPeople !== null && { peopleCount: Math.min(people, terms.maxPeople) }),
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
      : !shop || shop.isPreview || day?.status === 'full'
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

      {terms.maxPeople !== null && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.book.people}</SectionLabel>
          <div className="flex items-center gap-3">
            <div className="grid w-40 shrink-0 grid-cols-3 gap-px overflow-hidden rounded-tile border border-chrome bg-chrome">
              <button
                type="button"
                aria-label={`${t.book.people} −`}
                disabled={people <= 1}
                className={stepper}
                onClick={() => {
                  haptic.selection();
                  setPeople((n) => Math.max(1, n - 1));
                }}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <output
                aria-live="polite"
                className="flex min-h-12 items-center justify-center bg-porcelain text-[17px] font-semibold tabular-nums"
              >
                {Math.min(people, terms.maxPeople)}
              </output>
              <button
                type="button"
                aria-label={`${t.book.people} +`}
                disabled={people >= terms.maxPeople}
                className={stepper}
                onClick={() => {
                  haptic.selection();
                  setPeople((n) => Math.min(terms.maxPeople ?? 1, n + 1));
                }}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <p className="min-w-0 flex-1 text-sm text-ink-muted">
              {interpolate(t.book.peopleHint, { max: terms.maxPeople })}
            </p>
          </div>
        </section>
      )}

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
          {terms.bookAheadDays !== null && terms.bookAheadDays > BOOKING_STRIP_DAYS && (
            <TextField
              className="mb-3"
              label={t.book.otherDate}
              type="date"
              min={today}
              max={dateKey(addDays(tashkentDate(new Date()), terms.bookAheadDays - 1))}
              value={from ?? today}
              onChange={(e) => {
                const picked = e.target.value || null;
                setFrom(picked);
                setChosenDay(picked);
                setChosenStart(null);
              }}
            />
          )}
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
                allowFull
                onDay={(key) => {
                  setChosenDay(key);
                  setChosenStart(null);
                }}
                onStart={(minute) => {
                  setChosenStart(minute);
                  create.reset();
                }}
              />
              {day?.status === 'full' && (
                <WaitlistPanel
                  shopId={shop.id}
                  date={day.date}
                  staffId={master === ANY ? null : master}
                  serviceIds={chosen.map((service) => service.id)}
                />
              )}
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
          {terms.depositAmount !== null && (
            <p className="mt-2 rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-sm">
              {interpolate(t.book.depositNote, {
                amount: formatMoney(terms.depositAmount, locale),
              })}
            </p>
          )}
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
