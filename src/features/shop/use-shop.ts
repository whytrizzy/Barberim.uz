'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { checkSlug } from '@/domain/slug';
import { api } from '@/features/api/client';
import {
  shopSchema,
  slugCheckResponseSchema,
  type CreateShopRequest,
  type UpdateShopRequest,
} from './schemas';

export function useShop(shopId: string) {
  return useQuery({
    queryKey: ['shop', shopId],
    queryFn: ({ signal }) => api(`/api/shops/${shopId}`, { schema: shopSchema, signal }),
  });
}

export function useCreateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopRequest) =>
      api('/api/shops', { method: 'POST', body, schema: shopSchema }),
    onSuccess: (shop) => {
      queryClient.setQueryData(['shop', shop.id], shop);
      // The new membership shows up in the session.
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

export function useUpdateShop(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopRequest) =>
      api(`/api/shops/${shopId}`, { method: 'PATCH', body, schema: shopSchema }),
    onSuccess: (shop) => {
      queryClient.setQueryData(['shop', shop.id], shop);
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Live "is this link name free?" while the owner types (local format check first). */
export function useSlugCheck(slug: string, enabled: boolean) {
  const debounced = useDebounced(slug, 400);
  const localProblem = checkSlug(slug);
  const query = useQuery({
    queryKey: ['slug', debounced],
    queryFn: ({ signal }) =>
      api(`/api/shops/slug?value=${encodeURIComponent(debounced)}`, {
        schema: slugCheckResponseSchema,
        signal,
      }),
    enabled: enabled && checkSlug(debounced) === null,
    staleTime: 10_000,
  });
  if (localProblem) return { problem: localProblem, checking: false };
  if (debounced !== slug || query.isFetching) return { problem: null, checking: true };
  return {
    problem: query.data?.problem ?? null,
    checking: false,
    available: query.data?.available,
  };
}
