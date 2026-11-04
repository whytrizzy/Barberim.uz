import type { Metadata } from 'next';
import { EarningsScreen } from '@/features/earnings/earnings-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function EarningsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <EarningsScreen shopId={shopId} />;
}
