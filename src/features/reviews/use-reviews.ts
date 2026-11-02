'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/features/api/client';
import {
  myReviewResponseSchema,
  myReviewSchema,
  staffReviewsSchema,
  type ReviewAction,
  type ReviewRequest,
} from './schemas';

export function useMyReview(bookingId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['my-review', bookingId],
    queryFn: ({ signal }) =>
      api(`/api/me/bookings/${bookingId}/review`, { schema: myReviewResponseSchema, signal }),
    enabled,
  });
}

export function useCreateReview(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewRequest) =>
      api(`/api/me/bookings/${bookingId}/review`, {
        method: 'POST',
        body,
        schema: myReviewSchema,
      }),
    onSuccess: (review) => {
      queryClient.setQueryData(['my-review', bookingId], { review });
      void queryClient.invalidateQueries({ queryKey: ['shop-profile'] });
    },
  });
}

export function useShopReviews(shopId: string) {
  return useQuery({
    queryKey: ['shop-reviews', shopId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/reviews`, { schema: staffReviewsSchema, signal }),
  });
}

export function useReviewAction(shopId: string, reviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewAction) =>
      api(`/api/shops/${shopId}/reviews/${reviewId}`, {
        method: 'PATCH',
        body,
        schema: z.object({ id: z.string() }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-reviews', shopId] }),
  });
}
