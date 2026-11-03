'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/features/api/client';
import { errorText } from '@/features/api/error-text';
import type { Messages } from '@/i18n/messages';
import { bookingSchema, type BookingNoticeRequest } from './schemas';

/** Sends a live notice; `refresh` lists the queries that show the booking. */
export function useBookingNotice(bookingId: string, refresh: unknown[][]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingNoticeRequest) =>
      api(`/api/bookings/${bookingId}/notice`, { method: 'POST', body, schema: bookingSchema }),
    // Refreshed in the background: the button needn't wait for the screen to reload.
    onSettled: () => {
      for (const queryKey of refresh) void queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function noticeError(t: Messages, error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason === 'too_many_notices') return t.notices.tooMany;
    if (reason === 'not_now') return t.agenda.changedMeanwhile;
  }
  return errorText(t, error);
}
