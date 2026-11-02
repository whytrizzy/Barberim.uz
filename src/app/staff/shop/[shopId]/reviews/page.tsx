import type { Metadata } from 'next';
import { StaffReviewsScreen } from '@/features/reviews/reviews-screens';

export const metadata: Metadata = { title: 'Barberim' };

export default async function ReviewsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <StaffReviewsScreen shopId={shopId} />;
}
