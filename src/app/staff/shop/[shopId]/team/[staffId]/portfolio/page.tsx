import type { Metadata } from 'next';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';

export const metadata: Metadata = { title: 'Barberim' };

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ shopId: string; staffId: string }>;
}) {
  const { shopId, staffId } = await params;
  return <PortfolioScreen shopId={shopId} staffId={staffId} />;
}
