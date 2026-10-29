'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { useI18n } from '@/i18n/provider';
import { useTelegram } from '@/telegram/provider';
import { sessionResponseSchema } from './schemas';

/**
 * The signed-in user and their shops. Started once the app knows its Telegram mode and the
 * language is chosen; the chosen language is saved on the account (the bot uses it too).
 */
export function useSession() {
  const { mode } = useTelegram();
  const { locale, chosen } = useI18n();
  return useQuery({
    queryKey: ['session', locale],
    queryFn: ({ signal }) =>
      api('/api/auth/session', {
        method: 'POST',
        body: { locale },
        schema: sessionResponseSchema,
        signal,
      }),
    enabled: mode !== 'loading' && chosen,
    staleTime: Infinity,
  });
}
