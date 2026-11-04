'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/features/api/client';
import {
  clientDetailSchema,
  clientListSchema,
  type ClientFilter,
  type UpdateClientRequest,
} from './schemas';

export function useClientList(shopId: string, q: string, filter: ClientFilter) {
  return useInfiniteQuery({
    queryKey: ['clients', shopId, q, filter],
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ view: 'list', q, filter, page: String(pageParam) });
      return api(`/api/shops/${shopId}/clients?${query.toString()}`, {
        schema: clientListSchema,
        signal,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.more ? pages.length : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useClient(shopId: string, clientId: string) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/clients/${clientId}`, { schema: clientDetailSchema, signal }),
  });
}

export function useUpdateClient(shopId: string, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClientRequest) =>
      api(`/api/shops/${shopId}/clients/${clientId}`, {
        method: 'PATCH',
        body,
        schema: clientDetailSchema,
      }),
    onSuccess: (client) => {
      queryClient.setQueryData(['client', clientId], client);
      void queryClient.invalidateQueries({ queryKey: ['clients', shopId] });
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
    },
  });
}
