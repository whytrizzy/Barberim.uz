import type { Metadata } from 'next';
import { ScheduleChangeScreen } from '@/features/schedule/schedule-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ScheduleChangePage({
  params,
}: {
  params: Promise<{ shopId: string; staffId: string }>;
}) {
  const { shopId, staffId } = await params;
  return <ScheduleChangeScreen shopId={shopId} staffId={staffId} />;
}
