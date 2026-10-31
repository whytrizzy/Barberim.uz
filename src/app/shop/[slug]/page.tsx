import type { Metadata } from 'next';
import { ShopProfileScreen } from '@/features/shop/shop-profile-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ShopProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShopProfileScreen slug={slug} />;
}
