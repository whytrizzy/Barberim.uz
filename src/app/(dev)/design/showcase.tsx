'use client';

import { CalendarX2, MapPin, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/button';
import { EnamelSign } from '@/ui/enamel-sign';
import { SectionLabel } from '@/ui/section-label';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList, TileRow } from '@/ui/tile-list';
import { demoDays, demoMasters, demoService, demoShop, demoSlots, demoToday } from './demo-data';

type Theme = 'light' | 'dark' | 'system';

function setTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function DesignShowcase() {
  const [theme, setThemeState] = useState<Theme>('system');

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Design system preview · demo content</p>
        <TileGroup label="Theme" columns={3} className="w-56">
          {(['light', 'dark', 'system'] as const).map((value) => (
            <Tile
              key={value}
              selected={theme === value}
              onClick={() => {
                setTheme(value);
                setThemeState(value);
              }}
              className="min-h-9 text-sm font-medium capitalize"
            >
              {value}
            </Tile>
          ))}
        </TileGroup>
      </header>

      <div className="mt-8 flex flex-wrap items-start justify-center gap-10">
        <Screen caption="Client · choose a time">
          <ClientBooking />
        </Screen>
        <Screen caption="Barber · today">
          <BarberToday />
        </Screen>
        <Screen caption="States">
          <States />
        </Screen>
      </div>
    </div>
  );
}

function Screen({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-[390px]">
      <p className="mb-3 text-center text-xs text-ink-muted">{caption}</p>
      {children}
    </section>
  );
}

function ClientBooking() {
  const [master, setMaster] = useState('sardor');
  const [day, setDay] = useState('3');
  const [time, setTime] = useState<string | null>('11:20');

  return (
    <div className="flex min-h-[720px] flex-col">
      <EnamelSign overline="Sartaroshxona">{demoShop.name}</EnamelSign>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm text-ink-muted">
        <MapPin className="size-4 shrink-0" aria-hidden />
        {demoShop.address}
      </p>

      <SectionLabel>Usta</SectionLabel>
      <TileGroup label="Usta" columns={3}>
        {demoMasters.map((m) => (
          <Tile
            key={m.id}
            selected={master === m.id}
            onClick={() => setMaster(m.id)}
            className="gap-1.5 py-2.5 text-sm font-semibold"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-9 place-items-center rounded-full bg-chrome/60 text-sm font-bold',
                master === m.id && 'bg-white/15',
              )}
            >
              {m.name[0]}
            </span>
            {m.name}
          </Tile>
        ))}
      </TileGroup>

      <SectionLabel>Kun</SectionLabel>
      <TileGroup label="Kun" columns={6}>
        {demoDays.map((d) => (
          <Tile key={d.id} selected={day === d.id} onClick={() => setDay(d.id)} className="py-1.5">
            <span className={cn('text-[11px]', day === d.id ? 'opacity-75' : 'text-ink-muted')}>
              {d.weekday}
            </span>
            <span className="text-base font-bold tabular-nums">{d.day}</span>
          </Tile>
        ))}
      </TileGroup>

      <SectionLabel>Boʻsh vaqtlar</SectionLabel>
      <TileGroup label="Boʻsh vaqtlar" columns={4}>
        {demoSlots.map((s) => (
          <Tile
            key={s.time}
            tone="enamel"
            unavailable={s.taken}
            selected={time === s.time}
            onClick={() => setTime(s.time)}
            className="font-semibold tabular-nums"
          >
            {s.time}
          </Tile>
        ))}
      </TileGroup>

      <TileList className="mt-3">
        <TileRow
          lead={<span className="font-normal text-ink-muted">{demoService.minutes} daq</span>}
          title={demoService.name}
          trail={demoService.price}
        />
      </TileList>

      {/* Stand-in for Telegram's MainButton, which the real app drives natively. */}
      <div className="sticky bottom-0 mt-auto pt-4 pb-3">
        <Button size="lg" block disabled={!time}>
          {time ? `Yozilish · ${time}` : 'Vaqtni tanlang'}
        </Button>
      </div>
    </div>
  );
}

function BarberToday() {
  return (
    <div className="flex min-h-[720px] flex-col">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-sign text-[34px] leading-none font-bold uppercase">
          {demoToday.title}
        </h1>
        <p className="text-right text-[13px] text-ink-muted">
          {demoToday.date}
          <br />
          <span className="tabular-nums">{demoToday.summary}</span>
        </p>
      </div>

      <TileList className="mt-4">
        {demoToday.rows.map((row) => (
          <TileRow
            key={row.time}
            lead={row.time}
            title={row.title}
            detail={'detail' in row ? row.detail : undefined}
            state={'state' in row ? row.state : 'default'}
            trail={
              'state' in row && row.state === 'free' ? (
                <span className="text-enamel-text">{row.trail}</span>
              ) : (
                'trail' in row && row.trail
              )
            }
          />
        ))}
      </TileList>

      <div className="sticky bottom-0 mt-auto pt-4 pb-3">
        <Button size="lg" block>
          <Plus className="size-5" aria-hidden />
          Navbatsiz mijoz
        </Button>
      </div>
    </div>
  );
}

function States() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <SectionLabel as="h3" className="mt-0">
          Tugmalar
        </SectionLabel>
        <Button block>Yozilish</Button>
        <Button block variant="secondary">
          Boshqa vaqt
        </Button>
        <Button block variant="ghost">
          Bekor qilish
        </Button>
        <Button block loading>
          Saqlanmoqda
        </Button>
        <Button block disabled>
          Vaqtni tanlang
        </Button>
      </div>

      <div>
        <SectionLabel as="h3" className="mt-0">
          Boʻsh holat
        </SectionLabel>
        <div className="grid justify-items-center gap-3 rounded-tile border border-chrome bg-porcelain px-6 py-8 text-center">
          <CalendarX2 className="size-8 text-ink-muted" aria-hidden />
          <div>
            <p className="font-semibold">Bu kunga boʻsh vaqt qolmadi</p>
            <p className="mt-1 text-sm text-ink-muted">
              Boshqa kunni tanlang yoki boʻsh joy chiqsa xabar olish uchun navbatga yoziling.
            </p>
          </div>
          <Button variant="secondary">Navbatga yozilish</Button>
        </div>
      </div>
    </div>
  );
}
