import type { Metadata } from 'next';
import { TeamAddScreen } from '@/features/team/team-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function TeamAddPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <TeamAddScreen shopId={shopId} />;
}
