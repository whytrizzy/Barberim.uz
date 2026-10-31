import type { Metadata } from 'next';
import { TeamListScreen } from '@/features/team/team-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function TeamPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <TeamListScreen shopId={shopId} />;
}
