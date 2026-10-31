'use client';

import { UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isCancelled, nextFreeStart } from '@/domain/agenda';
import { formatNationalDigits, formatUzPhone, nationalDigits } from '@/domain/phone';
import {
  dateKey,
  minuteOfDay,
  parseDateKey,
  startOfTashkentDay,
  tashkentDate,
} from '@/domain/time';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { useSession } from '@/features/auth/use-session';
import type { ClientMatch } from '@/features/booking/schemas';
import { TimeField } from '@/features/schedule/day-hours';
import { useShopServices } from '@/features/services/use-services';
import { formatDuration, formatMoney } from '@/i18n/format';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { SectionLabel } from '@/ui/section-label';
import { Select } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { Tick } from '@/ui/tick';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import { useAddBooking, useClientSearch } from './use-add-booking';
import { useCalendarDay } from './use-calendar';

function addError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'slot_taken') return t.agenda.slotTaken;
    if (reason === 'service_unavailable') return t.agenda.serviceGone;
    if (reason === 'phone_invalid') return t.profile.phoneInvalid;
  }
  return errorText(t, error);
}

type Source = 'WALK_IN' | 'PHONE';

/** /staff/shop/:id/calendar/new — a walk-in needs just a service; a phone booking a bit more. */
export function AddBookingScreen({
  shopId,
  initialDate,
  initialStaffId,
  initialStart,
}: {
  shopId: string;
  initialDate?: string;
  initialStaffId?: string;
  initialStart?: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const session = useSession();
  const services = useShopServices(shopId);
  const add = useAddBooking(shopId);

  const now = new Date();
  const today = dateKey(tashkentDate(now));
  const startDate = initialDate && parseDateKey(initialDate) ? initialDate : today;
  const [source, setSource] = useState<Source>(startDate === today ? 'WALK_IN' : 'PHONE');
  const [date, setDate] = useState(startDate);
  const [chosenMaster, setChosenMaster] = useState(initialStaffId ?? '');
  // Null until someone picks a time: it follows the master's next free moment.
  const [picked, setPicked] = useState<number | null>(
    initialStart !== undefined && Number.isInteger(initialStart) ? initialStart : null,
  );
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [known, setKnown] = useState<ClientMatch | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const day = useCalendarDay(shopId, date);
  const matches = useClientSearch(shopId, known ? '' : phone.length >= 2 ? phone : name);

  // Whoever the calendar lets this person see and who can take clients: for a master, only them.
  const offered = new Set(services.data?.masters.map((master) => master.id));
  const masters = (day.data?.masters ?? []).filter((master) => offered.has(master.id));
  const mine = session.data?.memberships.find((m) => m.shop.id === shopId)?.staffId;
  const masterId =
    (masters.some((m) => m.id === chosenMaster) && chosenMaster) ||
    (masters.some((m) => m.id === mine) && mine) ||
    masters[0]?.id ||
    '';
  const master = masters.find((m) => m.id === masterId);

  const available = (services.data?.services ?? []).filter((s) => s.staffIds.includes(masterId));
  const chosen = available.filter((service) => serviceIds.includes(service.id));
  const duration = chosen.reduce((sum, service) => sum + service.durationMin, 0);
  const total = chosen.reduce((sum, service) => sum + service.price, 0);

  const busy = (master?.bookings ?? [])
    .filter((booking) => !isCancelled(booking.status))
    .map((booking) => {
      const start = new Date(booking.startAt);
      const startMin = minuteOfDay(start);
      return {
        startMin,
        endMin: startMin + (new Date(booking.endAt).getTime() - start.getTime()) / 60_000,
      };
    });
  const earliest = date === today ? minuteOfDay(now) : (master?.windows[0]?.startMin ?? 9 * 60);
  const startMin = picked ?? nextFreeStart(busy, earliest, duration || 5);

  const trimmedName = name.trim();
  const fullPhone = phone ? `+998${phone}` : undefined;
  const nameOk = Boolean(known) || source === 'WALK_IN' || trimmedName.length > 0;
  const phoneOk = phone.length === 0 || phone.length === 9;

  function submit() {
    setSubmitted(true);
    const when = parseDateKey(date);
    if (!when || chosen.length === 0 || !nameOk || !phoneOk) {
      haptic.notify('error');
      return;
    }
    add.mutate(
      {
        staffId: masterId,
        serviceIds: chosen.map((service) => service.id),
        startAt: new Date(startOfTashkentDay(when).getTime() + startMin * 60_000).toISOString(),
        source,
        client: known
          ? { shopClientId: known.id }
          : { name: trimmedName || t.agenda.walkInName, phone: fullPhone },
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          haptic.notify('success');
          // Land on the day it was added to, which may not be the one the calendar was showing.
          if (date === startDate) router.back();
          else router.replace(`/staff/shop/${shopId}/calendar?date=${date}`);
        },
        onError: () => haptic.notify('error'),
      },
    );
  }

  useMainButton({ text: t.agenda.addSubmit, loading: add.isPending, onClick: submit });

  if (services.isPending || day.isPending) {
    return <p className="px-4 pt-6 text-sm text-ink-muted">{t.common.loading}</p>;
  }
  if (services.isError || day.isError) {
    return (
      <p role="alert" className="px-4 pt-6 text-sm text-enamel-text">
        {errorText(t, services.error ?? day.error)}
      </p>
    );
  }

  const suggestions = known ? [] : (matches.data?.clients ?? []);
  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="mb-5 font-sign text-[30px] leading-none font-bold uppercase">
        {t.agenda.addTitle}
      </h1>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TileGroup label={t.agenda.addTitle} columns={3} className="grid-cols-2">
          {(
            [
              ['WALK_IN', t.agenda.sources.WALK_IN],
              ['PHONE', t.agenda.sources.PHONE],
            ] as const
          ).map(([value, label]) => (
            <Tile
              key={value}
              selected={source === value}
              className="text-sm font-semibold"
              onClick={() => {
                haptic.selection();
                setSource(value);
              }}
            >
              {label}
            </Tile>
          ))}
        </TileGroup>

        {masters.length > 1 && (
          <Select
            label={t.agenda.master}
            options={masters.map((m) => ({ value: m.id, label: m.name }))}
            value={masterId}
            onChange={(e) => {
              setChosenMaster(e.target.value);
              setServiceIds([]);
            }}
          />
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t.agenda.services}</legend>
          {available.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.agenda.noServices}</p>
          ) : (
            <TileList>
              {available.map((service) => {
                const checked = serviceIds.includes(service.id);
                return (
                  <li key={service.id} className="bg-porcelain">
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 has-focus-visible:ring-2 has-focus-visible:ring-pick has-focus-visible:ring-inset">
                      <Tick
                        checked={checked}
                        onChange={() => {
                          haptic.selection();
                          setServiceIds((ids) =>
                            checked
                              ? ids.filter((serviceId) => serviceId !== service.id)
                              : [...ids, service.id],
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-tight font-semibold">
                          {service.name}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {formatDuration(service.durationMin, locale)}
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums">
                        {formatMoney(service.price, locale)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </TileList>
          )}
          {submitted && chosen.length === 0 && (
            <p role="alert" className="mt-1.5 text-sm text-enamel-text">
              {t.agenda.pickService}
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t.agenda.moveDate}
            type="date"
            value={date}
            onChange={(e) => {
              if (!parseDateKey(e.target.value)) return;
              setDate(e.target.value);
              setPicked(null);
            }}
          />
          <TimeField label={t.agenda.moveTime} minutes={startMin} onChange={setPicked} />
        </div>

        <SectionLabel className="mt-2 mb-0">{t.agenda.client}</SectionLabel>
        {known ? (
          <div className="flex items-center gap-3 rounded-tile border border-chrome bg-porcelain px-3 py-2">
            <UserRound className="size-5 shrink-0 text-ink-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{known.name}</span>
              {known.phone && (
                <span className="block text-xs text-ink-muted tabular-nums">
                  {formatUzPhone(known.phone)}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={t.agenda.clientClear}
              className="grid size-11 shrink-0 place-items-center rounded-tile text-ink-muted active:bg-porcelain-sunk"
              onClick={() => setKnown(null)}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <TextField
              label={t.agenda.clientName}
              placeholder={source === 'WALK_IN' ? t.agenda.clientOptional : undefined}
              value={name}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              error={submitted && !nameOk ? t.agenda.clientNameRequired : null}
            />
            <TextField
              label={t.profile.phoneLabel}
              prefix="+998"
              inputMode="tel"
              autoComplete="off"
              placeholder={source === 'WALK_IN' ? t.agenda.clientOptional : undefined}
              value={formatNationalDigits(phone)}
              onChange={(e) => setPhone(nationalDigits(e.target.value))}
              error={submitted && !phoneOk ? t.profile.phoneInvalid : null}
            />
            {suggestions.length > 0 && (
              <TileList>
                {suggestions.map((client) => (
                  <li key={client.id} className="bg-porcelain">
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-porcelain-sunk"
                      onClick={() => {
                        haptic.selection();
                        setKnown(client);
                      }}
                    >
                      <UserRound className="size-5 shrink-0 text-ink-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">
                          {client.name}
                        </span>
                        {client.phone && (
                          <span className="block text-xs text-ink-muted tabular-nums">
                            {formatUzPhone(client.phone)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </TileList>
            )}
          </>
        )}

        <TextField
          label={t.agenda.note}
          placeholder={t.agenda.clientOptional}
          value={note}
          maxLength={500}
          autoComplete="off"
          onChange={(e) => setNote(e.target.value)}
        />

        {chosen.length > 0 && (
          <p className="text-right text-[15px] font-semibold tabular-nums">
            {formatDuration(duration, locale)} · {formatMoney(total, locale)}
          </p>
        )}
        {add.error && (
          <p role="alert" className="text-sm text-enamel-text">
            {addError(t, add.error)}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </main>
  );
}
