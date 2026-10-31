import type { Metadata } from 'next';
import { ServiceEditScreen } from '@/features/services/service-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function NewServicePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ServiceEditScreen shopId={shopId} serviceId={null} />;
}
