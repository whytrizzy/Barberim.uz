import type { Metadata } from 'next';
import { ScheduleScreen } from '@/features/schedule/schedule-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ shopId: string; staffId: string }>;
}) {
  const { shopId, staffId } = await params;
  return <ScheduleScreen shopId={shopId} staffId={staffId} />;
}
