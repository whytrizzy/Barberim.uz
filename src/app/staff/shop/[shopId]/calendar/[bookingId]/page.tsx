import type { Metadata } from 'next';
import { BookingScreen } from '@/features/calendar/booking-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function BookingPage({
  params,
}: {
  params: Promise<{ shopId: string; bookingId: string }>;
}) {
  const { shopId, bookingId } = await params;
  return <BookingScreen shopId={shopId} bookingId={bookingId} />;
}
