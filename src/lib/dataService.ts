import { prisma } from './prisma';
import {
  BarberProfileType,
  ServiceType,
  BookingType,
  MasterType,
  WorkingHours,
  BookingStatus,
} from '@/types';

/** Map a Prisma master row to the API shape. */
function toMaster(m: any): MasterType {
  return {
    id: m.id,
    shopId: m.shopId,
    name: m.name,
    photoUrl: m.photoUrl,
    specialty: m.specialty,
    workingHours: (m.workingHours as unknown as WorkingHours) ?? null,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
  };
}

// ─── Barber Profile ─────────────────────────────────────────────────

export async function getBarberProfile(barberId?: string, userId?: string): Promise<BarberProfileType | null> {
  const whereClause = barberId
    ? { id: barberId }
    : userId
    ? { userId }
    : null;

  if (!whereClause) return null;

  const profile = await prisma.barberProfile.findUnique({
    where: whereClause,
    include: {
      user: true,
      services: { where: { isActive: true } },
      masters: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) return null;

  return {
    id: profile.id,
    userId: profile.userId,
    shopName: profile.shopName,
    bio: profile.bio,
    address: profile.address,
    photoUrl: profile.photoUrl,
    masters: profile.masters.map(toMaster),
    workingHours: profile.workingHours as unknown as WorkingHours,
    user: profile.user
      ? {
          id: profile.user.id,
          telegramId: profile.user.telegramId.toString(),
          username: profile.user.username,
          role: profile.user.role as any,
          fullName: profile.user.fullName,
          phone: profile.user.phone,
        }
      : undefined,
    services: profile.services.map((s) => ({
      id: s.id,
      barberId: s.barberId,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
      isActive: s.isActive,
    })),
  };
}

export async function updateBarberProfile(
  userId: string,
  data: {
    shopName?: string;
    bio?: string;
    address?: string;
    fullName?: string;
    phone?: string;
    workingHours?: WorkingHours;
  }
): Promise<BarberProfileType | null> {
  // Update User fields if provided
  if (data.fullName || data.phone) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
    });
  }

  // Update BarberProfile fields
  const updated = await prisma.barberProfile.update({
    where: { userId },
    data: {
      ...(data.shopName !== undefined && { shopName: data.shopName }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.workingHours !== undefined && { workingHours: data.workingHours as any }),
    },
  });

  return getBarberProfile(updated.id);
}

// ─── Masters ─────────────────────────────────────────────────────────

export async function getMasters(shopId: string, includeInactive = false): Promise<MasterType[]> {
  const masters = await prisma.master.findMany({
    where: { shopId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return masters.map(toMaster);
}

export async function createMaster(data: {
  shopId: string;
  name: string;
  specialty?: string | null;
  workingHours?: WorkingHours | null;
}): Promise<MasterType> {
  const count = await prisma.master.count({ where: { shopId: data.shopId } });
  const created = await prisma.master.create({
    data: {
      shopId: data.shopId,
      name: data.name,
      specialty: data.specialty ?? null,
      workingHours: (data.workingHours ?? undefined) as any,
      sortOrder: count,
    },
  });
  return toMaster(created);
}

export async function updateMaster(
  masterId: string,
  data: {
    name?: string;
    specialty?: string | null;
    workingHours?: WorkingHours | null;
    isActive?: boolean;
  }
): Promise<MasterType> {
  const updated = await prisma.master.update({
    where: { id: masterId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.specialty !== undefined && { specialty: data.specialty }),
      ...(data.workingHours !== undefined && { workingHours: data.workingHours as any }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
  return toMaster(updated);
}

/** Soft-delete: keeps past bookings intact, just hides the master from booking. */
export async function deactivateMaster(masterId: string): Promise<boolean> {
  await prisma.master.update({ where: { id: masterId }, data: { isActive: false } });
  return true;
}

/** Effective hours for a master: their own, else the shop's. */
export async function getMasterWorkingHours(
  masterId: string
): Promise<{ shopId: string; workingHours: WorkingHours } | null> {
  const master = await prisma.master.findUnique({
    where: { id: masterId },
    include: { shop: true },
  });
  if (!master) return null;
  const own = master.workingHours as unknown as WorkingHours | null;
  return {
    shopId: master.shopId,
    workingHours: own ?? (master.shop.workingHours as unknown as WorkingHours),
  };
}

// ─── Services ────────────────────────────────────────────────────────

export async function getServices(barberId: string): Promise<ServiceType[]> {
  const services = await prisma.service.findMany({
    where: { barberId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  return services.map((s) => ({
    id: s.id,
    barberId: s.barberId,
    name: s.name,
    durationMinutes: s.durationMinutes,
    price: s.price,
    isActive: s.isActive,
  }));
}

export async function createService(serviceData: Omit<ServiceType, 'id'>): Promise<ServiceType> {
  const created = await prisma.service.create({
    data: {
      barberId: serviceData.barberId,
      name: serviceData.name,
      durationMinutes: Number(serviceData.durationMinutes),
      price: Number(serviceData.price),
    },
  });

  return {
    id: created.id,
    barberId: created.barberId,
    name: created.name,
    durationMinutes: created.durationMinutes,
    price: created.price,
    isActive: created.isActive,
  };
}

export async function updateService(
  serviceId: string,
  data: { name?: string; durationMinutes?: number; price?: number; isActive?: boolean }
): Promise<ServiceType> {
  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.durationMinutes !== undefined && { durationMinutes: Number(data.durationMinutes) }),
      ...(data.price !== undefined && { price: Number(data.price) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return {
    id: updated.id,
    barberId: updated.barberId,
    name: updated.name,
    durationMinutes: updated.durationMinutes,
    price: updated.price,
    isActive: updated.isActive,
  };
}

export async function deleteService(serviceId: string): Promise<boolean> {
  await prisma.service.delete({ where: { id: serviceId } });
  return true;
}

// ─── Bookings ────────────────────────────────────────────────────────

export async function getBookings(filter?: {
  barberId?: string;
  clientId?: string;
  masterId?: string;
}): Promise<BookingType[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      ...(filter?.barberId && { barberId: filter.barberId }),
      ...(filter?.clientId && { clientId: filter.clientId }),
      ...(filter?.masterId && { masterId: filter.masterId }),
    },
    include: {
      client: true,
      barber: { include: { user: true } },
      master: true,
      services: { include: { service: true } },
    },
    orderBy: { startTime: 'desc' },
  });

  return bookings.map((b) => ({
    id: b.id,
    clientId: b.clientId,
    barberId: b.barberId,
    masterId: b.masterId,
    master: b.master ? toMaster(b.master) : null,
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    totalPrice: b.totalPrice,
    status: b.status as any,
    notes: b.notes,
    client: b.client
      ? {
          id: b.client.id,
          telegramId: b.client.telegramId.toString(),
          username: b.client.username,
          role: b.client.role as any,
          fullName: b.client.fullName,
          phone: b.client.phone,
        }
      : undefined,
    barber: b.barber
      ? {
          id: b.barber.id,
          userId: b.barber.userId,
          shopName: b.barber.shopName,
          bio: b.barber.bio,
          address: b.barber.address,
          workingHours: b.barber.workingHours as unknown as WorkingHours,
          user: b.barber.user
            ? {
                id: b.barber.user.id,
                telegramId: b.barber.user.telegramId.toString(),
                username: b.barber.user.username,
                role: b.barber.user.role as any,
                fullName: b.barber.user.fullName,
                phone: b.barber.user.phone,
              }
            : undefined,
        }
      : undefined,
    services: b.services.map((bs) => ({
      service: {
        id: bs.service.id,
        barberId: bs.service.barberId,
        name: bs.service.name,
        durationMinutes: bs.service.durationMinutes,
        price: bs.service.price,
      },
    })),
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function createBooking(data: {
  barberId: string;
  clientId: string;
  masterId: string;
  serviceIds: string[];
  startTime: string; // ISO string
  notes?: string | null;
}): Promise<BookingType> {
  // Fetch services from DB to calculate duration and price
  const services = await prisma.service.findMany({
    where: { id: { in: data.serviceIds }, isActive: true },
  });

  const totalDuration = services.reduce((acc, s) => acc + s.durationMinutes, 0) || 30;
  const totalPrice = services.reduce((acc, s) => acc + s.price, 0);

  const startDate = new Date(data.startTime);
  const endDate = new Date(startDate.getTime() + totalDuration * 60 * 1000);

  if (services.length === 0) {
    throw new Error('NO_VALID_SERVICES');
  }

  // The master must belong to this shop and be active.
  const master = await prisma.master.findUnique({
    where: { id: data.masterId },
    select: { id: true, shopId: true, isActive: true },
  });
  if (!master || master.shopId !== data.barberId || !master.isActive) {
    throw new Error('INVALID_MASTER');
  }

  // Best-effort overlap check to prevent double-booking — scoped to the MASTER,
  // since each master has an independent calendar.
  // NOTE: interactive transactions ($transaction with a callback) are avoided
  // here because they are unreliable over the Supabase transaction pooler
  // (pgbouncer, port 6543). Full race safety will come from a DB-level
  // exclusion constraint added via migration later.
  const overlap = await prisma.booking.findFirst({
    where: {
      masterId: data.masterId,
      status: { in: ['CONFIRMED', 'PENDING'] },
      startTime: { lt: endDate },
      endTime: { gt: startDate },
    },
    select: { id: true },
  });

  if (overlap) {
    throw new Error('SLOT_TAKEN');
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: data.clientId,
      barberId: data.barberId,
      masterId: data.masterId,
      startTime: startDate,
      endTime: endDate,
      totalPrice,
      status: 'CONFIRMED',
      notes: data.notes ?? null,
      services: {
        create: data.serviceIds.map((sid) => ({ serviceId: sid })),
      },
    },
    include: {
      client: true,
      barber: { include: { user: true } },
      master: true,
      services: { include: { service: true } },
    },
  });

  return {
    id: booking.id,
    clientId: booking.clientId,
    barberId: booking.barberId,
    masterId: booking.masterId,
    master: booking.master ? toMaster(booking.master) : null,
    notes: booking.notes,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    totalPrice: booking.totalPrice,
    status: booking.status as any,
    client: booking.client
      ? {
          id: booking.client.id,
          telegramId: booking.client.telegramId.toString(),
          username: booking.client.username,
          role: booking.client.role as any,
          fullName: booking.client.fullName,
          phone: booking.client.phone,
        }
      : undefined,
    barber: booking.barber
      ? {
          id: booking.barber.id,
          userId: booking.barber.userId,
          shopName: booking.barber.shopName,
          bio: booking.barber.bio,
          address: booking.barber.address,
          workingHours: booking.barber.workingHours as unknown as WorkingHours,
          user: booking.barber.user
            ? {
                id: booking.barber.user.id,
                telegramId: booking.barber.user.telegramId.toString(),
                role: booking.barber.user.role as any,
                fullName: booking.barber.user.fullName,
                phone: booking.barber.user.phone,
              }
            : undefined,
        }
      : undefined,
    services: booking.services.map((bs) => ({
      service: {
        id: bs.service.id,
        barberId: bs.service.barberId,
        name: bs.service.name,
        durationMinutes: bs.service.durationMinutes,
        price: bs.service.price,
      },
    })),
    createdAt: booking.createdAt.toISOString(),
  };
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<BookingType | null> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: status as any },
  });

  const bookings = await getBookings();
  return bookings.find((b) => b.id === bookingId) || null;
}
