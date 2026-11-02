import type { Metadata } from 'next';
import { DiscoverScreen } from '@/features/shop/discover-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default function DiscoverPage() {
  return <DiscoverScreen />;
}
