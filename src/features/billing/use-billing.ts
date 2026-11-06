'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { billingSchema, checkoutSchema, type PaymentProviderName } from './schemas';

export function useBilling(shopId: string) {
  return useQuery({
    queryKey: ['billing', shopId],
    queryFn: ({ signal }) => api(`/api/shops/${shopId}/billing`, { schema: billingSchema, signal }),
    // Coming back from the provider's checkout shows the new paid time.
    refetchOnWindowFocus: true,
  });
}

export function useCheckout(shopId: string) {
  return useMutation({
    mutationFn: (provider: PaymentProviderName) =>
      api(`/api/shops/${shopId}/billing/checkout`, {
        method: 'POST',
        body: { provider },
        schema: checkoutSchema,
      }),
  });
}
