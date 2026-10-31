import type { Metadata } from 'next';
import { AddBookingScreen } from '@/features/calendar/add-booking-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function NewBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ date?: string; staff?: string; start?: string }>;
}) {
  const { shopId } = await params;
  const { date, staff, start } = await searchParams;
  return (
    <AddBookingScreen
      shopId={shopId}
      initialDate={date}
      initialStaffId={staff}
      initialStart={start === undefined ? undefined : Number(start)}
    />
  );
}
