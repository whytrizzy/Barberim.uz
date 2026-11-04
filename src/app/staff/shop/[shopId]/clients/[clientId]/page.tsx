import type { Metadata } from 'next';
import { ClientScreen } from '@/features/clients/clients-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ClientPage({
  params,
}: {
  params: Promise<{ shopId: string; clientId: string }>;
}) {
  const { shopId, clientId } = await params;
  return <ClientScreen shopId={shopId} clientId={clientId} />;
}
