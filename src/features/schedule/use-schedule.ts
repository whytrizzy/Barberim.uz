'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import {
  scheduleSchema,
  type ChangeRequest,
  type ScheduleDto,
  type WeeklyRequest,
} from './schemas';

export function useSchedule(shopId: string, staffId: string) {
  return useQuery({
    queryKey: ['schedule', staffId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/staff/${staffId}/schedule`, { schema: scheduleSchema, signal }),
  });
}

/** Every change answers with the whole schedule, which replaces the cached one. */
export function useScheduleActions(shopId: string, staffId: string) {
  const queryClient = useQueryClient();
  const store = (schedule: ScheduleDto) =>
    queryClient.setQueryData(['schedule', staffId], schedule);
  const path = `/api/shops/${shopId}/staff/${staffId}/schedule`;

  const saveWeek = useMutation({
    mutationFn: (body: WeeklyRequest) => api(path, { method: 'PUT', body, schema: scheduleSchema }),
    onSuccess: store,
  });
  const addChange = useMutation({
    mutationFn: (body: ChangeRequest) =>
      api(`${path}/changes`, { method: 'POST', body, schema: scheduleSchema }),
    onSuccess: store,
  });
  const removeChange = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api(`${path}/changes?from=${from}&to=${to}`, { method: 'DELETE', schema: scheduleSchema }),
    onSuccess: store,
  });
  return { saveWeek, addChange, removeChange };
}
