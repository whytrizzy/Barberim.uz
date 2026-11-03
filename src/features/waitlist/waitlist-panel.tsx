'use client';

import { BellRing } from 'lucide-react';
import { ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import { interpolate } from '@/i18n/interpolate';
import type { Messages } from '@/i18n/messages';
import { useI18n } from '@/i18n/provider';
import { haptic } from '@/telegram/haptics';
import { Button } from '@/ui/button';
import { MAX_WAITLIST_ENTRIES } from './schemas';
import { useJoinWaitlist, useLeaveWaitlist, useWaitlist } from './use-waitlist';

function waitlistError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'too_many_entries') {
      return interpolate(t.waitlist.tooMany, { count: MAX_WAITLIST_ENTRIES });
    }
  }
  return errorText(t, error);
}

/** Under a full day on the booking screen: wait for a time to free up, or stop waiting. */
export function WaitlistPanel({
  shopId,
  date,
  staffId,
  serviceIds,
}: {
  shopId: string;
  /** "2026-11-03", Tashkent. */
  date: string;
  /** Null: any master. */
  staffId: string | null;
  serviceIds: string[];
}) {
  const { t } = useI18n();
  const waitlist = useWaitlist();
  const join = useJoinWaitlist();
  const leave = useLeaveWaitlist();
  const entry = waitlist.data?.entries.find((e) => e.shopId === shopId && e.date === date);
  // Waiting for other services or another master than now chosen: joining again updates it.
  const same =
    entry &&
    entry.staffId === staffId &&
    entry.serviceIds.length === serviceIds.length &&
    serviceIds.every((id) => entry.serviceIds.includes(id));
  const error = join.error ?? leave.error;

  if (waitlist.isPending) return null;
  return (
    <section
      aria-live="polite"
      className="mt-3 grid gap-2.5 rounded-tile border border-chrome bg-porcelain px-3 py-3"
    >
      <p className="flex items-start gap-2.5 text-sm">
        <BellRing className="mt-0.5 size-4 shrink-0 text-enamel-text" aria-hidden />
        <span>{same ? t.waitlist.onIt : t.waitlist.offer}</span>
      </p>
      {same ? (
        <Button
          variant="secondary"
          loading={leave.isPending}
          onClick={() =>
            leave.mutate(entry.id, {
              onSuccess: () => haptic.notify('success'),
              onError: () => haptic.notify('error'),
            })
          }
        >
          {t.waitlist.leave}
        </Button>
      ) : (
        <Button
          loading={join.isPending}
          onClick={() =>
            join.mutate(
              { shopId, date, staffId, serviceIds },
              {
                onSuccess: () => haptic.notify('success'),
                onError: () => haptic.notify('error'),
              },
            )
          }
        >
          {entry ? t.waitlist.update : t.waitlist.join}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-enamel-text">
          {waitlistError(t, error)}
        </p>
      )}
    </section>
  );
}
