import type { Metadata } from 'next';
import { ServiceEditScreen } from '@/features/services/service-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ServicePage({
  params,
}: {
  params: Promise<{ shopId: string; serviceId: string }>;
}) {
  const { shopId, serviceId } = await params;
  return <ServiceEditScreen shopId={shopId} serviceId={serviceId} />;
}
