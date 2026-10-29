export type Role = 'CLIENT' | 'BARBER';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface WorkingHours {
  workDays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startTime: string; // "09:00"
  endTime: string;   // "20:00"
  breakStart?: string; // "13:00"
  breakEnd?: string;   // "14:00"
  slotDurationMinutes?: number;
}

export interface UserType {
  id: string;
  telegramId: string;
  username?: string | null;
  role: Role;
  fullName: string;
  phone?: string | null;
  createdAt?: string;
}

export interface BarberProfileType {
  id: string;
  userId: string;
  shopName?: string | null;
  bio: string | null;
  address: string | null;
  photoUrl?: string | null;
  workingHours: WorkingHours;
  user?: UserType;
  services?: ServiceType[];
  masters?: MasterType[];
}

/// An individual barber at a shop. Each master has their own calendar.
export interface MasterType {
  id: string;
  shopId: string;
  name: string;
  photoUrl?: string | null;
  specialty?: string | null;
  /// null => inherits the shop's working hours
  workingHours?: WorkingHours | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ServiceType {
  id: string;
  barberId: string;
  name: string;
  durationMinutes: number;
  price: number; // in UZS
  isActive?: boolean;
}

export interface BookingServiceType {
  serviceId: string;
  service?: ServiceType;
}

export interface BookingType {
  id: string;
  clientId: string;
  barberId: string;
  masterId?: string | null;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  notes?: string | null;
  client?: UserType;
  barber?: BarberProfileType;
  master?: MasterType | null;
  services?: { service: ServiceType }[];
  createdAt?: string;
}

export interface TimeSlot {
  time: string; // "10:30"
  isoString: string; // ISO DateTime
  available: boolean;
  reason?: string; // "lunch", "booked", "past"
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  workDays: [1, 2, 3, 4, 5, 6], // Mon - Sat
  startTime: '09:00',
  endTime: '20:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  slotDurationMinutes: 30,
};
