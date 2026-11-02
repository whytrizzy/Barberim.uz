'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { bookingOptionsSchema, bookingSchema, type CreateBookingRequest } from './schemas';

export function useBookingOptions(shopId: string | undefined, staff: string, services: string[]) {
  const list = [...services].sort().join(',');
  return useQuery({
    queryKey: ['booking-options', shopId, staff, list],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/availability?staff=${staff}&services=${services.join(',')}`, {
        schema: bookingOptionsSchema,
        signal,
      }),
    enabled: Boolean(shopId) && services.length > 0,
    placeholderData: keepPreviousData,
    // Times go quickly: look again when the client comes back to the screen.
    staleTime: 20_000,
  });
}

export function useCreateBooking(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBookingRequest) =>
      api('/api/bookings', { method: 'POST', body, schema: bookingSchema }),
    // Refreshed even when refused: "taken" means the times on screen are out of date. Not waited
    // for, so the answer shows straight away even on a slow connection.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking-options'] });
      void queryClient.invalidateQueries({ queryKey: ['shop-profile', slug] });
    },
  });
}
