import { UserType, BarberProfileType, ServiceType, BookingType, WorkingHours } from '@/types';

export const MOCK_WORKING_HOURS: WorkingHours = {
  workDays: [1, 2, 3, 4, 5, 6], // Mon - Sat
  startTime: '09:00',
  endTime: '20:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  slotDurationMinutes: 30,
};

export const MOCK_BARBER_USER: UserType = {
  id: 'barber-user-1',
  telegramId: '998901234567',
  role: 'BARBER',
  fullName: 'Sardor Barber',
  phone: '+998 90 123 45 67',
  createdAt: new Date().toISOString(),
};

export const MOCK_CLIENT_USER: UserType = {
  id: 'client-user-1',
  telegramId: '998935551234',
  role: 'CLIENT',
  fullName: 'Davron Alimov',
  phone: '+998 93 555 12 34',
  createdAt: new Date().toISOString(),
};

export const MOCK_BARBER_PROFILE: BarberProfileType = {
  id: 'barber-profile-1',
  userId: MOCK_BARBER_USER.id,
  bio: 'Master Barber with 8+ years of expertise. Specializing in classic fades, hot towel beard modeling, and luxury grooming.',
  address: 'Amir Temur Avenue 42, Chilanzar district, Tashkent',
  workingHours: MOCK_WORKING_HOURS,
  user: MOCK_BARBER_USER,
};

export const MOCK_SERVICES: ServiceType[] = [
  {
    id: 'service-1',
    barberId: MOCK_BARBER_PROFILE.id,
    name: 'Classic Men Haircut',
    durationMinutes: 45,
    price: 100000, // 100,000 UZS
    isActive: true,
  },
  {
    id: 'service-2',
    barberId: MOCK_BARBER_PROFILE.id,
    name: 'Beard Trim & Hot Towel',
    durationMinutes: 30,
    price: 60000, // 60,000 UZS
    isActive: true,
  },
  {
    id: 'service-3',
    barberId: MOCK_BARBER_PROFILE.id,
    name: 'VIP Combo (Haircut + Beard + Facial)',
    durationMinutes: 75,
    price: 190000, // 190,000 UZS
    isActive: true,
  },
  {
    id: 'service-4',
    barberId: MOCK_BARBER_PROFILE.id,
    name: 'Junior Haircut (Under 12)',
    durationMinutes: 30,
    price: 70000, // 70,000 UZS
    isActive: true,
  },
];

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(10, 0, 0, 0);

const tomorrowEnd = new Date(tomorrow);
tomorrowEnd.setMinutes(tomorrowEnd.getMinutes() + 45);

export const INITIAL_MOCK_BOOKINGS: BookingType[] = [
  {
    id: 'booking-1',
    clientId: MOCK_CLIENT_USER.id,
    barberId: MOCK_BARBER_PROFILE.id,
    startTime: tomorrow.toISOString(),
    endTime: tomorrowEnd.toISOString(),
    totalPrice: 100000,
    status: 'CONFIRMED',
    client: MOCK_CLIENT_USER,
    barber: MOCK_BARBER_PROFILE,
    services: [{ service: MOCK_SERVICES[0] }],
    createdAt: new Date().toISOString(),
  },
];
