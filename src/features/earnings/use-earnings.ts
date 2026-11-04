'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EarningsPeriod } from '@/domain/earnings';
import { api } from '@/features/api/client';
import { earningsSchema } from './schemas';

export function useEarnings(shopId: string, period: EarningsPeriod, date: string) {
  return useQuery({
    queryKey: ['earnings', shopId, period, date],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/earnings?period=${period}&date=${date}`, {
        schema: earningsSchema,
        signal,
      }),
    // Flipping between weeks keeps the last one on screen instead of blanking it.
    placeholderData: keepPreviousData,
  });
}
