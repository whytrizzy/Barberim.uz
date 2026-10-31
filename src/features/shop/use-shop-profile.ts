'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { shopProfileSchema, shopSchema, type ShopStatusRequest } from './schemas';

export function useShopProfile(slug: string) {
  return useQuery({
    queryKey: ['shop-profile', slug],
    queryFn: ({ signal }) =>
      api(`/api/shops/by-slug/${encodeURIComponent(slug)}`, { schema: shopProfileSchema, signal }),
    // Free times change through the day, but a client glancing at the page needn't wait for them.
    staleTime: 30_000,
    retry: false,
  });
}

export function useShopStatus(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ShopStatusRequest) =>
      api(`/api/shops/${shopId}/status`, { method: 'POST', body, schema: shopSchema }),
    onSuccess: (shop) => {
      queryClient.setQueryData(['shop', shop.id], shop);
      void queryClient.invalidateQueries({ queryKey: ['shop-profile', shop.slug] });
    },
  });
}
