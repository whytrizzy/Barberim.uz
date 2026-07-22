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
  role: Role;
  fullName: string;
  phone?: string | null;
  createdAt?: string;
}

export interface BarberProfileType {
  id: string;
  userId: string;
  bio: string | null;
  address: string;
  workingHours: WorkingHours;
  user?: UserType;
  services?: ServiceType[];
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
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  notes?: string | null;
  client?: UserType;
  barber?: BarberProfileType;
  services?: { service: ServiceType }[];
  createdAt?: string;
}

export interface TimeSlot {
  time: string; // "10:30"
  isoString: string; // ISO DateTime
  available: boolean;
  reason?: string; // "lunch", "booked", "past"
}
