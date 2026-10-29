'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import type { SessionResponse } from '@/features/auth/schemas';
import { haptic } from '@/telegram/haptics';
import { savePhoneResponseSchema, type SavePhoneRequest } from './schemas';

/** Saves the phone and updates the cached session so every screen sees it at once. */
export function useSavePhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SavePhoneRequest) =>
      api('/api/me/phone', { method: 'PUT', body, schema: savePhoneResponseSchema }),
    onSuccess: (saved) => {
      haptic.notify('success');
      queryClient.setQueriesData<SessionResponse>({ queryKey: ['session'] }, (old) =>
        old ? { ...old, user: { ...old.user, ...saved } } : old,
      );
    },
    onError: () => haptic.notify('error'),
  });
}
