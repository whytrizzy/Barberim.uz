import type { Metadata } from 'next';
import { InviteScreen } from '@/features/team/invite-screen';

export const metadata: Metadata = {
  title: 'Barberim',
  // The link grants access to a shop: keep it out of search engines and other sites' logs.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteScreen token={token} />;
}
