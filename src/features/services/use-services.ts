'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/features/api/client';
import { deletedSchema, serviceSchema, shopServicesSchema, type ServiceRequest } from './schemas';

export function useShopServices(shopId: string) {
  return useQuery({
    queryKey: ['services', shopId],
    queryFn: ({ signal }) =>
      api(`/api/shops/${shopId}/services`, { schema: shopServicesSchema, signal }),
  });
}

/** Saves or deletes one service (`serviceId` null: a new one); done once the list is fresh. */
export function useServiceActions(shopId: string, serviceId: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['services', shopId] });
  const path = `/api/shops/${shopId}/services`;

  const save = useMutation({
    mutationFn: (body: ServiceRequest) =>
      serviceId
        ? api(`${path}/${serviceId}`, { method: 'PATCH', body, schema: serviceSchema })
        : api(path, { method: 'POST', body, schema: serviceSchema }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(`${path}/${serviceId}`, { method: 'DELETE', schema: deletedSchema }),
    onSuccess: refresh,
  });
  return { save, remove };
}
