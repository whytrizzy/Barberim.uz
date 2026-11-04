import type { Metadata } from 'next';
import { ShareKitScreen } from '@/features/shop/share-kit-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function SharePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ShareKitScreen shopId={shopId} />;
}
