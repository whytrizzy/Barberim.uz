'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import type { ShopProfileDto } from '@/features/shop/schemas';
import { favoritesSchema, favoriteStateSchema } from './schemas';

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: ({ signal }) => api('/api/me/favorites', { schema: favoritesSchema, signal }),
  });
}

/** Saves or forgets a shop from its page; the heart fills at once and goes back if it fails. */
export function useToggleFavorite(slug: string, shopId: string) {
  const queryClient = useQueryClient();
  const profileKey = ['shop-profile', slug];
  const show = (isFavorite: boolean) =>
    queryClient.setQueryData<ShopProfileDto>(profileKey, (shop) =>
      shop ? { ...shop, isFavorite } : shop,
    );

  return useMutation({
    mutationFn: (save: boolean) =>
      api(`/api/me/favorites/${shopId}`, {
        method: save ? 'PUT' : 'DELETE',
        schema: favoriteStateSchema,
      }),
    onMutate: (save) => show(save),
    onError: (_error, save) => show(!save),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });
}
