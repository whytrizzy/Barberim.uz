import type { Metadata } from 'next';
import { ServiceListScreen } from '@/features/services/service-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ServicesPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ServiceListScreen shopId={shopId} />;
}
