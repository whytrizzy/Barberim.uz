import { prisma } from './prisma';
import {
  MOCK_BARBER_PROFILE,
  MOCK_SERVICES,
  INITIAL_MOCK_BOOKINGS,
  MOCK_BARBER_USER,
  MOCK_CLIENT_USER,
} from './mockData';
import {
  BarberProfileType,
  ServiceType,
  BookingType,
  UserType,
  WorkingHours,
  BookingStatus,
} from '@/types';

// In-Memory Storage for Demo Fallback
let inMemoryServices: ServiceType[] = [...MOCK_SERVICES];
let inMemoryBookings: BookingType[] = [...INITIAL_MOCK_BOOKINGS];
let inMemoryProfile: BarberProfileType = { ...MOCK_BARBER_PROFILE };

export async function getBarberProfile(barberId?: string): Promise<BarberProfileType> {
  try {
    const targetId = barberId || MOCK_BARBER_PROFILE.id;
    const profile = await prisma.barberProfile.findUnique({
      where: { id: targetId },
      include: {
        user: true,
        services: true,
      },
    });

    if (profile) {
      return {
        id: profile.id,
        userId: profile.userId,
        bio: profile.bio,
        address: profile.address,
        workingHours: profile.workingHours as unknown as WorkingHours,
        user: profile.user
          ? {
              id: profile.user.id,
              telegramId: profile.user.telegramId.toString(),
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
  } catch (err) {
    console.warn('⚡ Using memory store for getBarberProfile');
  }

  return {
    ...inMemoryProfile,
    services: inMemoryServices,
  };
}

export async function updateBarberProfile(data: {
  bio?: string;
  address?: string;
  workingHours?: WorkingHours;
}): Promise<BarberProfileType> {
  try {
    const updated = await prisma.barberProfile.update({
      where: { id: inMemoryProfile.id },
      data: {
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.workingHours !== undefined && { workingHours: data.workingHours as any }),
      },
    });
    if (updated) {
      return getBarberProfile(updated.id);
    }
  } catch (err) {
    console.warn('⚡ Using memory store for updateBarberProfile');
  }

  if (data.bio !== undefined) inMemoryProfile.bio = data.bio;
  if (data.address !== undefined) inMemoryProfile.address = data.address;
  if (data.workingHours !== undefined) inMemoryProfile.workingHours = data.workingHours;

  return { ...inMemoryProfile, services: inMemoryServices };
}

export async function getServices(barberId: string): Promise<ServiceType[]> {
  try {
    const services = await prisma.service.findMany({
      where: { barberId, isActive: true },
    });
    if (services && services.length > 0) {
      return services.map((s) => ({
        id: s.id,
        barberId: s.barberId,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
        isActive: s.isActive,
      }));
    }
  } catch (err) {
    console.warn('⚡ Using memory store for getServices');
  }

  return inMemoryServices.filter((s) => s.isActive);
}

export async function createService(serviceData: Omit<ServiceType, 'id'>): Promise<ServiceType> {
  try {
    const created = await prisma.service.create({
      data: {
        barberId: serviceData.barberId,
        name: serviceData.name,
        durationMinutes: Number(serviceData.durationMinutes),
        price: Number(serviceData.price),
      },
    });
    if (created) {
      return {
        id: created.id,
        barberId: created.barberId,
        name: created.name,
        durationMinutes: created.durationMinutes,
        price: created.price,
        isActive: created.isActive,
      };
    }
  } catch (err) {
    console.warn('⚡ Using memory store for createService');
  }

  const newService: ServiceType = {
    id: `service-${Date.now()}`,
    barberId: serviceData.barberId,
    name: serviceData.name,
    durationMinutes: Number(serviceData.durationMinutes),
    price: Number(serviceData.price),
    isActive: true,
  };
  inMemoryServices.push(newService);
  return newService;
}

export async function deleteService(serviceId: string): Promise<boolean> {
  try {
    await prisma.service.delete({ where: { id: serviceId } });
    return true;
  } catch (err) {
    console.warn('⚡ Using memory store for deleteService');
  }

  inMemoryServices = inMemoryServices.filter((s) => s.id !== serviceId);
  return true;
}

export async function getBookings(filter?: { barberId?: string; clientId?: string }): Promise<BookingType[]> {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        ...(filter?.barberId && { barberId: filter.barberId }),
        ...(filter?.clientId && { clientId: filter.clientId }),
      },
      include: {
        client: true,
        barber: { include: { user: true } },
        services: { include: { service: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    if (bookings) {
      return bookings.map((b) => ({
        id: b.id,
        clientId: b.clientId,
        barberId: b.barberId,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        totalPrice: b.totalPrice,
        status: b.status as any,
        notes: b.notes,
        client: b.client
          ? {
              id: b.client.id,
              telegramId: b.client.telegramId.toString(),
              role: b.client.role as any,
              fullName: b.client.fullName,
              phone: b.client.phone,
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
  } catch (err) {
    console.warn('⚡ Using memory store for getBookings');
  }

  if (filter?.clientId) {
    return inMemoryBookings.filter((b) => b.clientId === filter.clientId);
  }
  if (filter?.barberId) {
    return inMemoryBookings.filter((b) => b.barberId === filter.barberId);
  }

  return inMemoryBookings;
}

export async function createBooking(data: {
  barberId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceIds: string[];
  startTime: string; // ISO string
}): Promise<BookingType> {
  const services = inMemoryServices.filter((s) => data.serviceIds.includes(s.id));
  const totalDuration = services.reduce((acc, s) => acc + s.durationMinutes, 0) || 30;
  const totalPrice = services.reduce((acc, s) => acc + s.price, 0);

  const startDate = new Date(data.startTime);
  const endDate = new Date(startDate.getTime() + totalDuration * 60 * 1000);

  try {
    // Ensure Client User exists in DB
    const clientUser = await prisma.user.upsert({
      where: { id: data.clientId },
      update: { phone: data.clientPhone, fullName: data.clientName },
      create: {
        id: data.clientId,
        telegramId: BigInt(Date.now()),
        fullName: data.clientName,
        phone: data.clientPhone,
        role: 'CLIENT',
      },
    });

    const booking = await prisma.booking.create({
      data: {
        clientId: clientUser.id,
        barberId: data.barberId,
        startTime: startDate,
        endTime: endDate,
        totalPrice,
        status: 'CONFIRMED',
        services: {
          create: data.serviceIds.map((sid) => ({ serviceId: sid })),
        },
      },
      include: {
        client: true,
        services: { include: { service: true } },
      },
    });

    if (booking) {
      return {
        id: booking.id,
        clientId: booking.clientId,
        barberId: booking.barberId,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        totalPrice: booking.totalPrice,
        status: booking.status as any,
        client: {
          id: clientUser.id,
          telegramId: clientUser.telegramId.toString(),
          role: clientUser.role as any,
          fullName: clientUser.fullName,
          phone: clientUser.phone,
        },
        services: services.map((s) => ({ service: s })),
        createdAt: booking.createdAt.toISOString(),
      };
    }
  } catch (err) {
    console.warn('⚡ Using memory store for createBooking');
  }

  const clientUser: UserType = {
    id: data.clientId,
    telegramId: '998900000000',
    role: 'CLIENT',
    fullName: data.clientName,
    phone: data.clientPhone,
  };

  const newBooking: BookingType = {
    id: `booking-${Date.now()}`,
    clientId: data.clientId,
    barberId: data.barberId,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    totalPrice,
    status: 'CONFIRMED',
    client: clientUser,
    barber: inMemoryProfile,
    services: services.map((s) => ({ service: s })),
    createdAt: new Date().toISOString(),
  };

  inMemoryBookings.push(newBooking);
  return newBooking;
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<BookingType | null> {
  try {
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: status as any },
    });
    if (updated) {
      const all = await getBookings();
      return all.find((b) => b.id === bookingId) || null;
    }
  } catch (err) {
    console.warn('⚡ Using memory store for updateBookingStatus');
  }

  const booking = inMemoryBookings.find((b) => b.id === bookingId);
  if (booking) {
    booking.status = status;
    return { ...booking };
  }
  return null;
}
