'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { bookingSchema, type BookingActionRequest } from '@/features/booking/schemas';
import { bookingDetailSchema, calendarDaySchema } from './schemas';

export function useCalendarDay(shopId: string, date: string) {
  return useQuery({
    queryKey: ['calendar', shopId, date],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/calendar?date=${date}`, { schema: calendarDaySchema, signal }),
    // The barber keeps this open all day: new bookings show up, and the old day stays on screen
    // while the next one loads over a slow connection.
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useBookingDetail(shopId: string, bookingId: string) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/bookings/${bookingId}`, { schema: bookingDetailSchema, signal }),
  });
}

export function useBookingAction(shopId: string, bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingActionRequest) =>
      api(`/api/bookings/${bookingId}`, { method: 'PATCH', body, schema: bookingSchema }),
    // Refreshed even when refused: "someone else changed it" means what's on screen is out of date.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
        queryClient.invalidateQueries({ queryKey: ['calendar', shopId] }),
      ]),
  });
}
