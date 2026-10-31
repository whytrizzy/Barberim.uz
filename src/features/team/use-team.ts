'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/features/api/client';
import {
  acceptedInviteSchema,
  createdInviteSchema,
  invitePreviewSchema,
  removedSchema,
  teamSchema,
  type AddStaffRequest,
  type UpdateStaffRequest,
} from './schemas';

const savedSchema = z.object({ id: z.string() });

export function useTeam(shopId: string) {
  return useQuery({
    queryKey: ['team', shopId],
    queryFn: ({ signal }) => api(`/api/shops/${shopId}/staff`, { schema: teamSchema, signal }),
  });
}

/** Team changes; each one is done once the list is fresh. Masters also appear on services. */
function useRefreshTeam(shopId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team', shopId] }),
      queryClient.invalidateQueries({ queryKey: ['services', shopId] }),
    ]);
}

export function useAddStaff(shopId: string) {
  const refresh = useRefreshTeam(shopId);
  return useMutation({
    mutationFn: (body: AddStaffRequest) =>
      api(`/api/shops/${shopId}/staff`, { method: 'POST', body, schema: savedSchema }),
    onSuccess: refresh,
  });
}

export function useMemberActions(shopId: string, staffId: string) {
  const refresh = useRefreshTeam(shopId);
  const path = `/api/shops/${shopId}/staff/${staffId}`;
  const save = useMutation({
    mutationFn: (body: UpdateStaffRequest) =>
      api(path, { method: 'PATCH', body, schema: savedSchema }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(path, { method: 'DELETE', schema: removedSchema }),
    onSuccess: refresh,
  });
  const invite = useMutation({
    mutationFn: () => api(`${path}/invite`, { method: 'POST', schema: createdInviteSchema }),
    onSuccess: refresh,
  });
  return { save, remove, invite };
}

export function useInvite(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: ({ signal }) => api(`/api/invites/${token}`, { schema: invitePreviewSchema, signal }),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/api/invites/${token}`, { method: 'POST', schema: acceptedInviteSchema }),
    // The new shop shows up in the session.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  });
}
