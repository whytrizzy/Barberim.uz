'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/features/api/client';
import {
  depositCheckoutSchema,
  depositSettingsSchema,
  type DepositProvider,
  type DepositSettingsRequest,
} from './schemas';

export function useDepositSettings(shopId: string) {
  return useQuery({
    queryKey: ['deposit-settings', shopId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/deposits`, { schema: depositSettingsSchema, signal }),
  });
}

export function useSaveDepositSettings(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DepositSettingsRequest) =>
      api(`/api/shops/${shopId}/deposits`, { method: 'PUT', body, schema: depositSettingsSchema }),
    onSuccess: (settings) => {
      queryClient.setQueryData(['deposit-settings', shopId], settings);
      void queryClient.invalidateQueries({ queryKey: ['shop-profile'] });
    },
  });
}

/** Pay a booking's deposit: Payme/Click give a checkout page, Uzum a code. */
export function useDepositCheckout(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: DepositProvider) =>
      api(`/api/me/bookings/${bookingId}/deposit`, {
        method: 'POST',
        body: { provider },
        schema: depositCheckoutSchema,
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
  });
}

/** The shop refunded a deposit itself (Click, or by hand). */
export function useMarkRefunded(shopId: string, bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/api/shops/${shopId}/bookings/${bookingId}/deposit`, {
        method: 'POST',
        schema: z.object({ refunded: z.literal(true) }),
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
  });
}
