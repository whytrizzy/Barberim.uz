import type { Metadata } from 'next';
import { PlanScreen } from '@/features/plans/plan-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function PlanPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <PlanScreen shopId={shopId} />;
}
