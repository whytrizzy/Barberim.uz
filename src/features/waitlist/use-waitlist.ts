'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import {
  leftWaitlistSchema,
  waitlistEntrySchema,
  waitlistSchema,
  type JoinWaitlistRequest,
} from './schemas';

export function useWaitlist() {
  return useQuery({
    queryKey: ['waitlist'],
    queryFn: ({ signal }) => api('/api/me/waitlist', { schema: waitlistSchema, signal }),
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JoinWaitlistRequest) =>
      api('/api/me/waitlist', { method: 'POST', body, schema: waitlistEntrySchema }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      api(`/api/me/waitlist/${entryId}`, { method: 'DELETE', schema: leftWaitlistSchema }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });
}
