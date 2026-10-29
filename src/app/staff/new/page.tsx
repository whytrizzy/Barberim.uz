import type { Metadata } from 'next';
import { ShopCreateScreen } from '@/features/shop/shop-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default function NewShopPage() {
  return <ShopCreateScreen />;
}
