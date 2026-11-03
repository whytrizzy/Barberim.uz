'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { preparePhoto } from '@/features/shop/prepare-photo';
import { portfolioSchema, type PortfolioDto } from './schemas';

const path = (shopId: string, staffId: string) => `/api/shops/${shopId}/staff/${staffId}/portfolio`;

export function usePortfolio(shopId: string, staffId: string) {
  return useQuery({
    queryKey: ['portfolio', staffId],
    queryFn: () => api(path(shopId, staffId), { schema: portfolioSchema }),
  });
}

/** Uploads, deletes and reorders a master's photos; each change is saved at once. */
export function usePortfolioPhotos(shopId: string, staffId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['portfolio', staffId];
  const base = path(shopId, staffId);
  const store = (portfolio: PortfolioDto) => {
    queryClient.setQueryData(queryKey, portfolio);
    // The shop's page shows these photos too.
    void queryClient.invalidateQueries({ queryKey: ['shop-profile'] });
  };

  const add = useMutation({
    mutationFn: async (file: File) =>
      api(base, { method: 'POST', body: await preparePhoto(file), schema: portfolioSchema }),
    onSuccess: store,
  });
  const remove = useMutation({
    mutationFn: (photoId: string) =>
      api(`${base}/${photoId}`, { method: 'DELETE', schema: portfolioSchema }),
    onSuccess: store,
  });
  const reorder = useMutation({
    mutationFn: (order: string[]) =>
      api(base, { method: 'PUT', body: { order }, schema: portfolioSchema }),
    // Move the photos straight away; put them back if the server refuses.
    onMutate: (order) => {
      const before = queryClient.getQueryData<PortfolioDto>(queryKey);
      if (before) {
        const byId = new Map(before.photos.map((photo) => [photo.id, photo]));
        queryClient.setQueryData(queryKey, {
          ...before,
          photos: order.flatMap((id) => byId.get(id) ?? []),
        });
      }
      return { before };
    },
    onError: (_error, _order, context) => {
      if (context?.before) queryClient.setQueryData(queryKey, context.before);
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: store,
  });
  return { add, remove, reorder };
}
