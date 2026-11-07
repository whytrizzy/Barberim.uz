'use client';

import { errorText } from '@/features/api/error-text';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Button } from '@/ui/button';
import { DepositStatus, PROVIDER_NAMES } from './deposit-panel';
import type { BookingDepositDto } from './schemas';
import { useMarkRefunded } from './use-deposits';

/** On the staff booking screen: the client's deposit, and closing a refund the shop made. */
export function StaffDeposit({
  shopId,
  bookingId,
  deposit,
}: {
  shopId: string;
  bookingId: string;
  deposit: BookingDepositDto;
}) {
  const { t } = useI18n();
  const refunded = useMarkRefunded(shopId, bookingId);
  return (
    <section className="mt-3 grid gap-2 rounded-tile border border-chrome bg-porcelain p-3">
      <DepositStatus deposit={deposit} />
      {deposit.provider && (
        <p className="text-xs text-ink-muted">{PROVIDER_NAMES[deposit.provider]}</p>
      )}
      {deposit.status === 'REFUND_DUE' && (
        <>
          <p className="text-sm text-ink-muted">{t.deposits.refundHint}</p>
          <Button
            variant="secondary"
            loading={refunded.isPending}
            onClick={() =>
              refunded.mutate(undefined, {
                onSuccess: () => haptic.notify('success'),
                onError: () => haptic.notify('error'),
              })
            }
          >
            {t.deposits.markRefunded}
          </Button>
        </>
      )}
      {refunded.error && (
        <p role="alert" className="text-sm text-enamel-text">
          {errorText(t, refunded.error)}
        </p>
      )}
    </section>
  );
}
