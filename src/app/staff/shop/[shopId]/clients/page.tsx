import type { Metadata } from 'next';
import { ClientsScreen } from '@/features/clients/clients-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ClientsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ClientsScreen shopId={shopId} />;
}
