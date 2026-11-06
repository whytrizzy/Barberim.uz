'use client';

import { Ban, ChevronRight, Phone, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatUzPhone } from '@/domain/phone';
import { LoadError, ScreenLoading } from '@/features/api/load-states';
import { errorText, isPlanLimit } from '@/features/api/error-text';
import { ProLock } from '@/features/plans/pro-lock';
import { useDebounced } from '@/features/shop/use-shop';
import { formatDayMonth, formatMoney, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { confirmAction } from '@/telegram/confirm';
import { haptic } from '@/telegram/haptics';
import { useMainButton } from '@/telegram/use-main-button';
import { Button } from '@/ui/button';
import { SectionLabel } from '@/ui/section-label';
import { TextField } from '@/ui/text-field';
import { Tile, TileGroup } from '@/ui/tile-group';
import { TileList } from '@/ui/tile-list';
import {
  CLIENT_FILTERS,
  type ClientDetailDto,
  type ClientFilter,
  type ClientRowDto,
} from './schemas';
import { useClient, useClientList, useUpdateClient } from './use-clients';

const screen = 'mx-auto max-w-[390px] px-4 pt-4 pb-6';
const title = 'font-sign text-[30px] leading-none font-bold uppercase';

/** "5 visits · last 12 Oct" under a client's name. */
function ClientFacts({ client }: { client: ClientRowDto }) {
  const { t, locale } = useI18n();
  return (
    <span className="block truncate text-xs text-ink-muted">
      {client.visitCount === 0
        ? t.clients.noVisits
        : interpolate(t.clients.visits, { count: client.visitCount })}
      {client.lastVisitAt &&
        ` · ${interpolate(t.clients.lastVisit, { date: formatDayMonth(new Date(client.lastVisitAt), locale) })}`}
    </span>
  );
}

function Badges({ client }: { client: ClientRowDto }) {
  const { t } = useI18n();
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      {client.isBlocked && (
        <span className="rounded-[4px] bg-enamel px-1.5 py-0.5 text-[11px] font-bold text-on-enamel">
          {t.clients.blockedBadge}
        </span>
      )}
      {client.noShowCount > 0 && (
        <span className="text-xs font-semibold text-warning tabular-nums">
          {interpolate(t.clients.noShows, { count: client.noShowCount })}
        </span>
      )}
    </span>
  );
}

/** /staff/shop/:id/clients */
export function ClientsScreen({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const q = useDebounced(text.trim(), 300);
  const list = useClientList(shopId, q.length >= 2 ? q : '', filter);
  // A list to look through; no single next step.
  useMainButton(null);

  const clients = list.data?.pages.flatMap((page) => page.clients) ?? [];
  return (
    <main className={screen}>
      <h1 className={`${title} mb-4`}>{t.clients.title}</h1>
      <TextField
        label={t.clients.search}
        type="search"
        prefix={<Search className="size-4" aria-hidden />}
        value={text}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
      <TileGroup label={t.clients.title} columns={4} className="mt-3">
        {CLIENT_FILTERS.map((value) => (
          <Tile
            key={value}
            selected={filter === value}
            className="px-1 text-[13px] leading-tight font-semibold"
            onClick={() => {
              haptic.selection();
              setFilter(value);
            }}
          >
            {t.clients.filters[value]}
          </Tile>
        ))}
      </TileGroup>

      {list.isPending ? (
        <div aria-hidden className="mt-4 grid gap-px">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 bg-porcelain-sunk motion-safe:animate-pulse" />
          ))}
        </div>
      ) : list.isError ? (
        isPlanLimit(list.error) ? (
          <ProLock className="mt-4" shopId={shopId} feature="clients" />
        ) : (
          <LoadError className="mt-4" error={list.error} onRetry={() => void list.refetch()} />
        )
      ) : clients.length === 0 ? (
        <p className="mt-4 rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {q || filter !== 'all' ? t.clients.emptyFiltered : t.clients.empty}
        </p>
      ) : (
        <>
          <TileList className="mt-4">
            {clients.map((client) => (
              <li key={client.id} className="bg-porcelain">
                <Link
                  href={`/staff/shop/${shopId}/clients/${client.id}`}
                  className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-porcelain-sunk"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-tight font-semibold">
                      {client.name}
                    </span>
                    {client.phone && (
                      <span className="block text-xs text-ink-muted tabular-nums">
                        {formatUzPhone(client.phone)}
                      </span>
                    )}
                    <ClientFacts client={client} />
                  </span>
                  <Badges client={client} />
                  <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </TileList>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {t.clients.more}
            </Button>
          )}
        </>
      )}
    </main>
  );
}

function NotesForm({ shopId, client }: { shopId: string; client: ClientDetailDto }) {
  const { t } = useI18n();
  const update = useUpdateClient(shopId, client.id);
  const [notes, setNotes] = useState(client.notes ?? '');
  const [saved, setSaved] = useState(false);
  const changed = notes.trim() !== (client.notes ?? '');
  return (
    <section className="mt-5">
      <label htmlFor="client-notes" className="mb-1.5 block text-sm font-semibold">
        {t.clients.notes}
      </label>
      <textarea
        id="client-notes"
        rows={3}
        maxLength={1000}
        value={notes}
        placeholder={t.clients.notesPlaceholder}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        className="block w-full resize-y rounded-tile border border-chrome bg-porcelain px-3 py-2.5 text-base outline-none placeholder:text-ink-muted focus:border-enamel focus:ring-2 focus:ring-enamel/25"
      />
      <p className="mt-1.5 text-sm text-ink-muted">{t.clients.notesHint}</p>
      {(changed || saved) && (
        <div className="mt-2 flex items-center gap-3">
          {changed && (
            <Button
              variant="secondary"
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { notes: notes.trim() },
                  {
                    onSuccess: () => {
                      haptic.notify('success');
                      setSaved(true);
                    },
                    onError: () => haptic.notify('error'),
                  },
                )
              }
            >
              {t.clients.saveNotes}
            </Button>
          )}
          {saved && !changed && (
            <p role="status" className="text-sm font-semibold text-success">
              {t.clients.notesSaved}
            </p>
          )}
        </div>
      )}
      {update.error && (
        <p role="alert" className="mt-2 text-sm text-enamel-text">
          {errorText(t, update.error)}
        </p>
      )}
    </section>
  );
}

function Blacklist({ shopId, client }: { shopId: string; client: ClientDetailDto }) {
  const { t } = useI18n();
  const update = useUpdateClient(shopId, client.id);
  async function toggle() {
    if (!client.isBlocked) {
      const ok = await confirmAction(interpolate(t.clients.blockConfirm, { name: client.name }));
      if (!ok) return;
    }
    update.mutate(
      { isBlocked: !client.isBlocked },
      {
        onSuccess: () => haptic.notify('success'),
        onError: () => haptic.notify('error'),
      },
    );
  }
  return (
    <section className="mt-6">
      <Button
        variant={client.isBlocked ? 'secondary' : 'ghost'}
        className={cn('justify-self-start px-2', !client.isBlocked && 'text-enamel-text')}
        loading={update.isPending}
        onClick={() => void toggle()}
      >
        {!update.isPending && <Ban className="size-4" aria-hidden />}
        {client.isBlocked ? t.clients.unblock : t.clients.block}
      </Button>
      {update.error && (
        <p role="alert" className="mt-2 text-sm text-enamel-text">
          {errorText(t, update.error)}
        </p>
      )}
    </section>
  );
}

/** /staff/shop/:id/clients/:clientId */
export function ClientScreen({ shopId, clientId }: { shopId: string; clientId: string }) {
  const { t, locale } = useI18n();
  const query = useClient(shopId, clientId);
  useMainButton(null);

  if (query.isPending) return <ScreenLoading />;
  if (query.isError) {
    if (isPlanLimit(query.error)) {
      return (
        <main className={screen}>
          <ProLock shopId={shopId} feature="clients" />
        </main>
      );
    }
    return (
      <LoadError
        className="mx-auto max-w-[390px] px-4 pt-6"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const client = query.data;
  return (
    <main className={screen}>
      <h1 className={title}>{client.name}</h1>
      {client.phone ? (
        <a
          href={`tel:${client.phone}`}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-enamel-text tabular-nums"
        >
          <Phone className="size-4" aria-hidden />
          {formatUzPhone(client.phone)}
        </a>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">{t.clients.noPhone}</p>
      )}
      {!client.hasTelegram && <p className="text-sm text-ink-muted">{t.clients.noTelegram}</p>}
      {client.isBlocked && (
        <p
          role="status"
          className="mt-3 rounded-tile border border-enamel bg-porcelain px-3 py-2.5 text-sm font-semibold text-enamel-text"
        >
          {t.clients.blocked}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-tile border border-chrome bg-chrome text-center">
        {(
          [
            [t.clients.statVisits, String(client.visitCount)],
            [t.clients.statNoShows, String(client.noShowCount)],
            [t.clients.statSpent, formatMoney(client.totalSpent, locale)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-porcelain px-2 py-2.5">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <NotesForm shopId={shopId} client={client} />

      <SectionLabel className="mt-6">{t.clients.history}</SectionLabel>
      {client.visits.length === 0 ? (
        <p className="rounded-tile border border-chrome bg-porcelain-sunk px-3 py-3 text-sm text-ink-muted">
          {t.clients.noHistory}
        </p>
      ) : (
        <TileList>
          {client.visits.map((visit) => {
            const start = new Date(visit.startAt);
            return (
              <li key={visit.id} className="bg-porcelain">
                <Link
                  href={`/staff/shop/${shopId}/calendar/${visit.id}`}
                  className="flex min-h-14 items-center gap-3 px-3 py-2.5 active:bg-porcelain-sunk"
                >
                  <span className="w-16 shrink-0 tabular-nums">
                    <span className="block text-[15px] leading-tight font-semibold whitespace-nowrap">
                      {formatDayMonth(start, locale)}
                    </span>
                    <span className="block text-xs leading-tight text-ink-muted">
                      {formatTime(start)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-tight font-semibold">
                      {visit.services.join(', ')}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {visit.masterName} · {t.agenda.statusFull[visit.status]}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                    {formatMoney(visit.totalPrice, locale)}
                  </span>
                </Link>
              </li>
            );
          })}
        </TileList>
      )}

      {client.canBlock && <Blacklist shopId={shopId} client={client} />}
    </main>
  );
}
