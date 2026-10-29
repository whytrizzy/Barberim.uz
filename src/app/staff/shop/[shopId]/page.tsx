import type { Metadata } from 'next';
import { ShopEditScreen } from '@/features/shop/shop-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { shopId } = await params;
  const { created } = await searchParams;
  return <ShopEditScreen shopId={shopId} justCreated={created === '1'} />;
}
