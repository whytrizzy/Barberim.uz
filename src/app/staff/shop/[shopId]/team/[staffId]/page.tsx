import type { Metadata } from 'next';
import { TeamMemberScreen } from '@/features/team/team-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ shopId: string; staffId: string }>;
}) {
  const { shopId, staffId } = await params;
  return <TeamMemberScreen shopId={shopId} staffId={staffId} />;
}
