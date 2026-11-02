'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buildAgenda, daySummary, isCancelled, type AgendaRow } from '@/domain/agenda';
import {
  addDays,
  dateKey,
  formatMinuteOfDay,
  minuteOfDay,
  parseDateKey,
  startOfTashkentDay,
  tashkentDate,
  weekdayOf,
} from '@/domain/time';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { formatDayMonth, formatDuration, formatMoney } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { SectionLabel } from '@/ui/section-label';
import { Select } from '@/ui/select';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList, TileRow } from '@/ui/tile-list';
import type { CalendarBookingDto, CalendarMasterDto } from './schemas';
import { useCalendarDay } from './use-calendar';

type AgendaBooking = CalendarBookingDto & { startMin: number; endMin: number };

function asAgendaBooking(booking: CalendarBookingDto): AgendaBooking {
  const startAt = new Date(booking.startAt);
  const startMin = minuteOfDay(startAt);
  const length = (new Date(booking.endAt).getTime() - startAt.getTime()) / 60_000;
  return { ...booking, startMin, endMin: startMin + length };
}

function BookingRow({
  shopId,
  row,
}: {
  shopId: string;
  row: Extract<AgendaRow<AgendaBooking>, { kind: 'booking' }>;
}) {
  const { t, locale } = useI18n();
  const { booking } = row;
  const services = booking.items.map((item) => item.name).join(', ');
  const status =
    t.agenda.statusShort[booking.status] || (booking.clientConfirmed ? t.agenda.clientComing : '');
  return (
    <TileRow
      className={`relative active:bg-porcelain-sunk ${booking.status === 'NO_SHOW' ? 'opacity-70' : ''}`}
      state={row.current ? 'current' : 'default'}
      lead={formatMinuteOfDay(row.startMin)}
      title={
        <Link
          href={`/staff/shop/${shopId}/calendar/${booking.id}`}
          className="after:absolute after:inset-0"
        >
          {booking.client.name}
        </Link>
      }
      detail={
        <>
          {status && (
            <span className={booking.status === 'PENDING' ? 'font-semibold text-enamel-text' : ''}>
              {status} ·{' '}
            </span>
          )}
          {services} · {formatDuration(row.endMin - row.startMin, locale)}
        </>
      }
      trail={formatMoney(booking.totalPrice, locale)}
    />
  );
}

function MasterDay({
  shopId,
  date,
  master,
  nowMin,
  showName,
}: {
  shopId: string;
  date: string;
  master: CalendarMasterDto;
  nowMin: number | null;
  showName: boolean;
}) {
  const { t, locale } = useI18n();
  const all = master.bookings.map(asAgendaBooking);
  const rows = buildAgenda(
    master.windows,
    all.filter((booking) => !isCancelled(booking.status)),
    nowMin,
  );
  const cancelled = all.filter((booking) => isCancelled(booking.status));
  return (
    <section className="mt-5">
      {showName && <SectionLabel className="mt-0">{master.name}</SectionLabel>}
      {rows.length === 0 ? (
        <p className="rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {master.windows.length === 0 ? t.agenda.notWorking : t.agenda.dayOver}
        </p>
      ) : (
        <TileList>
          {rows.map((row) =>
            row.kind === 'booking' ? (
              <BookingRow key={row.booking.id} shopId={shopId} row={row} />
            ) : (
              <TileRow
                key={`${row.kind}-${row.startMin}`}
                className={row.kind === 'free' ? 'relative active:bg-porcelain' : undefined}
                state={row.kind}
                lead={formatMinuteOfDay(row.startMin)}
                title={
                  row.kind === 'free' ? (
                    <Link
                      href={`/staff/shop/${shopId}/calendar/new?date=${date}&staff=${master.id}&start=${row.startMin}`}
                      className="after:absolute after:inset-0"
                    >
                      {t.agenda.free}
                    </Link>
                  ) : (
                    t.agenda.break
                  )
                }
                trail={
                  <span className="font-normal text-ink-muted">
                    {formatDuration(row.endMin - row.startMin, locale)}
                  </span>
                }
              />
            ),
          )}
        </TileList>
      )}
      {cancelled.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink-muted">
            {interpolate(t.agenda.cancelled, { count: cancelled.length })}
          </summary>
          <TileList>
            {cancelled.map((booking) => (
              <TileRow
                key={booking.id}
                className="relative active:bg-porcelain-sunk"
                state="free"
                lead={formatMinuteOfDay(booking.startMin)}
                title={
                  <Link
                    href={`/staff/shop/${shopId}/calendar/${booking.id}`}
                    className="after:absolute after:inset-0"
                  >
                    {booking.client.name}
                  </Link>
                }
                detail={booking.items.map((item) => item.name).join(', ')}
              />
            ))}
          </TileList>
        </details>
      )}
    </section>
  );
}

/** Which minute it is now in Tashkent; ticks so the "in the chair" mark moves on its own. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ALL = 'all';

/** /staff/shop/:id/calendar — one day per master, or the whole shop. */
export function CalendarScreen({ shopId, initialDate }: { shopId: string; initialDate?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const now = useNow();
  const today = dateKey(tashkentDate(now));
  const [date, setDate] = useState(() =>
    initialDate && parseDateKey(initialDate) ? initialDate : today,
  );
  const [masterId, setMasterId] = useState(ALL);
  const query = useCalendarDay(shopId, date);

  const selected = parseDateKey(date) ?? tashkentDate(now);
  const monday = addDays(selected, 1 - weekdayOf(selected));

  function pick(next: string) {
    haptic.selection();
    setDate(next);
    // Back from a booking returns to this day.
    window.history.replaceState(null, '', `?date=${next}`);
  }

  const masters = query.data?.masters ?? [];
  const shown = masterId === ALL ? masters : masters.filter((m) => m.id === masterId);
  const summary = daySummary(shown.flatMap((master) => master.bookings));
  const nowMin = date === today ? minuteOfDay(now) : null;

  useMainButton({
    text: t.agenda.add,
    onClick: () =>
      router.push(
        `/staff/shop/${shopId}/calendar/new?date=${date}${masterId === ALL ? '' : `&staff=${masterId}`}`,
      ),
  });

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-sign text-[30px] leading-none font-bold uppercase">
          {date === today ? t.calendar.today : formatDayMonth(startOfTashkentDay(selected), locale)}
        </h1>
        <p className="text-right text-xs text-ink-muted tabular-nums">
          {interpolate(t.agenda.summary, { count: summary.count })}
          <br />
          <span className="text-[13px] font-semibold text-ink">
            {formatMoney(summary.total, locale)}
          </span>
        </p>
      </div>

      <TileGroup label={t.agenda.pickDay} columns={7} className="mt-4">
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(monday, i);
          const key = dateKey(day);
          return (
            <Tile
              key={key}
              selected={key === date}
              className="px-0"
              aria-label={formatDayMonth(startOfTashkentDay(day), locale)}
              onClick={() => pick(key)}
            >
              <span className="text-xs leading-tight">{t.calendar.weekdaysShort[i]}</span>
              <span
                className={`text-sm leading-tight tabular-nums ${key === today ? 'font-bold underline' : 'font-semibold'}`}
              >
                {day.day}
              </span>
            </Tile>
          );
        })}
      </TileGroup>
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          aria-label={t.agenda.previousWeek}
          className="grid size-11 shrink-0 place-items-center rounded-tile text-ink-muted active:bg-porcelain-sunk"
          onClick={() => pick(dateKey(addDays(selected, -7)))}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        {date !== today && (
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-enamel-text"
            onClick={() => pick(today)}
          >
            {t.agenda.backToToday}
          </button>
        )}
        <button
          type="button"
          aria-label={t.agenda.nextWeek}
          className="grid size-11 shrink-0 place-items-center rounded-tile text-ink-muted active:bg-porcelain-sunk"
          onClick={() => pick(dateKey(addDays(selected, 7)))}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {masters.length > 1 && (
        <Select
          className="mt-3"
          label={t.agenda.master}
          options={[
            { value: ALL, label: t.agenda.allMasters },
            ...masters.map((master) => ({ value: master.id, label: master.name })),
          ]}
          value={masterId}
          onChange={(e) => setMasterId(e.target.value)}
        />
      )}

      {query.isPending && <ScreenLoading className="px-0 pt-5" />}
      {query.isError && (
        <LoadError className="mt-5" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {shown.map((master) => (
        <MasterDay
          key={master.id}
          shopId={shopId}
          master={master}
          date={date}
          nowMin={nowMin}
          showName={shown.length > 1}
        />
      ))}
    </main>
  );
}
