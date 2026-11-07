'use client';

import { CircleCheck, Clock, Wallet } from 'lucide-react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { useShopProfile } from '@/features/shop/use-shop-profile';
import { formatMoney, formatTime } from '@/i18n/format';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { haptic } from '@/telegram/haptics';
import { openExternal } from '@/telegram/links';
import { Button } from '@/ui/button';
import type { BookingDepositDto, DepositProvider } from './schemas';
import { useDepositCheckout } from './use-deposits';

export const PROVIDER_NAMES: Record<DepositProvider, string> = {
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
};

function depositError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'deposit_closed') return t.deposits.closed;
    if (reason === 'provider_unavailable') return t.deposits.unavailable;
  }
  return errorText(t, error);
}

/** One line about a deposit's state, for client and staff screens alike. */
export function DepositStatus({ deposit }: { deposit: BookingDepositDto }) {
  const { t, locale } = useI18n();
  const good = deposit.status === 'PAID' || deposit.status === 'REFUNDED';
  return (
    <p
      className={cn(
        'flex items-start gap-2 text-sm font-semibold',
        good ? 'text-success' : deposit.status === 'AWAITING' ? 'text-ink' : 'text-ink-muted',
      )}
    >
      {good ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {interpolate(t.deposits.status[deposit.status], {
        amount: formatMoney(deposit.amount, locale),
      })}
    </p>
  );
}

/**
 * On the client's booking: pay the deposit while it's held (with the shop's providers), or see
 * what became of it.
 */
export function ClientDepositPanel({
  bookingId,
  shopSlug,
  deposit,
}: {
  bookingId: string;
  shopSlug: string;
  deposit: BookingDepositDto;
}) {
  const { t } = useI18n();
  const shop = useShopProfile(shopSlug);
  const checkout = useDepositCheckout(bookingId);
  const providers = shop.data?.deposit?.providers ?? [];
  const open = deposit.status === 'AWAITING' && new Date(deposit.expiresAt) > new Date();

  const pay = (provider: DepositProvider) => {
    haptic.selection();
    checkout.mutate(provider, {
      // Payme and Click open outside Telegram; their receipt comes back as a bot message.
      onSuccess: ({ url }) => {
        if (url) openExternal(url);
      },
      onError: () => haptic.notify('error'),
    });
  };

  return (
    <section className="mt-3 grid gap-2.5 rounded-tile border border-chrome bg-porcelain p-3">
      <DepositStatus deposit={deposit} />
      {open && (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {interpolate(t.deposits.payUntil, { time: formatTime(new Date(deposit.expiresAt)) })}
          </p>
          {providers.map((provider) => (
            <Button
              key={provider}
              loading={checkout.isPending && checkout.variables === provider}
              disabled={checkout.isPending}
              onClick={() => pay(provider)}
            >
              {interpolate(t.deposits.payWith, { provider: PROVIDER_NAMES[provider] })}
            </Button>
          ))}
          <p className="text-xs text-ink-muted">{t.deposits.afterPay}</p>
          <p className="text-xs text-ink-muted">{t.deposits.rules}</p>
        </>
      )}
      {checkout.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {depositError(t, checkout.error)}
        </p>
      )}
    </section>
  );
}
