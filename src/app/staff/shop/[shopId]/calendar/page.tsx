import type { Metadata } from 'next';
import { CalendarScreen } from '@/features/calendar/calendar-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { shopId } = await params;
  const { date } = await searchParams;
  return <CalendarScreen shopId={shopId} initialDate={date} />;
}
