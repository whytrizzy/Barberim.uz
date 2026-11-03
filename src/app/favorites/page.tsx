import type { Metadata } from 'next';
import { FavoritesScreen } from '@/features/favorites/favorites-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default function FavoritesPage() {
  return <FavoritesScreen />;
}
