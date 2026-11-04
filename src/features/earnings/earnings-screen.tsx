'use client';

import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { EARNINGS_PERIODS, periodRange, type EarningsPeriod } from '@/domain/earnings';
import { addDays, dateKey, parseDateKey, startOfTashkentDay, tashkentDate } from '@/domain/time';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { formatDayMonth, formatMoney, formatWeekday } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { typedText } from '@/i18n/places';
import { useI18n } from '@/i18n/provider';
import type { Locale } from '@/i18n/locales';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import { ColumnChart, type Column } from './column-chart';
import type { EarningsDto } from './schemas';
import { useEarnings } from './use-earnings';

/** Hours the day chart always spans, widened to any hour that had a visit. */
const DAY_HOURS = { from: 9, to: 21 };

/** "250 ming", "1,3 mln": short enough for an axis. */
function compact(t: Messages, value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} ${t.earnings.million}`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)} ${t.earnings.thousand}`;
  return String(value);
}

const day = (key: string) => {
  const date = parseDateKey(key);
  return date ? startOfTashkentDay(date) : new Date();
};

function periodTitle(
  t: Messages,
  locale: Locale,
  period: EarningsPeriod,
  from: string,
  days: number,
) {
  const first = day(from);
  if (period === 'day') return `${formatWeekday(first, locale)}, ${formatDayMonth(first, locale)}`;
  if (period === 'month') {
    const date = parseDateKey(from)!;
    return `${t.earnings.monthNames[date.month - 1]} ${date.year}`;
  }
  const last = day(dateKey(addDays(parseDateKey(from)!, days - 1)));
  return `${formatDayMonth(first, locale)} – ${formatDayMonth(last, locale)}`;
}

function columnsOf(t: Messages, locale: Locale, data: EarningsDto, today: string): Column[] {
  const money = (value: number) => formatMoney(value, locale);
  if (data.period === 'day') {
    const used = data.series.filter((s) => s.revenue > 0).map((s) => Number(s.key));
    const from = Math.min(DAY_HOURS.from, ...used);
    const to = Math.max(DAY_HOURS.to, ...used);
    return data.series.slice(from, to + 1).map((s) => ({
      key: s.key,
      tick: Number(s.key) % 3 === 0 ? s.key : '',
      value: s.revenue,
      readout: `${s.key.padStart(2, '0')}:00 · ${money(s.revenue)}`,
    }));
  }
  return data.series.map((s) => {
    const date = day(s.key);
    const dayNumber = parseDateKey(s.key)?.day ?? 0;
    return {
      key: s.key,
      tick:
        data.period === 'week'
          ? formatWeekday(date, locale, true)
          : dayNumber === 1 || dayNumber % 5 === 0
            ? String(dayNumber)
            : '',
      value: s.revenue,
      readout: `${formatWeekday(date, locale)}, ${formatDayMonth(date, locale)} · ${money(s.revenue)}`,
      current: s.key === today,
    };
  });
}

function Delta({ data }: { data: EarningsDto }) {
  const { t } = useI18n();
  const versus = t.earnings.vsPrevious[data.period];
  if (data.previousRevenue === 0) {
    return <p className="text-sm text-ink-muted">{t.earnings.noPrevious}</p>;
  }
  const change = Math.round(((data.revenue - data.previousRevenue) / data.previousRevenue) * 100);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-1 text-sm">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${up ? 'text-success' : 'text-enamel-text'}`}
      >
        <Icon className="size-4" aria-hidden />
        {up ? '+' : '−'}
        {Math.abs(change)}%
      </span>
      <span className="text-ink-muted">{versus}</span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-porcelain px-2 py-2.5 text-center">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** /staff/shop/:id/earnings */
export function EarningsScreen({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const today = dateKey(tashkentDate(new Date()));
  const [period, setPeriod] = useState<EarningsPeriod>('week');
  const [anchor, setAnchor] = useState(today);
  const query = useEarnings(shopId, period, anchor);
  // Numbers to read; no next step.
  useMainButton(null);

  const range = periodRange(period, parseDateKey(anchor)!);
  const isCurrent = dateKey(periodRange(period, parseDateKey(today)!).from) === dateKey(range.from);
  const step = (direction: -1 | 1) => {
    haptic.selection();
    // The day before this period, or the day after it: periodRange snaps it to its period.
    const target = direction < 0 ? addDays(range.from, -1) : addDays(range.from, range.days);
    setAnchor(dateKey(target));
  };

  if (query.isPending) return <ScreenLoading />;
  if (query.isError) {
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const data = query.data;
  const money = (value: number) => formatMoney(value, locale);
  const topMaster = Math.max(...data.byMaster.map((m) => m.revenue), 1);
  const busiest = Math.max(...data.busyHours.map((h) => h.bookings), 1);

  return (
    <main
      className={`mx-auto max-w-[390px] px-4 pt-4 pb-6 ${query.isPlaceholderData ? 'opacity-60' : ''}`}
    >
      <h1 className="font-sign text-[30px] leading-none font-bold uppercase">{t.earnings.title}</h1>
      {data.onlyMine && <p className="mt-1 text-sm text-ink-muted">{t.earnings.onlyMine}</p>}

      <TileGroup label={t.earnings.title} columns={3} className="mt-4">
        {EARNINGS_PERIODS.map((value) => (
          <Tile
            key={value}
            selected={period === value}
            className="text-sm font-semibold"
            onClick={() => {
              haptic.selection();
              setPeriod(value);
              setAnchor(today);
            }}
          >
            {t.earnings.periods[value]}
          </Tile>
        ))}
      </TileGroup>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="secondary"
          className="px-3"
          aria-label={t.earnings.previous}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">
          {periodTitle(t, locale, data.period, data.from, data.days)}
        </p>
        <Button
          variant="secondary"
          className="px-3"
          aria-label={t.earnings.next}
          disabled={isCurrent}
          onClick={() => step(1)}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </div>

      <section className="mt-5">
        <p className="font-sign text-[40px] leading-none font-bold tabular-nums">
          {money(data.revenue)}
        </p>
        <div className="mt-1.5">
          <Delta data={data} />
        </div>
      </section>

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-tile border border-chrome bg-chrome">
        <Stat label={t.earnings.visits} value={String(data.visits)} />
        <Stat
          label={t.earnings.averageTicket}
          value={data.averageTicket === null ? '—' : compact(t, data.averageTicket)}
        />
        <Stat
          label={t.earnings.noShowRate}
          value={data.noShowRate === null ? '—' : `${Math.round(data.noShowRate * 100)}%`}
        />
      </dl>
      {data.expected > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          {interpolate(t.earnings.expected, { amount: money(data.expected) })}
        </p>
      )}
      {data.cancelled > 0 && (
        <p className="text-sm text-ink-muted">
          {interpolate(t.earnings.cancelled, { count: data.cancelled })}
        </p>
      )}

      <SectionLabel className="mt-5">
        {data.period === 'day' ? t.earnings.byHour : t.earnings.byDay}
      </SectionLabel>
      <ColumnChart
        key={`${data.period}-${data.from}`}
        label={data.period === 'day' ? t.earnings.byHour : t.earnings.byDay}
        columns={columnsOf(t, locale, data, today)}
        formatValue={(value) => compact(t, value)}
      />

      {data.visits === 0 && (
        <p className="mt-3 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {t.earnings.empty}
        </p>
      )}

      {!data.onlyMine && data.byMaster.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.earnings.masters}</SectionLabel>
          <TileList>
            {data.byMaster.map((master) => (
              <li key={master.staffId} className="grid gap-1.5 bg-porcelain px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold">
                    {typedText(master.name, locale)}
                  </span>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                    {money(master.revenue)}
                  </span>
                </div>
                {/* A meter on its own track: share of the best master's income. */}
                <span
                  aria-hidden
                  className="block h-1.5 overflow-hidden rounded-full bg-porcelain-sunk"
                >
                  <span
                    className="block h-full rounded-full bg-ink"
                    style={{ width: `${(master.revenue / topMaster) * 100}%` }}
                  />
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  {interpolate(t.earnings.timesCount, { count: master.visits })}
                  {master.noShows > 0 &&
                    ` · ${interpolate(t.earnings.noShowsCount, { count: master.noShows })}`}
                </span>
              </li>
            ))}
          </TileList>
        </section>
      )}

      {data.topServices.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.earnings.topServices}</SectionLabel>
          <TileList>
            {data.topServices.map((service) => (
              <li key={service.name} className="flex items-center gap-3 bg-porcelain px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {typedText(service.name, locale)}
                  </span>
                  <span className="block text-xs text-ink-muted tabular-nums">
                    {interpolate(t.earnings.timesCount, { count: service.count })}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {money(service.revenue)}
                </span>
              </li>
            ))}
          </TileList>
        </section>
      )}

      {data.period !== 'day' && data.busyHours.length > 0 && (
        <section className="mt-5">
          <SectionLabel className="mt-0">{t.earnings.busyHours}</SectionLabel>
          <TileList>
            {data.busyHours.map((slot) => (
              <li key={slot.hour} className="flex items-center gap-3 bg-porcelain px-3 py-2">
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                  {String(slot.hour).padStart(2, '0')}:00
                </span>
                <span
                  aria-hidden
                  className="block h-1.5 flex-1 overflow-hidden rounded-full bg-porcelain-sunk"
                >
                  <span
                    className={`block h-full rounded-full ${slot.bookings === busiest ? 'bg-enamel-text' : 'bg-ink'}`}
                    style={{ width: `${(slot.bookings / busiest) * 100}%` }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-ink-muted tabular-nums">
                  {interpolate(t.earnings.bookingsCount, { count: slot.bookings })}
                </span>
              </li>
            ))}
          </TileList>
        </section>
      )}

      <p className="mt-5 text-xs text-ink-muted">{t.earnings.note}</p>
    </main>
  );
}
