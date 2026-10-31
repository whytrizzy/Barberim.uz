'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import {
  bookingSchema,
  clientMatchesSchema,
  type CreateStaffBookingRequest,
} from '@/features/booking/schemas';
import { useDebounced } from '@/features/shop/use-shop';

export function useClientSearch(shopId: string, text: string) {
  const query = useDebounced(text.trim(), 300);
  return useQuery({
    queryKey: ['clients', shopId, query],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/clients?q=${encodeURIComponent(query)}`, {
        schema: clientMatchesSchema,
        signal,
      }),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

export function useAddBooking(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStaffBookingRequest) =>
      api(`/api/shops/${shopId}/bookings`, { method: 'POST', body, schema: bookingSchema }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendar', shopId] }),
        queryClient.invalidateQueries({ queryKey: ['clients', shopId] }),
      ]),
  });
}
