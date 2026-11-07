import type { Metadata } from 'next';
import { DepositSettingsScreen } from '@/features/deposits/settings-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function DepositsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <DepositSettingsScreen shopId={shopId} />;
}
