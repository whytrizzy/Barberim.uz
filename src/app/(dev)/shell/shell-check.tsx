'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatUzPhone } from '@/domain/phone';
import { fromTashkent } from '@/domain/time';
import { useSession } from '@/features/auth/use-session';
import { PhoneCapture } from '@/features/profile/phone-capture';
import { LanguagePicker } from '@/features/settings/language-picker';
import {
  formatDayMonth,
  formatDuration,
  formatMoney,
  formatTime,
  formatWeekday,
} from '@/i18n/format';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { useTelegram } from '@/telegram/provider';
import { useMainButton } from '@/telegram/use-main-button';
import { SectionLabel } from '@/ui/section-label';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList, TileRow } from '@/ui/tile-list';

export function ShellCheck() {
  const { mode, webApp, colorScheme, user, startParam } = useTelegram();
  const [presses, setPresses] = useState(0);
  const [loading, setLoading] = useState(false);

  useMainButton({
    text: presses ? `Bosildi: ${presses}` : 'Asosiy tugma',
    loading,
    onClick: () => {
      haptic.notify('success');
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        setPresses((n) => n + 1);
      }, 800);
    },
  });

  const { locale, t, setLocale } = useI18n();
  const sample = fromTashkent(2026, 11, 3, 14, 0);
  const samples: [string, string][] = [
    ['Money', formatMoney(250000, locale)],
    ['Date', `${formatWeekday(sample, locale)}, ${formatDayMonth(sample, locale)}`],
    ['Time', `${formatTime(sample)} · ${formatDuration(80, locale)}`],
    ['Phone', formatUzPhone('+998901234567')],
    ['Text', `${t.calendar.today} · ${t.common.continue} · ${t.common.loading}`],
  ];

  const rows: [string, string][] = [
    ['Mode', mode],
    ['Platform', webApp?.platform ?? '—'],
    ['Version', webApp?.version ?? '—'],
    ['Theme', colorScheme],
    ['User', user ? `${user.first_name} · ${user.id} · ${user.language_code ?? '?'}` : '—'],
    ['Start param', startParam ?? '—'],
  ];

  const session = useSession();
  const sessionRows: [string, string][] = session.data
    ? [
        ['Account', `${session.data.user.firstName} · ${session.data.user.id.slice(0, 8)}…`],
        ['Saved locale', session.data.user.locale],
        [
          'Works at',
          session.data.memberships.map((m) => `${m.shop.name} (${m.role})`).join(', ') || '—',
        ],
      ]
    : [['Status', session.isError ? `error: ${String(session.error)}` : 'loading…']];

  return (
    <main className="mx-auto max-w-[390px] px-4 pt-4 pb-6">
      <h1 className="font-sign text-[34px] leading-none font-bold uppercase">Shell</h1>
      <p className="mt-1 text-sm text-ink-muted">Telegram integration check · development only</p>

      <SectionLabel>Til · Locale</SectionLabel>
      <LanguagePicker value={locale} onChange={setLocale} label="Til" />
      <TileList className="mt-2">
        {samples.map(([label, value]) => (
          <TileRow
            key={label}
            lead={<span className="text-xs font-normal text-ink-muted">{label}</span>}
            title={value}
          />
        ))}
      </TileList>

      <SectionLabel>Session · server-verified</SectionLabel>
      <TileList>
        {sessionRows.map(([label, value]) => (
          <TileRow
            key={label}
            lead={<span className="text-xs font-normal text-ink-muted">{label}</span>}
            title={value}
          />
        ))}
      </TileList>

      <SectionLabel>{t.profile.phoneTitle}</SectionLabel>
      {session.data ? (
        <PhoneCapture
          key={session.data.user.phone ?? 'none'}
          phone={session.data.user.phone}
          phoneVerified={session.data.user.phoneVerified}
        />
      ) : (
        <p className="text-sm text-ink-muted">{t.common.loading}</p>
      )}

      <SectionLabel>Holat</SectionLabel>
      <TileList>
        {rows.map(([label, value]) => (
          <TileRow
            key={label}
            lead={<span className="text-xs font-normal text-ink-muted">{label}</span>}
            title={value}
          />
        ))}
      </TileList>

      <SectionLabel>Haptics</SectionLabel>
      <TileGroup label="Haptics" columns={3}>
        <Tile onClick={() => haptic.selection()} className="text-sm">
          Selection
        </Tile>
        <Tile onClick={() => haptic.impact('medium')} className="text-sm">
          Impact
        </Tile>
        <Tile onClick={() => haptic.notify('error')} className="text-sm">
          Error
        </Tile>
      </TileGroup>

      <SectionLabel>Navigatsiya</SectionLabel>
      <Link
        href="/shell/inner"
        className="block rounded-tile border border-chrome bg-porcelain px-4 py-3 font-semibold"
      >
        Ichki sahifaga oʻtish →
      </Link>
      <p className="mt-2 text-sm text-ink-muted">
        Ichki sahifada Telegram’ning “Orqaga” tugmasi chiqishi kerak.
      </p>
    </main>
  );
}
