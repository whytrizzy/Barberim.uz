import type { Metadata } from 'next';
import { MyBookingScreen } from '@/features/booking/my-booking-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function MyBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyBookingScreen bookingId={id} />;
}
