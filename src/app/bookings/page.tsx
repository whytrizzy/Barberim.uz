import type { Metadata } from 'next';
import { MyBookingsScreen } from '@/features/booking/my-bookings-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default function BookingsPage() {
  return <MyBookingsScreen />;
}
