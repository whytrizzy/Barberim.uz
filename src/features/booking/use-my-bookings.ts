'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import {
  bookingOptionsSchema,
  bookingSchema,
  myBookingSchema,
  myBookingsSchema,
  type BookingActionRequest,
  type MyBookingDto,
} from './schemas';

export function useMyBookings() {
  return useQuery({
    queryKey: ['my-bookings'],
    queryFn: ({ signal }) => api('/api/me/bookings', { schema: myBookingsSchema, signal }),
  });
}

export function useMyBooking(bookingId: string) {
  return useQuery({
    queryKey: ['my-bookings', bookingId],
    queryFn: ({ signal }) =>
      api(`/api/me/bookings/${bookingId}`, { schema: myBookingSchema, signal }),
    retry: false,
  });
}

export function useMoveOptions(bookingId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['move-options', bookingId],
    queryFn: ({ signal }) =>
      api(`/api/me/bookings/${bookingId}/options`, { schema: bookingOptionsSchema, signal }),
    enabled,
    retry: false,
    staleTime: 20_000,
  });
}

export function useMyBookingAction(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingActionRequest) =>
      api(`/api/bookings/${bookingId}`, { method: 'PATCH', body, schema: bookingSchema }),
    // The new time or status shows at once, without waiting for the refresh below.
    onSuccess: (updated) => {
      queryClient.setQueryData<MyBookingDto>(['my-bookings', bookingId], (old) =>
        old ? { ...old, ...updated } : old,
      );
    },
    // Refreshed even when refused: the shop may have changed it, or someone took that time.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['move-options', bookingId] });
    },
  });
}
