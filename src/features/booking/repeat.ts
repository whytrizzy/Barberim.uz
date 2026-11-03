import type { Route } from 'next';

/**
 * The booking screen with the same master and services already chosen. Anything no longer on
 * offer (a removed service, a master who left) simply isn't picked; the person chooses again.
 */
export function repeatBookingPath(
  slug: string,
  { staffId, serviceIds }: { staffId: string; serviceIds: string[] },
): Route {
  const query = new URLSearchParams({ master: staffId });
  if (serviceIds.length > 0) query.set('services', serviceIds.join(','));
  return `/shop/${slug}/book?${query.toString()}` as Route;
}
