import 'server-only';
import { priceBooking, type OfferedService } from '@/domain/booking';
import type { BookingRefusal } from '@/features/booking/schemas';
import { db } from '../db/client';
import { AppError } from '../http/errors';

/** The master's own versions of the chosen services, in the chosen order. */
export async function offeredServices(
  staffId: string,
  shopId: string,
  serviceIds: string[],
): Promise<OfferedService[]> {
  const rows = await db.staffService.findMany({
    where: { staffId, serviceId: { in: serviceIds }, service: { shopId, isActive: true } },
    include: { service: true },
  });
  const byId = new Map(rows.map((r) => [r.serviceId, r]));
  return serviceIds.map((serviceId) => {
    const row = byId.get(serviceId);
    if (!row) {
      const reason: BookingRefusal = 'service_unavailable';
      throw new AppError('invalid_input', reason, { reason, serviceId });
    }
    return {
      id: row.service.id,
      name: row.service.name,
      price: row.service.price,
      durationMin: row.service.durationMin,
      priceOverride: row.priceOverride,
      durationOverride: row.durationOverride,
    };
  });
}

/** Each party (person) priced with this master's services: one booking per party. */
export async function priceParties(staffId: string, shopId: string, parties: string[][]) {
  return Promise.all(
    parties.map(async (serviceIds) =>
      priceBooking(await offeredServices(staffId, shopId, serviceIds)),
    ),
  );
}

/** Active, bookable masters of a shop who offer every one of these services. */
export async function mastersOffering(shopId: string, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  return db.staff.findMany({
    where: {
      shopId,
      isActive: true,
      isBookable: true,
      shop: { status: 'ACTIVE' },
      AND: unique.map((serviceId) => ({
        services: { some: { serviceId, service: { isActive: true } } },
      })),
    },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  });
}
